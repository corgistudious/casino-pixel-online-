import { randomUUID } from 'node:crypto';
import { MAX_DIVISION, VUONG_GIA_ITEMS } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sweepExpiredEquipment } from '../src/services/catalog';
import { deliverSeasonRewards, recordRankedMatch } from '../src/services/rank';
import { createOwner, createStaff, randomIp, reauthHeaders, register, startTestApp, type TestApp } from './helpers';

let t: TestApp;
let owner: Awaited<ReturnType<typeof createOwner>>;
beforeAll(async () => {
  t = await startTestApp();
  owner = await createOwner(t);
});
afterAll(async () => {
  await t.app.close();
});

const rows = async <T>(q: ReturnType<typeof sql>) => (await t.db.execute(q)) as unknown as T[];
const one = async <T>(q: ReturnType<typeof sql>) => (await rows<T>(q))[0]!;
const asOwner = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: object) =>
  t.app.inject({ method, url, payload, headers: await reauthHeaders(t, owner.token), remoteAddress: randomIp() });
const as = (token: string, method: 'GET' | 'POST', url: string, payload?: object) =>
  t.app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` }, remoteAddress: randomIp() });
const setRank = (userId: string, seasonId: number, division: number, rp: number, wins = 1) =>
  t.db.execute(sql`INSERT INTO player_ranks (season_id, user_id, division, rp, streak, peak_division, wins, rp_at) VALUES (${seasonId}, ${userId}, ${division}, ${rp}, 0, ${division}, ${wins}, now())
    ON CONFLICT (season_id, user_id) DO UPDATE SET division = EXCLUDED.division, rp = EXCLUDED.rp, wins = EXCLUDED.wins`);
const silverOf = async (userId: string) => Number((await one<{ balance: string }>(sql`SELECT balance FROM wallets WHERE user_id = ${userId}`)).balance);

async function newSeason(name: string, extra: object = {}) {
  const res = await asOwner('POST', '/api/admin/rank/seasons', { name, startsAt: new Date(Date.now() - 60_000).toISOString(), ...extra });
  expect(res.statusCode).toBe(200);
  const id = res.json().season.id as number;
  expect((await asOwner('POST', `/api/admin/rank/seasons/${id}/start`)).statusCode).toBe(200);
  return res.json().season as { id: number; startsAt: string; endsAt: string };
}

describe('official end-of-season rewards', () => {
  let seasonId: number;
  const top: Awaited<ReturnType<typeof register>>[] = [];
  const rest: Awaited<ReturnType<typeof register>>[] = [];
  let noMatch: Awaited<ReturnType<typeof register>>;
  let banned: Awaited<ReturnType<typeof register>>;
  let cheater: Awaited<ReturnType<typeof register>>;

  it('defaults to a 2-month season with the official rewards', async () => {
    const s = await newSeason('Mùa Chính Thức');
    seasonId = s.id;
    const months = (new Date(s.endsAt).getUTCFullYear() - new Date(s.startsAt).getUTCFullYear()) * 12 + new Date(s.endsAt).getUTCMonth() - new Date(s.startsAt).getUTCMonth();
    expect(months).toBe(2);
    const list = (await asOwner('GET', '/api/admin/rank/seasons')).json().seasons;
    const mine = list.find((x: { id: number }) => x.id === seasonId);
    expect(mine.rewards.brackets.top1).toEqual([
      { type: 'silver', amount: 3_000_000 },
      { type: 'gold', amount: 3_000 },
      ...VUONG_GIA_ITEMS.map((itemId) => ({ type: 'item', itemId, durationDays: 60 })),
    ]);
    expect(mine.participation).toMatchObject({ playSilver: 0, winSilver: 0 });
  });

  it('pays every bracket exactly, skips ineligible accounts, and opens the next season', async () => {
    for (let i = 0; i < 50; i++) top.push(await register(t));
    for (let i = 0; i < 3; i++) rest.push(await register(t));
    noMatch = await register(t);
    banned = await register(t);
    cheater = await register(t);
    for (const [i, p] of top.entries()) await setRank(p.user.id, seasonId, MAX_DIVISION, 2000 - i * 10);
    for (const p of rest) await setRank(p.user.id, seasonId, 5, 50);
    await setRank(noMatch.user.id, seasonId, 3, 0, 0);
    await setRank(banned.user.id, seasonId, MAX_DIVISION, 5000);
    await setRank(cheater.user.id, seasonId, MAX_DIVISION, 9000);
    await t.db.execute(sql`INSERT INTO bans (user_id, reason) VALUES (${banned.user.id}, 'cheating ring')`);
    const admin = await createStaff(t, 'admin');
    const dq = { uid: cheater.user.uid, disqualified: true, reason: 'verified win trading' };
    expect((await t.app.inject({ method: 'POST', url: `/api/admin/rank/seasons/${seasonId}/disqualify`, payload: dq, headers: admin.headers })).statusCode).toBe(403);
    expect((await asOwner('POST', `/api/admin/rank/seasons/${seasonId}/disqualify`, dq)).statusCode).toBe(200);

    const projection = (await asOwner('GET', `/api/admin/rank/seasons/${seasonId}/projection`)).json();
    expect(projection.eligible).toBe(53);
    expect(projection.silver).toBe(3e6 + 2e6 + 1e6 + 7 * 5e5 + 40 * 3e5 + 3 * 2e5);
    expect(projection.gold).toBe(3000 + 2000 + 1000 + 7 * 500);

    const end = await asOwner('POST', `/api/admin/rank/seasons/${seasonId}/end`, { reason: 'end of season' });
    expect(end.statusCode).toBe(200);
    expect(end.json()).toMatchObject({ rewards: 53, silver: projection.silver, gold: projection.gold, delivery: { delivered: 53, failed: 0 } });
    const next = await one<{ id: number; status: string; starts_at: Date; ends_at: Date }>(sql`SELECT id, status, starts_at, ends_at FROM rank_seasons WHERE id = ${end.json().nextSeasonId}`);
    expect(next.status).toBe('active');

    const rec = await rows<{ user_id: string; top_position: number | null; bracket: string; silver: string; gold: string; attachments: { type: string; itemId?: string; expiresAt?: string }[]; status: string }>(
      sql`SELECT * FROM season_rewards WHERE season_id = ${seasonId}`,
    );
    const by = new Map(rec.map((r) => [r.user_id, r]));
    const expect60 = new Date(new Date(next.starts_at).getTime() + 60 * 86_400_000).toISOString();
    const check = (userId: string, bracket: string, silver: number, gold: number, items: number) => {
      const r = by.get(userId)!;
      expect(r).toBeDefined();
      expect([r.bracket, Number(r.silver), Number(r.gold), r.attachments.filter((a) => a.type === 'item').length]).toEqual([bracket, silver, gold, items]);
      for (const a of r.attachments.filter((x) => x.type === 'item')) expect(a.expiresAt).toBe(expect60);
      expect(r.status).toBe('delivered');
    };
    check(top[0]!.user.id, 'top1', 3_000_000, 3_000, 4);
    check(top[1]!.user.id, 'top2', 2_000_000, 2_000, 4);
    check(top[2]!.user.id, 'top3', 1_000_000, 1_000, 4);
    for (const p of top.slice(3, 10)) check(p.user.id, 'top4_10', 500_000, 500, 0);
    for (const p of top.slice(10, 50)) check(p.user.id, 'top11_50', 300_000, 0, 0);
    for (const p of rest) check(p.user.id, 'rest', 200_000, 0, 0);
    for (const p of [noMatch, banned, cheater]) expect(by.has(p.user.id)).toBe(false);
    expect(rec).toHaveLength(53);
    // System accounts never receive rewards.
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM season_rewards r JOIN users u ON u.id = r.user_id WHERE u.account_type <> 'player'`)).n).toBe(0);
  });

  it('delivers each reward once, even when delivery runs again', async () => {
    await deliverSeasonRewards(t.db);
    await asOwner('POST', '/api/admin/rank/rewards/retry');
    const dup = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM (SELECT user_id FROM mail_messages WHERE reward_key = ${`season:${seasonId}:reward`} GROUP BY 1 HAVING count(*) > 1) d`);
    expect(dup.n).toBe(0);
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM mail_messages WHERE reward_key = ${`season:${seasonId}:reward`}`)).n).toBe(53);
    // Records are immutable.
    await expect(t.db.execute(sql`UPDATE season_rewards SET silver = 1 WHERE season_id = ${seasonId}`)).rejects.toThrow();
    const report = (await asOwner('GET', `/api/admin/rank/seasons/${seasonId}/rewards`)).json();
    expect(report.records).toHaveLength(53);
    expect(report.totals.planned.silver).toBe(3e6 + 2e6 + 1e6 + 7 * 5e5 + 40 * 3e5 + 3 * 2e5);
  });

  it('a late claim keeps the original 60-day expiry; expired items unequip everywhere and cannot be re-equipped', async () => {
    const winner = top[0]!;
    const before = await silverOf(winner.user.id);
    const [mail] = await rows<{ id: string }>(sql`SELECT id FROM mail_messages WHERE user_id = ${winner.user.id} AND reward_key = ${`season:${seasonId}:reward`}`);
    const claim = await as(winner.token, 'POST', `/api/mail/${mail!.id}/claim`);
    expect(claim.statusCode).toBe(200);
    expect((await silverOf(winner.user.id)) - before).toBe(3_000_000);
    const inv = (await as(winner.token, 'GET', '/api/me/inventory')).json();
    const vg = inv.items.filter((i: { itemId: string }) => (VUONG_GIA_ITEMS as readonly string[]).includes(i.itemId));
    expect(vg).toHaveLength(4);
    const rec = await one<{ attachments: { expiresAt?: string }[] }>(sql`SELECT attachments FROM season_rewards WHERE season_id = ${seasonId} AND user_id = ${winner.user.id}`);
    const expiry = rec.attachments.find((a) => a.expiresAt)!.expiresAt;
    expect(vg.every((i: { expiresAt: string; active: boolean }) => i.expiresAt === expiry && i.active)).toBe(true);
    // Exclusive: never tradable, never in the shop.
    expect((await rows(sql`SELECT 1 FROM catalog_items WHERE id LIKE 'vuong_gia_%' AND (tradable OR price_silver IS NOT NULL)`)).length).toBe(0);

    for (const [slot, itemId] of [['frame', 'vuong_gia_frame'], ['avatar', 'vuong_gia_avatar'], ['chat_bubble', 'vuong_gia_bubble'], ['card_back', 'vuong_gia_card_back']]) {
      expect((await as(winner.token, 'POST', '/api/me/equip', { slot, itemId })).statusCode).toBe(200);
    }
    let me = (await as(winner.token, 'GET', '/api/me')).json().user;
    expect(me).toMatchObject({ frame: 'vuong_gia_frame', avatarItem: 'vuong_gia_avatar', chatBubble: 'vuong_gia_bubble', cardBack: 'vuong_gia_card_back' });

    // 60 days later.
    await t.db.execute(sql`UPDATE inventory_items SET expires_at = now() - interval '1 second' WHERE user_id = ${winner.user.id} AND item_id LIKE 'vuong_gia_%'`);
    me = (await as(winner.token, 'GET', '/api/me')).json().user; // shown as removed immediately
    expect(me).toMatchObject({ frame: 'classic', avatarItem: null, chatBubble: null, cardBack: null });
    const swept = await sweepExpiredEquipment(t.db);
    expect(swept).toContain(winner.user.id);
    const u = await one<{ frame: string; avatar_item: string | null; equipped_bubble: string | null; equipped_card_back: string | null }>(sql`SELECT frame, avatar_item, equipped_bubble, equipped_card_back FROM users WHERE id = ${winner.user.id}`);
    expect(u).toEqual({ frame: 'classic', avatar_item: null, equipped_bubble: null, equipped_card_back: null });
    expect((await as(winner.token, 'POST', '/api/me/equip', { slot: 'frame', itemId: 'vuong_gia_frame' })).json().error.code).toBe('item_expired');
    // Ownership history is kept.
    const hist = (await as(winner.token, 'GET', '/api/me/inventory')).json().items.filter((i: { itemId: string }) => i.itemId.startsWith('vuong_gia_'));
    expect(hist.map((i: { active: boolean }) => i.active)).toEqual([false, false, false, false]);
  });

  it('claiming after expiry records the history but gives nothing usable', async () => {
    const late = top[1]!;
    await t.db.execute(sql`UPDATE mail_messages SET attachments = (
      SELECT jsonb_agg(CASE WHEN a ? 'expiresAt' THEN jsonb_set(a, '{expiresAt}', to_jsonb((now() - interval '1 day')::timestamptz)) ELSE a END) FROM jsonb_array_elements(attachments) a)
      WHERE user_id = ${late.user.id} AND reward_key = ${`season:${seasonId}:reward`}`);
    const [mail] = await rows<{ id: string }>(sql`SELECT id FROM mail_messages WHERE user_id = ${late.user.id} AND reward_key LIKE 'season:%'`);
    const claim = (await as(late.token, 'POST', `/api/mail/${mail!.id}/claim`)).json();
    expect(claim.mail.claimResult.filter((r: { outcome: string }) => r.outcome === 'expired')).toHaveLength(4);
    expect((await as(late.token, 'POST', '/api/me/equip', { slot: 'frame', itemId: 'vuong_gia_frame' })).json().error.code).toBe('item_expired');
  });
});

