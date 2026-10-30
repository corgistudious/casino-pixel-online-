import {
  DEFAULT_FRAME,
  DEFAULT_TABLE_SKIN,
  UNIQUE_ITEM_KINDS,
  type EquipSlot,
  type CatalogItem,
  type FrameRender,
  type InventoryEntry,
  type ItemKind,
  type ItemSource,
  type ItemStatus,
  type Rarity,
} from '@casino/shared';
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
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
    priceGold: row.priceGold,
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

/** Usable now: permanent, or timed and not expired yet. */
const activeRow = () => or(isNull(inventoryItems.expiresAt), gt(inventoryItems.expiresAt, sql`now()`));

export async function inventoryOf(db: DbOrTx, userId: string): Promise<InventoryEntry[]> {
  const rows = await db
    .select({ instanceId: inventoryItems.id, itemId: inventoryItems.itemId, kind: inventoryItems.kind, source: inventoryItems.source, acquiredAt: inventoryItems.acquiredAt, expiresAt: inventoryItems.expiresAt })
    .from(inventoryItems)
    .where(eq(inventoryItems.userId, userId))
    .orderBy(desc(inventoryItems.acquiredAt));
  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    kind: r.kind as ItemKind,
    source: r.source as ItemSource,
    acquiredAt: r.acquiredAt.toISOString(),
    expiresAt: r.expiresAt?.toISOString() ?? null,
    active: !r.expiresAt || r.expiresAt.getTime() > now,
  }));
}

/** Frame ids a player can equip: the free default plus every owned, unexpired frame. */
export async function ownedFrames(db: DbOrTx, userId: string): Promise<string[]> {
  const rows = await db
    .select({ itemId: inventoryItems.itemId })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.kind, 'frame'), activeRow()));
  return [DEFAULT_FRAME, ...rows.map((r) => r.itemId).filter((id) => id !== DEFAULT_FRAME)];
}

export type GrantOutcome = 'granted' | 'already_owned' | 'extended' | 'expired';

/**
 * Gives one item to a player inside the caller's transaction. Equippable items are unique per
 * player (the unique index makes this race-free): a second copy is not created. Timed items carry
 * an absolute `expiresAt`: granting again extends a shorter expiry (never shortens it), a
 * permanent copy makes it permanent, and an already-expired grant is only recorded as history.
 * Draft items can never be granted.
 */
export async function grantItem(
  tx: DbOrTx,
  userId: string,
  itemId: string,
  source: ItemSource,
  sourceRef: string | null,
  expiresAt: Date | null = null,
): Promise<GrantOutcome> {
  const item = await getCatalogRow(tx, itemId);
  if (!item || item.status === 'draft') throw fail('item_not_found');
  // Role frames are worn by holding the role, never owned (the database refuses it as well).
  if (item.source === 'role') throw fail('forbidden');
  const expired = !!expiresAt && expiresAt.getTime() <= Date.now();
  if (UNIQUE_ITEM_KINDS.includes(item.kind as ItemKind)) {
    const inserted = await tx.insert(inventoryItems).values({ userId, itemId, kind: item.kind, source, sourceRef, expiresAt }).onConflictDoNothing().returning({ id: inventoryItems.id });
    if (inserted.length) return expired ? 'expired' : 'granted';
    if (expired) return 'expired';
    const [owned] = await tx
      .select({ id: inventoryItems.id, expiresAt: inventoryItems.expiresAt })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.itemId, itemId)))
      .for('update');
    if (!owned?.expiresAt) return 'already_owned'; // already permanent
    if (expiresAt && expiresAt <= owned.expiresAt) return 'already_owned';
    await tx.update(inventoryItems).set({ expiresAt, source, sourceRef }).where(eq(inventoryItems.id, owned.id));
    return 'extended';
  }
  await tx.insert(inventoryItems).values({ userId, itemId, kind: item.kind, source, sourceRef, expiresAt });
  return expired ? 'expired' : 'granted';
}

/**
 * Where an item can be bought right now and for how much, decided on the server only:
 *  - items listed in a seasonal collection are sold only while one of those collections is
 *    approved by the Owner and inside its window, at the collection's price and currency;
 *  - other released items at their shop price (Cxu Bạc or Cxu Vàng).
 * Returns null when the item is not on sale.
 */
