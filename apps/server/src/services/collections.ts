import { collectionStatus, EQUIP_SLOTS, RARITIES, type CollectionView, type EquipSlot } from '@casino/shared';
import { eq, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { users } from '../db/schema';
import { fail } from '../errors';
import { audit } from './audit';
import { SLOT_COLUMNS } from './catalog';
import { userRoleIds } from './rbac';

/**
 * Seasonal collections: a dated sale window over existing catalog items (frames, card backs, table
 * skins, victory effects, chat bubbles, titles). Status is derived: draft until the Owner approves
 * it, then scheduled → active → ended by its dates (or ended early). Ending a sale never touches
 * inventories or the ledger: what was bought stays owned and equippable. A new year is a new
 * collection id (e.g. halloween_2027); items of earlier years are never overwritten.
 */

type Row = {
  id: string;
  theme: string;
  year: number;
  name_vi: string;
  name_en: string;
  desc_vi: string | null;
  desc_en: string | null;
  starts_at: Date;
  ends_at: Date;
  timezone: string;
  approved_at: Date | null;
  ended_at: Date | null;
  rerun_of: string | null;
};
const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

async function offersOf(db: DbOrTx, ids: string[]) {
  if (!ids.length) return new Map<string, CollectionView['items']>();
  const rows = await db.execute<{ collection_id: string; item_id: string; price: string; currency: 'silver' | 'gold'; sort: number }>(sql`
    SELECT collection_id, item_id, price, currency, sort FROM collection_items WHERE collection_id = ANY(string_to_array(${ids.join(',')}, ',')) ORDER BY sort, item_id`);
  const out = new Map<string, CollectionView['items']>();
  for (const r of rows) out.set(r.collection_id, [...(out.get(r.collection_id) ?? []), { itemId: r.item_id, price: Number(r.price), currency: r.currency, sort: r.sort }]);
  return out;
}

function toView(r: Row, items: CollectionView['items']): CollectionView {
  const startsAt = iso(r.starts_at)!;
  const endsAt = iso(r.ends_at)!;
  return {
    id: r.id,
    theme: r.theme,
    year: r.year,
    name: { vi: r.name_vi, en: r.name_en },
    description: r.desc_vi || r.desc_en ? { vi: r.desc_vi ?? r.desc_en ?? '', en: r.desc_en ?? r.desc_vi ?? '' } : null,
    startsAt,
    endsAt,
    timezone: r.timezone,
    status: collectionStatus({ approvedAt: iso(r.approved_at), startsAt, endsAt, endedAt: iso(r.ended_at) }),
    rerunOf: r.rerun_of,
    items,
  };
}

/** Collections players may see: approved ones (scheduled, active or ended). Drafts stay private. */
export async function publicCollections(db: DbOrTx): Promise<CollectionView[]> {
  const rows = await db.execute<Row>(sql`SELECT * FROM cosmetic_collections WHERE approved_at IS NOT NULL ORDER BY starts_at DESC`);
  const offers = await offersOf(db, rows.map((r) => r.id));
  return rows.map((r) => toView(r, offers.get(r.id) ?? []));
}

export async function adminCollections(db: DbOrTx): Promise<CollectionView[]> {
  const rows = await db.execute<Row>(sql`SELECT * FROM cosmetic_collections ORDER BY starts_at DESC`);
  const offers = await offersOf(db, rows.map((r) => r.id));
  return rows.map((r) => toView(r, offers.get(r.id) ?? []));
}

export interface CollectionInput {
  theme: string;
  year: number;
  nameVi: string;
  nameEn: string;
  descVi?: string | null;
  descEn?: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  items: { itemId: string; price: number; currency: 'silver' | 'gold'; sort?: number }[];
}

/** Creates or edits a collection (items.manage). Editing never approves it. */
export async function saveCollection(db: Db, actorId: string, id: string, input: CollectionInput, ip?: string): Promise<CollectionView> {
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) throw fail('bad_request', 'ends before it starts');
  return db.transaction(async (tx) => {
    const ids = [...new Set(input.items.map((i) => i.itemId))];
    if (ids.length !== input.items.length) throw fail('bad_request', 'duplicate item');
    if (ids.length) {
      const found = await tx.execute<{ id: string; source: string; status: string }>(sql`SELECT id, source, status FROM catalog_items WHERE id = ANY(string_to_array(${ids.join(',')}, ','))`);
      if (found.length !== ids.length) throw fail('item_not_found');
      // Role frames are privileges, never goods.
      if (found.some((f) => f.source === 'role')) throw fail('forbidden');
    }
    await tx.execute(sql`
      INSERT INTO cosmetic_collections (id, theme, year, name_vi, name_en, desc_vi, desc_en, starts_at, ends_at, timezone, updated_by)
      VALUES (${id}, ${input.theme}, ${input.year}, ${input.nameVi}, ${input.nameEn}, ${input.descVi ?? null}, ${input.descEn ?? null}, ${input.startsAt}::timestamptz, ${input.endsAt}::timestamptz, ${input.timezone}, ${actorId}::uuid)
      ON CONFLICT (id) DO UPDATE SET theme = EXCLUDED.theme, year = EXCLUDED.year, name_vi = EXCLUDED.name_vi, name_en = EXCLUDED.name_en, desc_vi = EXCLUDED.desc_vi, desc_en = EXCLUDED.desc_en,
        starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, timezone = EXCLUDED.timezone, updated_by = EXCLUDED.updated_by, updated_at = now()`);
    await tx.execute(sql`DELETE FROM collection_items WHERE collection_id = ${id}`);
    for (const [i, it] of input.items.entries()) {
      await tx.execute(sql`INSERT INTO collection_items (collection_id, item_id, price, currency, sort) VALUES (${id}, ${it.itemId}, ${it.price}, ${it.currency}, ${it.sort ?? i})`);
    }
    await audit(tx, { actorId, action: 'collection.save', targetType: 'collection', targetId: id, details: { startsAt: input.startsAt, endsAt: input.endsAt, items: input.items }, ip });
    const [row] = await tx.execute<Row>(sql`SELECT * FROM cosmetic_collections WHERE id = ${id}`);
    return toView(row!, (await offersOf(tx, [id])).get(id) ?? []);
  });
}

