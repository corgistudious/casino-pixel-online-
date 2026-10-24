import {
  DEFAULT_FRAME,
  UNIQUE_ITEM_KINDS,
  type CatalogItem,
  type FrameRender,
  type InventoryEntry,
  type ItemKind,
  type ItemSource,
  type ItemStatus,
  type Rarity,
} from '@casino/shared';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { assets, catalogItems, inventoryItems, users } from '../db/schema';
import { fail } from '../errors';
import { assetUrl } from './assets';
import { applyDelta } from './wallet';

type CatalogRow = typeof catalogItems.$inferSelect;

export function toCatalogItem(row: CatalogRow, animatedAsset = false): CatalogItem {
  const style = (row.style as CatalogItem['style']) ?? null;
  return {
    id: row.id,
    kind: row.kind as ItemKind,
    name: { vi: row.nameVi, en: row.nameEn },
    description: row.descVi || row.descEn ? { vi: row.descVi ?? row.descEn ?? '', en: row.descEn ?? row.descVi ?? '' } : null,
    rarity: row.rarity as Rarity,
    source: row.source as ItemSource,
    tradable: row.tradable,
    status: row.status as ItemStatus,
    assetUrl: row.assetId ? assetUrl(row.assetId) : null,
    animated: animatedAsset || !!style?.animated,
    render: (row.render as FrameRender | null) ?? null,
    style,
    priceSilver: row.priceSilver,
  };
}

async function rowsWithAnimation(db: DbOrTx, where?: ReturnType<typeof eq>) {
  const rows = await db
    .select({ item: catalogItems, animated: assets.animated })
    .from(catalogItems)
    .leftJoin(assets, eq(assets.id, catalogItems.assetId))
    .where(where)
    .orderBy(asc(catalogItems.kind), asc(catalogItems.sort), asc(catalogItems.id));
  return rows.map((r) => toCatalogItem(r.item, !!r.animated));
}

/** Everything players may see: released items plus hidden ones (still owned and displayed). */
export async function publicCatalog(db: DbOrTx): Promise<CatalogItem[]> {
  return rowsWithAnimation(db, ne(catalogItems.status, 'draft'));
}

/** Staff view, including drafts and how many players own each item. */
export async function adminCatalog(db: DbOrTx) {
  const items = await rowsWithAnimation(db);
  const counts = await db.execute<{ item_id: string; n: string }>(sql`SELECT item_id, count(*) AS n FROM inventory_items GROUP BY item_id`);
  const owners = new Map(counts.map((c) => [c.item_id, Number(c.n)]));
  return items.map((i) => ({ ...i, owners: owners.get(i.id) ?? 0 }));
}

export async function getCatalogRow(db: DbOrTx, id: string): Promise<CatalogRow | null> {
  const [row] = await db.select().from(catalogItems).where(eq(catalogItems.id, id));
  return row ?? null;
}

export async function inventoryOf(db: DbOrTx, userId: string): Promise<InventoryEntry[]> {
  const rows = await db
    .select({ instanceId: inventoryItems.id, itemId: inventoryItems.itemId, kind: inventoryItems.kind, source: inventoryItems.source, acquiredAt: inventoryItems.acquiredAt })
    .from(inventoryItems)
    .where(eq(inventoryItems.userId, userId))
    .orderBy(desc(inventoryItems.acquiredAt));
  return rows.map((r) => ({ ...r, kind: r.kind as ItemKind, source: r.source as ItemSource, acquiredAt: r.acquiredAt.toISOString() }));
}

/** Frame ids a player can equip: the free default plus every owned frame. */
export async function ownedFrames(db: DbOrTx, userId: string): Promise<string[]> {
  const rows = await db
    .select({ itemId: inventoryItems.itemId })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.kind, 'frame')));
  return [DEFAULT_FRAME, ...rows.map((r) => r.itemId).filter((id) => id !== DEFAULT_FRAME)];
}

/**
 * Gives one item to a player inside the caller's transaction. Frames and avatars are unique per
 * player: a second copy is not created and the outcome says so (the unique index makes this
 * race-free). Draft items can never be granted.
 */
