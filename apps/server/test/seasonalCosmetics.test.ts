import { randomUUID } from 'node:crypto';
import { COLLECTION_SEEDS, FRAME_LIBRARY } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uncoveredForeignKeys } from '../src/maintenance/testData';
import { applyDelta } from '../src/services/wallet';
import { createOwner, createStaff, randomIp, register, startTestApp, type TestApp } from './helpers';

let t: TestApp;
let owner: Awaited<ReturnType<typeof createOwner>>;
beforeAll(async () => {
  t = await startTestApp();
  owner = await createOwner(t);
});
afterAll(async () => {
  await t.app.close();
});

type P = Awaited<ReturnType<typeof register>>;
const rows = <T>(q: ReturnType<typeof sql>) => t.db.execute(q) as unknown as Promise<T[]>;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const call = (method: 'GET' | 'POST' | 'PUT', url: string, headers: Record<string, string>, payload?: object) => t.app.inject({ method, url, headers, payload, remoteAddress: randomIp() });
const code = (res: { json: () => { error?: { code: string } } }) => res.json().error?.code;
const buy = (p: P, itemId: string, extra: object = {}) => call('POST', '/api/shop/buy', bearer(p.token), { itemId, ...extra });
const equip = (p: P, slot: string, itemId: string | null) => call('POST', '/api/me/equip', bearer(p.token), { slot, itemId });

async function wallet(p: P) {
  const [w] = await rows<{ balance: string; gold: string; ls: string; lg: string }>(sql`
    SELECT w.balance, w.gold,
      (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = w.user_id AND currency = 'silver') AS ls,
      (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = w.user_id AND currency = 'gold') AS lg
    FROM wallets w WHERE w.user_id = ${p.user.id}::uuid`);
  expect(w!.balance).toBe(w!.ls);
  expect(w!.gold).toBe(w!.lg);
  return { silver: Number(w!.balance), gold: Number(w!.gold) };
}
const fund = (p: P, amount: number, currency: 'silver' | 'gold' = 'silver') => t.db.transaction((tx) => applyDelta(tx, p.user.id, amount, 'admin_adjust', null, currency, `test:${randomUUID()}`));
const owns = async (p: P, itemId: string) => (await rows(sql`SELECT 1 FROM inventory_items WHERE user_id = ${p.user.id}::uuid AND item_id = ${itemId}`)).length > 0;
/** Moves a collection's window around now (as an admin edit would) without approving it. */
async function windowFor(id: string, startOffsetMs: number, endOffsetMs: number) {
  const items = (await rows<{ item_id: string; price: string; currency: 'silver' | 'gold' }>(sql`SELECT item_id, price, currency FROM collection_items WHERE collection_id = ${id} ORDER BY sort`)).map((r) => ({ itemId: r.item_id, price: Number(r.price), currency: r.currency }));
  const [c] = await rows<{ theme: string; year: number; name_vi: string; name_en: string }>(sql`SELECT theme, year, name_vi, name_en FROM cosmetic_collections WHERE id = ${id}`);
  const res = await call('PUT', `/api/admin/collections/${id}`, owner.headers, {
    theme: c!.theme, year: c!.year, nameVi: c!.name_vi, nameEn: c!.name_en,
    startsAt: new Date(Date.now() + startOffsetMs).toISOString(), endsAt: new Date(Date.now() + endOffsetMs).toISOString(), timezone: 'Asia/Ho_Chi_Minh', items,
  });
  expect(res.statusCode).toBe(200);
}

describe('seeded catalogue', () => {
  it('has every category, eight draft collections with six kinds each, and keeps the 24 seasonal frames', async () => {
    const kinds = await rows<{ kind: string; n: number }>(sql`SELECT kind, count(*)::int AS n FROM catalog_items WHERE id LIKE 'table\\_%' OR id LIKE 'fx\\_%' OR id LIKE 'ss2026\\_%' OR id LIKE 'bubble\\_%' GROUP BY kind ORDER BY kind`);
    const by = Object.fromEntries(kinds.map((k) => [k.kind, k.n]));
    expect(by.table_skin).toBe(13);
    expect(by.victory_effect).toBe(14);
    expect(by.card_back).toBe(8);
    expect(by.title).toBe(8);
    expect(by.frame).toBe(24);
    expect(by.chat_bubble).toBeGreaterThanOrEqual(12);
    const cols = await rows<{ id: string; approved_at: Date | null; kinds: string[] }>(sql`
      SELECT c.id, c.approved_at, array_agg(DISTINCT i.kind ORDER BY i.kind) AS kinds FROM cosmetic_collections c JOIN collection_items o ON o.collection_id = c.id JOIN catalog_items i ON i.id = o.item_id GROUP BY c.id, c.approved_at ORDER BY c.id`);
    expect(cols.map((c) => c.id).sort()).toEqual(COLLECTION_SEEDS.map((c) => c.id).sort());
    for (const c of cols) {
      expect(c.approved_at).toBeNull();
      expect(c.kinds).toEqual(['card_back', 'chat_bubble', 'frame', 'table_skin', 'title', 'victory_effect']);
    }
    const frames = await rows<{ id: string; status: string }>(sql`SELECT id, status FROM catalog_items WHERE id = ANY(string_to_array(${FRAME_LIBRARY.filter((f) => f.season).map((f) => f.id).join(',')}, ','))`);
    expect(frames).toHaveLength(24);
    expect(frames.every((f) => f.status === 'released')).toBe(true);
    // Nothing seasonal is for sale while collections are drafts.
    const shop = await rows(sql`SELECT 1 FROM catalog_items WHERE id LIKE 'ss2026\\_%' AND (price_silver IS NOT NULL OR price_gold IS NOT NULL)`);
    expect(shop).toEqual([]);
  });
});