describe('ranked participation rewards', () => {
  let seasonId: number;
  it('are off by default, configurable only by Owner/Super Admin', async () => {
    seasonId = (await asOwner('GET', '/api/admin/rank/seasons')).json().seasons.find((s: { status: string }) => s.status === 'active').id;
    const a = await register(t);
    const b = await register(t);
    const before = await silverOf(a.user.id);
    await recordRankedMatch(t.db, 'p-0', [{ userId: a.user.id, result: 'win' }, { userId: b.user.id, result: 'loss' }]);
    expect(await silverOf(a.user.id)).toBe(before);
    const admin = await createStaff(t, 'admin');
    const body = { participation: { playSilver: 100, winSilver: 50, dailyMatchCap: 3, samePairDailyCap: 1 } };
    expect((await t.app.inject({ method: 'PATCH', url: `/api/admin/rank/seasons/${seasonId}`, payload: body, headers: admin.headers })).statusCode).toBe(403);
    expect((await asOwner('PATCH', `/api/admin/rank/seasons/${seasonId}`, body)).statusCode).toBe(200);
  });

  it('pays winner and loser once per valid match, never on replays, with farming caps and flags', async () => {
    const a = await register(t);
    const b = await register(t);
    const c = await register(t);
    const sa = await silverOf(a.user.id);
    const sb = await silverOf(b.user.id);
    const res = await recordRankedMatch(t.db, 'p-1', [{ userId: a.user.id, result: 'win' }, { userId: b.user.id, result: 'loss' }]);
    expect(Object.fromEntries(res.map((r) => [r.userId, r.reward]))).toEqual({ [a.user.id]: 150, [b.user.id]: 100 });
    await recordRankedMatch(t.db, 'p-1', [{ userId: a.user.id, result: 'win' }, { userId: b.user.id, result: 'loss' }]); // replay
    await Promise.allSettled([1, 2, 3].map(() => recordRankedMatch(t.db, 'p-1', [{ userId: a.user.id, result: 'win' }, { userId: b.user.id, result: 'loss' }])));
    expect((await silverOf(a.user.id)) - sa).toBe(150);
    expect((await silverOf(b.user.id)) - sb).toBe(100);
    // Same pair again today: rank counts, no Cxu, flagged.
    const again = await recordRankedMatch(t.db, 'p-2', [{ userId: a.user.id, result: 'loss' }, { userId: b.user.id, result: 'win' }]);
    expect(again.every((r) => r.applied && r.reward === 0)).toBe(true);
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM reward_flags WHERE kind = 'same_opponent' AND match_key = 'p-2'`)).n).toBe(2);
    // AFK: no reward.
    const afk = await recordRankedMatch(t.db, 'p-3', [{ userId: a.user.id, result: 'win' }, { userId: c.user.id, result: 'loss', afk: true }]);
    expect(afk.find((r) => r.userId === c.user.id)!.reward).toBe(0);
    // Multi-account (same registration IP): no reward for either.
    const d = await register(t);
    const e = await register(t);
    await t.db.execute(sql`INSERT INTO audit_logs (actor_id, action, ip) VALUES (${d.user.id}, 'account.register', '203.0.113.9'), (${e.user.id}, 'account.register', '203.0.113.9')`);
    const shared = await recordRankedMatch(t.db, 'p-4', [{ userId: d.user.id, result: 'win' }, { userId: e.user.id, result: 'loss' }]);
    expect(shared.map((r) => r.reward)).toEqual([0, 0]);
    // Ledger holds every reward.
    const ledger = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM ledger_entries WHERE reason = 'rank_reward' AND ref = ${`rank:${seasonId}:p-1`}`);
    expect(ledger.n).toBe(2);
    expect((await asOwner('GET', '/api/admin/rank/flags')).json().flags.length).toBeGreaterThanOrEqual(3);
  });
});