export async function saleOffer(db: DbOrTx, itemId: string, now = new Date()): Promise<{ price: number; currency: 'silver' | 'gold'; collectionId: string | null } | null> {
  const item = await getCatalogRow(db, itemId);
  if (!item || item.status !== 'released' || item.source === 'role') return null;
  const offers = await db.execute<{ collection_id: string; price: string; currency: 'silver' | 'gold'; live: boolean }>(sql`
    SELECT o.collection_id, o.price, o.currency,
      (c.approved_at IS NOT NULL AND c.ended_at IS NULL AND c.starts_at <= ${now.toISOString()}::timestamptz AND c.ends_at > ${now.toISOString()}::timestamptz) AS live
    FROM collection_items o JOIN cosmetic_collections c ON c.id = o.collection_id
    WHERE o.item_id = ${itemId} ORDER BY live DESC, o.price ASC`);
  if (offers.length) {
    const live = offers.find((o) => o.live);
    return live ? { price: Number(live.price), currency: live.currency, collectionId: live.collection_id } : null;
  }
  if (item.priceSilver !== null) return { price: item.priceSilver, currency: 'silver', collectionId: null };
  if (item.priceGold !== null) return { price: item.priceGold, currency: 'gold', collectionId: null };
  return null;
}

/**
 * Buys an item: price and currency come from saleOffer (never from the client), the debit and the
 * ownership happen in one transaction, and the unique inventory index makes a second purchase
 * (double tap, retry, two tabs) fail with already_owned without charging. `expected` guards against
 * a price that changed while the page was open.
 */
export async function buyItem(db: Db, userId: string, itemId: string, expected: { price?: number; currency?: 'silver' | 'gold' } = {}): Promise<void> {
  if (itemId === DEFAULT_FRAME || itemId === DEFAULT_TABLE_SKIN) throw fail('already_owned');
  await db.transaction(async (tx) => {
    const offer = await saleOffer(tx, itemId);
    if (!offer) throw fail('item_not_found');
    if ((expected.price !== undefined && expected.price !== offer.price) || (expected.currency && expected.currency !== offer.currency)) throw fail('gift_price_changed');
    if ((await grantItem(tx, userId, itemId, offer.collectionId ? 'season' : 'shop', offer.collectionId)) !== 'granted') throw fail('already_owned');
    if (offer.price > 0) await applyDelta(tx, userId, -offer.price, 'shop', null, offer.currency, `item:${itemId}`);
  });
}

/** Owns a usable (permanent or unexpired) copy. */
async function ownsActive(db: DbOrTx, userId: string, itemId: string): Promise<'yes' | 'expired' | 'no'> {
  const [row] = await db
    .select({ expiresAt: inventoryItems.expiresAt })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.itemId, itemId)))
    .orderBy(sql`${inventoryItems.expiresAt} IS NULL DESC, ${inventoryItems.expiresAt} DESC`)
    .limit(1);
  if (!row) return 'no';
  return !row.expiresAt || row.expiresAt.getTime() > Date.now() ? 'yes' : 'expired';
}

/** Whether the player currently holds the role (and, for Owner variants, the UID) a role frame needs. */
export async function roleFrameAllowed(db: DbOrTx, userId: string, itemId: string): Promise<boolean> {
  const [r] = await db.execute<{ ok: boolean }>(sql`SELECT keyo_role_frame_allowed(${userId}::uuid, ${itemId}) AS ok`);
  return !!r?.ok;
}