describe('buying', () => {
  it('debits the server price once, refuses duplicates, concurrency, missing funds and wrong currency', async () => {
    const a = await register(t);
    await fund(a, 100_000);
    const start = await wallet(a);
    expect(code(await buy(a, 'table_royal_gold', { expectedPrice: 1 }))).toBe('gift_price_changed');
    const tries = await Promise.all(Array.from({ length: 5 }, () => buy(a, 'table_royal_gold')));
    expect(tries.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(tries.filter((r) => r.statusCode !== 200).every((r) => code(r) === 'already_owned')).toBe(true);
    expect((await wallet(a)).silver).toBe(start.silver - 30_000);
    expect(code(await buy(a, 'table_royal_gold'))).toBe('already_owned');
    expect((await wallet(a)).silver).toBe(start.silver - 30_000);
    // Gold-priced: needs Cxu Vàng, not Cxu Bạc.
    expect(code(await buy(a, 'table_diamond_lounge'))).toBe('insufficient_funds');
    expect(await owns(a, 'table_diamond_lounge')).toBe(false);
    await fund(a, 80, 'gold');
    expect((await buy(a, 'table_diamond_lounge', { expectedPrice: 80, expectedCurrency: 'gold' })).statusCode).toBe(200);
    expect(await wallet(a)).toEqual({ silver: start.silver - 30_000, gold: start.gold });
    // The default table is everyone's: not sold, always equippable.
    expect(code(await buy(a, 'table_classic_green'))).toBe('already_owned');
  });
});

describe('seasonal collections', () => {
  it('sell only after Owner approval and inside the window, at the collection price; owned items stay after the end', async () => {
    const a = await register(t);
    await fund(a, 200_000);
    const item = 'ss2026_christmas_table';
    expect(code(await buy(a, item))).toBe('item_not_found'); // draft
    // A super admin cannot approve; editing does not approve.
    const sa = await createStaff(t, 'super_admin');
    await windowFor('christmas_2026', 86_400_000, 10 * 86_400_000);
    expect(code(await call('POST', '/api/admin/collections/christmas_2026/approve', sa.headers))).toBe('forbidden');
    expect(code(await buy(a, item))).toBe('item_not_found');
    expect((await call('POST', '/api/admin/collections/christmas_2026/approve', owner.headers)).statusCode).toBe(200);
    // Approved but not started yet.
    expect(code(await buy(a, item))).toBe('item_not_found');
    const pub = (await call('GET', '/api/collections', bearer(a.token))).json().collections as { id: string; status: string }[];
    expect(pub.find((c) => c.id === 'christmas_2026')?.status).toBe('scheduled');
    expect(pub.find((c) => c.id === 'halloween_2026')).toBeUndefined(); // drafts stay private
    // Open now.
    await windowFor('christmas_2026', -60_000, 86_400_000);
    const before = await wallet(a);
    expect((await buy(a, item, { expectedPrice: 45_000 })).statusCode).toBe(200);
    expect((await wallet(a)).silver).toBe(before.silver - 45_000);
    const [inv] = await rows<{ source: string; source_ref: string }>(sql`SELECT source, source_ref FROM inventory_items WHERE user_id = ${a.user.id}::uuid AND item_id = ${item}`);
    expect(inv).toEqual({ source: 'season', source_ref: 'christmas_2026' });
    // End early: no more sales, the bought item stays owned and equippable, no refund.
    expect((await call('POST', '/api/admin/collections/christmas_2026/end', owner.headers)).statusCode).toBe(200);
    expect(code(await buy(a, 'ss2026_christmas_bubble'))).toBe('item_not_found');
    expect(await owns(a, item)).toBe(true);
    expect((await equip(a, 'table_skin', item)).statusCode).toBe(200);
    expect((await wallet(a)).silver).toBe(before.silver - 45_000);
    const audits = await rows<{ action: string }>(sql`SELECT action FROM audit_logs WHERE target_id = 'christmas_2026' ORDER BY id`);
    expect(audits.map((x) => x.action)).toEqual(expect.arrayContaining(['collection.save', 'collection.approve', 'collection.end']));
  });

  it('re-releases as a new draft collection without touching the old one; refuses role frames and reserved titles', async () => {
    const res = await call('POST', '/api/admin/collections/halloween_2026/rerun', owner.headers, { id: 'halloween_2027', year: 2027, startsAt: '2027-10-20T00:00:00.000Z', endsAt: '2027-11-04T00:00:00.000Z' });
    expect(res.statusCode).toBe(200);
    const [n] = await rows<{ a: number; b: number; draft: boolean; name: string }>(sql`
      SELECT (SELECT count(*)::int FROM collection_items WHERE collection_id = 'halloween_2026') AS a, (SELECT count(*)::int FROM collection_items WHERE collection_id = 'halloween_2027') AS b,
        (SELECT approved_at IS NULL FROM cosmetic_collections WHERE id = 'halloween_2027') AS draft, (SELECT name_en FROM cosmetic_collections WHERE id = 'halloween_2027') AS name`);
    expect(n).toEqual({ a: 8, b: 8, draft: true, name: 'Halloween 2027' });
    expect(code(await call('POST', '/api/admin/collections/halloween_2026/rerun', owner.headers, { id: 'halloween_2027', year: 2027, startsAt: '2027-10-20T00:00:00.000Z', endsAt: '2027-11-04T00:00:00.000Z' }))).toBe('already_owned');
    const put = await call('PUT', '/api/admin/collections/staff_set', owner.headers, { theme: 'staff', year: 2026, nameVi: 'X', nameEn: 'X', startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-02-01T00:00:00.000Z', timezone: 'UTC', items: [{ itemId: 'role_admin', price: 1, currency: 'silver' }] });
    expect(code(put)).toBe('forbidden');
    for (const name of ['Super Admin', 'Moderator', 'Verified', 'Quản trị viên', 'Keyo Captain']) {
      const r = await call('POST', '/api/admin/items', owner.headers, { id: `t_${randomUUID().slice(0, 6)}`, kind: 'title', nameVi: name, nameEn: name, rarity: 'rare', source: 'shop', tradable: false, status: 'draft', style: { colors: ['#ffffff', '#000000'], animated: false } });
      expect(code(r)).toBe('bad_request');
    }
  });
});

describe('equipping', () => {
  it('personal slots: default table free, unowned refused; personal items stay off public profiles', async () => {
    const [a, b] = [await register(t), await register(t)];
    expect((await equip(a, 'table_skin', 'table_classic_green')).statusCode).toBe(200);
    expect(code(await equip(a, 'table_skin', 'table_royal_gold'))).toBe('not_owned');
    expect(code(await equip(a, 'victory_effect', 'fx_golden_shower'))).toBe('not_owned');
    await fund(a, 50_000);
    await buy(a, 'fx_golden_shower');
    const me = (await equip(a, 'victory_effect', 'fx_golden_shower')).json().user;
    expect(me).toMatchObject({ tableSkin: 'table_classic_green', victoryEffect: 'fx_golden_shower' });
    const prof = (await call('GET', `/api/players/${a.user.uid}`, bearer(b.token))).json().player;
    // Owning it may show in the collection showcase; what is EQUIPPED as a personal item never leaves the owner.
    expect(Object.keys(prof)).not.toEqual(expect.arrayContaining(['tableSkin']));
    expect(JSON.stringify(prof)).not.toMatch(/tableSkin|victoryEffect|table_classic_green/);
  });

  it('equip a whole set: only owned items, missing listed, a role frame kept unless confirmed', async () => {
    const mod = await createStaff(t, 'moderator');
    await fund(mod, 300_000);
    await windowFor('valentine_2026', -60_000, 86_400_000);
    await call('POST', '/api/admin/collections/valentine_2026/approve', owner.headers);
    for (const id of ['ss2026_valentine_cards', 'ss2026_valentine_title', 'ss2026_ruby_heart']) expect((await buy(mod, id)).statusCode).toBe(200);
    await equip(mod, 'frame', 'role_moderator');
    const r = (await call('POST', '/api/me/equip-set', bearer(mod.token), { collectionId: 'valentine_2026' })).json();
    expect(r.user).toMatchObject({ cardBack: 'ss2026_valentine_cards', title: 'ss2026_valentine_title', frame: 'role_moderator' });
    expect(r.keptRoleFrame).toBe(true);
    expect(r.missing).toEqual(expect.arrayContaining(['ss2026_valentine_table', 'ss2026_valentine_fx', 'ss2026_valentine_bubble']));
    const r2 = (await call('POST', '/api/me/equip-set', bearer(mod.token), { collectionId: 'valentine_2026', replaceRoleFrame: true })).json();
    expect(r2.user.frame).toBe('ss2026_ruby_heart');
  });
});

describe('maintenance', () => {
  it('reset:test-data covers collections', async () => {
    expect(await uncoveredForeignKeys(t.db)).toEqual([]);
  });
});