describe('giftcodes', () => {
  it('only Owner/Super Admin create codes; normalised, limited, once per player, atomic', async () => {
    const admin = await createStaff(t, 'admin');
    const payload = { campaign: 'Ra mắt', code: 'keyo-launch 2026', attachments: [{ type: 'silver', amount: 1000 }, { type: 'item', itemId: 'title_lucky_star', durationDays: 7 }], maxUses: 2 };
    expect((await t.app.inject({ method: 'POST', url: '/api/admin/giftcodes', payload, headers: admin.headers })).statusCode).toBe(403);
    const created = await asOwner('POST', '/api/admin/giftcodes', payload);
    expect(created.json()).toEqual({ created: 1, codes: ['KEYOLAUNCH2026'] });
    const [a, b, c] = [await register(t), await register(t), await register(t)];
    const r1 = await as(a.token, 'POST', '/api/giftcode/redeem', { code: 'keyo-launch-2026' });
    expect(r1.statusCode).toBe(200);
    expect((await as(a.token, 'POST', '/api/giftcode/redeem', { code: 'KEYOLAUNCH2026' })).json().error.code).toBe('giftcode_already_redeemed');
    expect((await as(b.token, 'POST', '/api/giftcode/redeem', { code: 'KEYOLAUNCH2026' })).statusCode).toBe(200);
    expect((await as(c.token, 'POST', '/api/giftcode/redeem', { code: 'KEYOLAUNCH2026' })).json().error.code).toBe('giftcode_used_up');
    // Reward arrives by mail; claiming credits the ledger and a 7-day title.
    const before = await silverOf(a.user.id);
    const claim = await as(a.token, 'POST', `/api/mail/${r1.json().mailId}/claim`);
    expect(claim.statusCode).toBe(200);
    expect((await silverOf(a.user.id)) - before).toBe(1000);
    const title = (await as(a.token, 'GET', '/api/me/inventory')).json().items.find((i: { itemId: string }) => i.itemId === 'title_lucky_star');
    expect(Math.round((Date.parse(title.expiresAt) - Date.now()) / 86_400_000)).toBe(7);
    expect((await as(a.token, 'POST', '/api/me/equip', { slot: 'title', itemId: 'title_lucky_star' })).statusCode).toBe(200);
    expect((await as(a.token, 'GET', '/api/me')).json().user.title).toBe('title_lucky_star');
    expect((await as(a.token, 'GET', '/api/giftcode/history')).json().redemptions).toHaveLength(1);
  });

  it('refuses expired, disabled and unknown codes, and never exceeds the limit under concurrency', async () => {
    const p = await register(t);
    await asOwner('POST', '/api/admin/giftcodes', { campaign: 'Cũ', code: 'OLDCODE1', attachments: [{ type: 'silver', amount: 1 }], startsAt: new Date(Date.now() - 86_400_000 * 2).toISOString(), endsAt: new Date(Date.now() - 1000).toISOString() });
    expect((await as(p.token, 'POST', '/api/giftcode/redeem', { code: 'OLDCODE1' })).json().error.code).toBe('giftcode_expired');
    const off = await asOwner('POST', '/api/admin/giftcodes', { campaign: 'Tắt', code: 'OFFCODE1', attachments: [{ type: 'silver', amount: 1 }] });
    const list = (await asOwner('GET', '/api/admin/giftcodes?campaign=Tắt')).json().giftcodes;
    await asOwner('PATCH', '/api/admin/giftcodes', { ids: [list[0].id], enabled: false });
    expect(off.statusCode).toBe(200);
    expect((await as(p.token, 'POST', '/api/giftcode/redeem', { code: 'OFFCODE1' })).json().error.code).toBe('giftcode_invalid');
    expect((await as(p.token, 'POST', '/api/giftcode/redeem', { code: 'NOPE1234' })).json().error.code).toBe('giftcode_invalid');

    await asOwner('POST', '/api/admin/giftcodes', { campaign: 'Một lượt', code: 'ONLYONE1', attachments: [{ type: 'silver', amount: 5 }], maxUses: 1 });
    const players = await Promise.all([1, 2, 3, 4, 5].map(() => register(t)));
    const results = await Promise.all(players.map((pl) => as(pl.token, 'POST', '/api/giftcode/redeem', { code: 'ONLYONE1' })));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect((await one<{ uses: number }>(sql`SELECT uses FROM giftcodes WHERE code = 'ONLYONE1'`)).uses).toBe(1);
  });

  it('creates random batches and exports them (re-auth, audited)', async () => {
    const batch = await asOwner('POST', '/api/admin/giftcodes', { campaign: 'Batch 50', count: 50, attachments: [{ type: 'gold', amount: 1 }] });
    expect(batch.json().created).toBe(50);
    expect(new Set(batch.json().codes).size).toBe(50);
    const noReauth = await t.app.inject({ url: '/api/admin/giftcodes/export?campaign=Batch%2050', headers: { authorization: `Bearer ${owner.token}` } });
    expect(noReauth.statusCode).toBe(403);
    const csv = await asOwner('GET', '/api/admin/giftcodes/export?campaign=Batch%2050');
    expect(csv.json().filename).toBe('giftcodes-Batch_50.csv');
    expect(csv.json().csv.trim().split('\n')).toHaveLength(51);
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'giftcode.export'`)).n).toBe(1);
  });
});

describe('equipment slots', () => {
  it('equips titles, chat bubbles and card backs that are owned; not others', async () => {
    const p = await register(t);
    expect((await as(p.token, 'POST', '/api/me/equip', { slot: 'card_back', itemId: 'card_back_sapphire' })).json().error.code).toBe('not_owned');
    expect((await as(p.token, 'POST', '/api/me/equip', { slot: 'title', itemId: 'card_back_classic' })).json().error.code).toBe('item_not_found');
    expect((await as(p.token, 'POST', '/api/shop/buy', { itemId: 'card_back_sapphire' })).statusCode).toBe(200);
    expect((await as(p.token, 'POST', '/api/me/equip', { slot: 'card_back', itemId: 'card_back_sapphire' })).statusCode).toBe(200);
    expect((await as(p.token, 'POST', '/api/me/equip', { slot: 'card_back', itemId: null })).statusCode).toBe(200);
    expect((await as(p.token, 'GET', '/api/me')).json().user.cardBack).toBeNull();
    // Free basic items are taken once without charge.
    const before = await silverOf(p.user.id);
    expect((await as(p.token, 'POST', '/api/shop/buy', { itemId: 'title_newcomer' })).statusCode).toBe(200);
    expect((await as(p.token, 'POST', '/api/shop/buy', { itemId: 'title_newcomer' })).json().error.code).toBe('already_owned');
    expect(await silverOf(p.user.id)).toBe(before);
    void randomUUID;
  });
});