/** Role frames the player may wear right now (shown in the Frame Library next to owned frames). */
export async function allowedRoleFrames(db: DbOrTx, userId: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT c.id FROM catalog_items c WHERE c.source = 'role' AND c.kind = 'frame' AND c.status <> 'draft' AND keyo_role_frame_allowed(${userId}::uuid, c.id) ORDER BY c.sort`);
  return rows.map((r) => r.id);
}

/** users column holding each slot, and the value meaning "nothing equipped". */
export const SLOT_COLUMNS = {
  frame: { column: 'frame', key: 'frame', empty: 'none' },
  avatar: { column: 'avatar_item', key: 'avatarItem', empty: null },
  title: { column: 'equipped_title', key: 'equippedTitle', empty: null },
  chat_bubble: { column: 'equipped_bubble', key: 'equippedBubble', empty: null },
  card_back: { column: 'equipped_card_back', key: 'equippedCardBack', empty: null },
  table_skin: { column: 'equipped_table_skin', key: 'equippedTableSkin', empty: null },
  victory_effect: { column: 'equipped_victory_effect', key: 'equippedVictoryEffect', empty: null },
} as const satisfies Record<EquipSlot, { column: string; key: keyof typeof users.$inferSelect; empty: string | null }>;

/**
 * Equips or removes (null) an item in a slot. Only owned, unexpired items of the slot's kind can
 * be equipped; hidden items stay usable by their owners.
 */
export async function equip(db: Db, userId: string, slot: EquipSlot, itemId: string | null) {
  if (itemId !== null) {
    const item = await getCatalogRow(db, itemId);
    if (!item || item.status === 'draft' || item.kind !== slot) throw fail('item_not_found');
    if (slot === 'table_skin' && itemId === DEFAULT_TABLE_SKIN) {
      // The classic table belongs to everyone.
    } else if (item.source === 'role') {
      // Checked against the player's real roles (server-side RBAC), never against anything sent.
      if (!(await roleFrameAllowed(db, userId, itemId))) throw fail('not_owned');
    } else if (!(slot === 'frame' && itemId === DEFAULT_FRAME)) {
      const owned = await ownsActive(db, userId, itemId);
      if (owned === 'no') throw fail('not_owned');
      if (owned === 'expired') throw fail('item_expired');
    }
  }
  const s = SLOT_COLUMNS[slot];
  const [row] = await db.update(users).set({ [s.key]: itemId ?? s.empty }).where(eq(users.id, userId)).returning();
  return row!;
}

/**
 * Unequips every expired timed item, for all players (run periodically). Profiles, chat and tables
 * read the equipped columns, so this is what makes an expired item disappear everywhere. Returns
 * the affected user ids.
 */
export async function sweepExpiredEquipment(db: DbOrTx): Promise<string[]> {
  const affected = new Set<string>();
  for (const [slot, s] of Object.entries(SLOT_COLUMNS)) {
    const fallback = slot === 'frame' ? DEFAULT_FRAME : null;
    const rows = (await db.execute(sql`
      UPDATE users u SET ${sql.raw(s.column)} = ${fallback}
      WHERE EXISTS (SELECT 1 FROM inventory_items i WHERE i.user_id = u.id AND i.item_id = u.${sql.raw(s.column)} AND i.expires_at IS NOT NULL AND i.expires_at <= now())
        AND NOT EXISTS (SELECT 1 FROM inventory_items i WHERE i.user_id = u.id AND i.item_id = u.${sql.raw(s.column)} AND (i.expires_at IS NULL OR i.expires_at > now()))
      RETURNING u.id`)) as unknown as { id: string }[];
    rows.forEach((r) => affected.add(r.id));
  }
  return [...affected];
}

/**
 * The player's equipment as it may be shown right now: an equipped item that expired since the
 * last sweep is already reported as removed.
 */
export async function effectiveEquipment(db: DbOrTx, user: typeof users.$inferSelect) {
  const equipped = {
    frame: user.frame,
    avatarItem: user.avatarItem,
    title: user.equippedTitle,
    chatBubble: user.equippedBubble,
    cardBack: user.equippedCardBack,
    tableSkin: user.equippedTableSkin,
    victoryEffect: user.equippedVictoryEffect,
  };
  const ids = Object.values(equipped).filter((v): v is string => !!v && v !== 'none' && v !== DEFAULT_FRAME);
  if (!ids.length) return equipped;
  const expired = await db
    .select({ itemId: inventoryItems.itemId })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.userId, user.id), inArray(inventoryItems.itemId, ids), sql`${inventoryItems.expiresAt} IS NOT NULL AND ${inventoryItems.expiresAt} <= now()`));
  const gone = new Set(expired.map((e) => e.itemId));
  if (!gone.size) return equipped;
  return {
    frame: gone.has(equipped.frame) ? DEFAULT_FRAME : equipped.frame,
    avatarItem: equipped.avatarItem && gone.has(equipped.avatarItem) ? null : equipped.avatarItem,
    title: equipped.title && gone.has(equipped.title) ? null : equipped.title,
    chatBubble: equipped.chatBubble && gone.has(equipped.chatBubble) ? null : equipped.chatBubble,
    cardBack: equipped.cardBack && gone.has(equipped.cardBack) ? null : equipped.cardBack,
    tableSkin: equipped.tableSkin && gone.has(equipped.tableSkin) ? null : equipped.tableSkin,
    victoryEffect: equipped.victoryEffect && gone.has(equipped.victoryEffect) ? null : equipped.victoryEffect,
  };
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
    if ((await ownsActive(tx, row.userId, row.itemId)) !== 'yes' && row.kind in SLOT_COLUMNS) {
      const s = SLOT_COLUMNS[row.kind as EquipSlot];
      const fallback = row.kind === 'frame' ? DEFAULT_FRAME : null;
      await tx.execute(sql`UPDATE users SET ${sql.raw(s.column)} = ${fallback} WHERE id = ${row.userId} AND ${sql.raw(s.column)} = ${row.itemId}`);
    }
    return row;
  });
}

export async function itemsExist(db: DbOrTx, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.select({ id: catalogItems.id }).from(catalogItems).where(and(inArray(catalogItems.id, ids), ne(catalogItems.status, 'draft')));
  return new Set(rows.map((r) => r.id));
}