/** Only an Owner approves a collection for sale (it then opens on its start date). */
export async function approveCollection(db: Db, actorId: string, id: string, ip?: string) {
  if (!(await userRoleIds(db, actorId)).includes('owner')) throw fail('forbidden');
  const rows = await db.execute(sql`UPDATE cosmetic_collections SET approved_at = now(), approved_by = ${actorId}::uuid, ended_at = NULL, updated_at = now() WHERE id = ${id} AND approved_at IS NULL RETURNING id`);
  if (!rows.length) throw fail('bad_request', 'unknown or already approved');
  await audit(db, { actorId, action: 'collection.approve', targetType: 'collection', targetId: id, ip });
}

/** Stops a sale early (items stay owned; no refunds, no ledger change). */
export async function endCollection(db: Db, actorId: string, id: string, ip?: string) {
  const rows = await db.execute(sql`UPDATE cosmetic_collections SET ended_at = now(), updated_at = now() WHERE id = ${id} AND ended_at IS NULL RETURNING id`);
  if (!rows.length) throw fail('not_found');
  await audit(db, { actorId, action: 'collection.end', targetType: 'collection', targetId: id, ip });
}

/** Re-release: a new draft collection with the same items and prices, for another window. */
export async function rerunCollection(db: Db, actorId: string, sourceId: string, input: { id: string; year: number; startsAt: string; endsAt: string }, ip?: string) {
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) throw fail('bad_request');
  return db.transaction(async (tx) => {
    const [src] = await tx.execute<Row>(sql`SELECT * FROM cosmetic_collections WHERE id = ${sourceId}`);
    if (!src) throw fail('not_found');
    const created = await tx.execute(sql`
      INSERT INTO cosmetic_collections (id, theme, year, name_vi, name_en, desc_vi, desc_en, starts_at, ends_at, timezone, rerun_of, updated_by)
      VALUES (${input.id}, ${src.theme}, ${input.year}, ${src.name_vi.replace(String(src.year), String(input.year))}, ${src.name_en.replace(String(src.year), String(input.year))}, ${src.desc_vi}, ${src.desc_en},
        ${input.startsAt}::timestamptz, ${input.endsAt}::timestamptz, ${src.timezone}, ${sourceId}, ${actorId}::uuid)
      ON CONFLICT (id) DO NOTHING RETURNING id`);
    if (!created.length) throw fail('already_owned');
    await tx.execute(sql`INSERT INTO collection_items (collection_id, item_id, price, currency, sort) SELECT ${input.id}, item_id, price, currency, sort FROM collection_items WHERE collection_id = ${sourceId}`);
    await audit(tx, { actorId, action: 'collection.rerun', targetType: 'collection', targetId: input.id, details: { from: sourceId }, ip });
    return input.id;
  });
}

const RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i]));

/**
 * Equips, slot by slot, the collection items the player owns (the rarest frame if several). Never
 * buys anything; a role frame currently worn is kept unless the player confirmed replacing it.
 */
export async function equipCollectionSet(db: Db, userId: string, collectionId: string, replaceRoleFrame = false) {
  return db.transaction(async (tx) => {
    const items = await tx.execute<{ id: string; kind: string; rarity: string; owned: boolean }>(sql`
      SELECT c.id, c.kind, c.rarity,
        EXISTS (SELECT 1 FROM inventory_items i WHERE i.user_id = ${userId}::uuid AND i.item_id = c.id AND (i.expires_at IS NULL OR i.expires_at > now())) AS owned
      FROM collection_items o JOIN catalog_items c ON c.id = o.item_id WHERE o.collection_id = ${collectionId}`);
    if (!items.length) throw fail('not_found');
    const [me] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
    const equipped: Partial<Record<EquipSlot, string>> = {};
    const missing: string[] = [];
    let keptRoleFrame = false;
    for (const slot of EQUIP_SLOTS) {
      const candidates = items.filter((i) => i.kind === slot);
      if (!candidates.length) continue;
      const owned = candidates.filter((i) => i.owned).sort((a, b) => (RANK[b.rarity] ?? 0) - (RANK[a.rarity] ?? 0));
      missing.push(...candidates.filter((i) => !i.owned).map((i) => i.id));
      if (!owned.length) continue;
      if (slot === 'frame' && me!.frame.startsWith('role_') && !replaceRoleFrame) {
        keptRoleFrame = true;
        continue;
      }
      equipped[slot] = owned[0]!.id;
    }
    const patch: Record<string, string> = {};
    for (const [slot, id] of Object.entries(equipped)) patch[SLOT_COLUMNS[slot as EquipSlot].key] = id;
    const [row] = Object.keys(patch).length ? await tx.update(users).set(patch).where(eq(users.id, userId)).returning() : [me!];
    return { user: row!, equipped, missing, keptRoleFrame };
  });
}