export async function grantItem(tx: DbOrTx, userId: string, itemId: string, source: ItemSource, sourceRef: string | null): Promise<'granted' | 'already_owned'> {
  const item = await getCatalogRow(tx, itemId);
  if (!item || item.status === 'draft') throw fail('item_not_found');
  if (UNIQUE_ITEM_KINDS.includes(item.kind as ItemKind)) {
    const inserted = await tx.insert(inventoryItems).values({ userId, itemId, kind: item.kind, source, sourceRef }).onConflictDoNothing().returning({ id: inventoryItems.id });
    return inserted.length ? 'granted' : 'already_owned';
  }
  await tx.insert(inventoryItems).values({ userId, itemId, kind: item.kind, source, sourceRef });
  return 'granted';
}

/** Buys a released shop item with Cxu Bạc: debit and ownership in one transaction. */
export async function buyItem(db: Db, userId: string, itemId: string): Promise<void> {
  const item = await getCatalogRow(db, itemId);
  if (!item || item.status !== 'released' || item.priceSilver === null) throw fail('item_not_found');
  if (item.id === DEFAULT_FRAME || item.priceSilver === 0) throw fail('already_owned');
  await db.transaction(async (tx) => {
    if ((await grantItem(tx, userId, itemId, 'shop', null)) === 'already_owned') throw fail('already_owned');
    await applyDelta(tx, userId, -item.priceSilver!, 'shop', null, 'silver', `item:${itemId}`);
  });
}

async function owns(db: DbOrTx, userId: string, itemId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.itemId, itemId)))
    .limit(1);
  return !!row;
}

/**
 * Equips or removes a frame / special avatar. `null` removes it (no frame, or back to the default
 * avatar). Only owned items can be equipped; hidden items stay usable by their owners.
 */
export async function equip(db: Db, userId: string, slot: 'frame' | 'avatar', itemId: string | null) {
  if (itemId !== null) {
    const item = await getCatalogRow(db, itemId);
    if (!item || item.status === 'draft' || item.kind !== slot) throw fail('item_not_found');
    if (!(slot === 'frame' && itemId === DEFAULT_FRAME) && !(await owns(db, userId, itemId))) throw fail('not_owned');
  }
  const patch = slot === 'frame' ? { frame: itemId ?? 'none' } : { avatarItem: itemId };
  const [row] = await db.update(users).set(patch).where(eq(users.id, userId)).returning();
  return row!;
}

/** Owners of an item, newest first. */
export async function ownersOf(db: DbOrTx, itemId: string, limit: number, offset: number) {
  return db
    .select({ instanceId: inventoryItems.id, uid: users.uid, username: users.username, source: inventoryItems.source, acquiredAt: inventoryItems.acquiredAt })
    .from(inventoryItems)
    .innerJoin(users, eq(users.id, inventoryItems.userId))
    .where(eq(inventoryItems.itemId, itemId))
    .orderBy(desc(inventoryItems.acquiredAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Removes one owned instance (a grant made by mistake). Unequips it first so no profile shows
 * an item its player no longer owns.
 */
export async function revokeInstance(db: Db, instanceId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.delete(inventoryItems).where(eq(inventoryItems.id, instanceId)).returning();
    if (!row) throw fail('not_found');
    const stillOwned = await owns(tx, row.userId, row.itemId);
    if (!stillOwned) {
      if (row.kind === 'frame') await tx.update(users).set({ frame: DEFAULT_FRAME }).where(and(eq(users.id, row.userId), eq(users.frame, row.itemId)));
      if (row.kind === 'avatar') await tx.update(users).set({ avatarItem: null }).where(and(eq(users.id, row.userId), eq(users.avatarItem, row.itemId)));
    }
    return row;
  });
}

export async function itemsExist(db: DbOrTx, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.select({ id: catalogItems.id }).from(catalogItems).where(and(inArray(catalogItems.id, ids), ne(catalogItems.status, 'draft')));
  return new Set(rows.map((r) => r.id));
}
