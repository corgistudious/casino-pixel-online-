import { randomUUID } from 'node:crypto';
import { boardById, type LbBoardView } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { uncoveredForeignKeys } from '../src/maintenance/testData';
import { grantItem } from '../src/services/catalog';
import { clearLeaderboardCache, previousMonth, rebuildGameStats } from '../src/services/leaderboards';
import { finalizeBoard, finalizeTournament } from '../src/services/rankingRewards';
import { createOwner, createStaff, randomIp, register, startTestApp, TestSocket, type TestApp } from './helpers';

let t: TestApp;
let owner: Awaited<ReturnType<typeof createOwner>>;
beforeAll(async () => {
  t = await startTestApp();
  owner = await createOwner(t);
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(() => clearLeaderboardCache());

type P = Awaited<ReturnType<typeof register>>;
const rows = <T>(q: ReturnType<typeof sql>) => t.db.execute(q) as unknown as Promise<T[]>;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: object) =>
  t.app.inject({ method, url, headers, payload, remoteAddress: randomIp() });
const code = (res: { json: () => { error?: { code: string } } }) => res.json().error?.code;

/** A settled round exactly as the games write it (one row per player and round, unique key). */
async function round(p: P, game: string, bet: number, payout: number, opts: { status?: string; key?: string; at?: Date } = {}) {
  const at = opts.at ?? new Date();
  await t.db.execute(sql`
    INSERT INTO game_rounds (user_id, game, bet, payout, status, idempotency_key, created_at, settled_at)
    VALUES (${p.user.id}::uuid, ${game}, ${bet}, ${payout}, ${opts.status ?? 'settled'}, ${opts.key ?? randomUUID()}, ${at.toISOString()}::timestamptz, ${opts.status === 'active' ? null : at.toISOString()}::timestamptz)
    ON CONFLICT DO NOTHING`);
}
const W = (p: P, game = 'poker', opts = {}) => round(p, game, 100, 250, opts);
const L = (p: P, game = 'poker', opts = {}) => round(p, game, 100, 0, opts);
const PUSH = (p: P, game = 'poker', opts = {}) => round(p, game, 100, 100, opts);
async function stats(p: P, game: string) {
  const [s] = await rows<{ played: number; wins: number; losses: number; pushes: number; current_streak: number; best_streak: number }>(sql`
    SELECT played, wins, losses, pushes, current_streak, best_streak FROM player_game_stats WHERE user_id = ${p.user.id}::uuid AND game = ${game}`);
  return s ?? null;
}
const board = async (p: P, id: string, query = '') => (await call('GET', `/api/leaderboards/${id}${query}`, bearer(p.token))).json() as LbBoardView;

describe('win streaks and per-game statistics', () => {
  it('a win extends, a push keeps, a loss breaks the streak; the best streak is remembered', async () => {
    const a = await register(t);
    await W(a); await W(a); await PUSH(a); await W(a);
    expect(await stats(a, 'poker')).toEqual({ played: 4, wins: 3, losses: 0, pushes: 1, current_streak: 3, best_streak: 3 });
    await L(a);
    expect(await stats(a, 'poker')).toMatchObject({ current_streak: 0, best_streak: 3, losses: 1 });
    await W(a);
    expect(await stats(a, 'poker')).toMatchObject({ current_streak: 1, best_streak: 3, played: 6 });
  });

  it('games keep separate streaks; Sic Bo and Tài Xỉu Live are one dice game; slots are not ranked', async () => {
    const a = await register(t);
    for (let i = 0; i < 5; i++) await W(a, 'poker');
    for (let i = 0; i < 3; i++) await W(a, 'blackjack');
    await W(a, 'sicbo'); await W(a, 'taixiu');
    await W(a, 'slots');
    expect((await stats(a, 'poker'))!.current_streak).toBe(5);
    expect((await stats(a, 'blackjack'))!.current_streak).toBe(3);
    expect((await stats(a, 'taixiu'))!.current_streak).toBe(2);
    expect(await stats(a, 'slots')).toBeNull();
  });

  it('retries, replays, unsettled, void and zero-stake rounds never count', async () => {
    const a = await register(t);
    const key = randomUUID();
    await W(a, 'poker', { key });
    await W(a, 'poker', { key }); // same round again (retry / reconnect): ignored by the unique key
    await round(a, 'poker', 100, 0, { status: 'void' });
    await round(a, 'poker', 0, 0); // a card seat that put nothing in
    // Solo Blackjack: counted once when it settles, not when it starts, not on a second update.
    const bj = randomUUID();
    await round(a, 'blackjack', 100, 0, { status: 'active', key: bj });
    expect(await stats(a, 'blackjack')).toBeNull();
    await t.db.execute(sql`UPDATE game_rounds SET status = 'settled', payout = 200, settled_at = now() WHERE user_id = ${a.user.id}::uuid AND idempotency_key = ${bj}`);
    await t.db.execute(sql`UPDATE game_rounds SET status = 'settled' WHERE user_id = ${a.user.id}::uuid AND idempotency_key = ${bj}`);
    expect(await stats(a, 'poker')).toMatchObject({ played: 1, wins: 1 });
    expect(await stats(a, 'blackjack')).toMatchObject({ played: 1, wins: 1, current_streak: 1 });
  });

  it('a real Sic Bo round played over the socket is counted from its settled result', async () => {
    const a = await register(t);
    const s = await TestSocket.connect(t.port, a.token);
    const data = await s.ok<{ result: { payout: number } }>({ type: 'sicbo.roll', bets: [{ kind: 'big', amount: 100 }] });
    s.close();
    const st = await stats(a, 'taixiu');
    expect(st!.played).toBe(1);
    expect(st!.wins).toBe(data.result.payout > 100 ? 1 : 0);
  });

  it('the rebuild command recomputes the same statistics from settled history', async () => {
    const before = await rows(sql`SELECT user_id, game, played, wins, losses, pushes, current_streak, best_streak FROM player_game_stats ORDER BY user_id, game`);
    await t.db.transaction((tx) => rebuildGameStats(tx));
    const after = await rows(sql`SELECT user_id, game, played, wins, losses, pushes, current_streak, best_streak FROM player_game_stats ORDER BY user_id, game`);
    expect(after).toEqual(before);
  });
});

describe('boards', () => {
  it('ranks wins with stable ties (exact ties share a place), excludes others and paginates', async () => {
    const [a, b, c] = [await register(t), await register(t), await register(t)];
    for (let i = 0; i < 40; i++) await W(a, 'xito');
    for (let i = 0; i < 30; i++) await W(b, 'xito');
    for (let i = 0; i < 30; i++) await W(c, 'xito');
    const view = await board(a, 'xito.wins', '?period=all');
    const top = view.entries.slice(0, 3);
    expect(top.map((e) => e.player!.uid)).toEqual([a.user.uid, ...[b.user.uid, c.user.uid].sort((x, y) => x - y)]);
    expect(top.map((e) => e.position)).toEqual([1, 2, 2]);
    expect(view.me).toMatchObject({ position: 1, value: 40 });
    expect(JSON.stringify(view)).not.toMatch(/email|balance|password/i);
    expect((await board(a, 'xito.wins', '?period=all&limit=1&offset=1')).entries).toHaveLength(1);
  });

  it('win rate needs a minimum number of rounds; current and best streak boards; today vs all-time', async () => {
    const [a, b] = [await register(t), await register(t)];
    await W(a, 'lieng'); // 1 for 1: 100% but not enough rounds
    for (let i = 0; i < 25; i++) await (i % 5 === 0 ? L(b, 'lieng') : W(b, 'lieng'));
    const rate = await board(a, 'lieng.win_rate', '?period=all');
    expect(rate.entries.map((e) => e.player!.uid)).toEqual([b.user.uid]);
    expect(rate.entries[0]!.value).toBe(80);
    const yesterday = new Date(Date.now() - 2 * 86_400_000);
    for (let i = 0; i < 9; i++) await W(a, 'lieng', { at: yesterday });
    const today = await board(a, 'lieng.wins', '?period=day');
    expect(today.entries.find((e) => e.player!.uid === a.user.uid)?.value).toBe(1);
    const all = await board(a, 'lieng.wins', '?period=all');
    expect(all.entries.find((e) => e.player!.uid === a.user.uid)?.value).toBe(10);
    expect((await board(a, 'lieng.current_streak')).entries[0]!.player!.uid).toBeDefined();
    expect((await board(a, 'lieng.best_streak', '?period=all')).entries.find((e) => e.player!.uid === a.user.uid)?.value).toBeGreaterThanOrEqual(4);
  });

  it('VIP ranks by level then EXP; Charm received nets reversals and ignores staff corrections; likes count once', async () => {
    const [a, b, c] = [await register(t), await register(t), await register(t)];
    await t.db.execute(sql`INSERT INTO vip_progress (user_id, exp) VALUES (${a.user.id}::uuid, 900000), (${b.user.id}::uuid, 950000) ON CONFLICT (user_id) DO UPDATE SET exp = EXCLUDED.exp`);
    const vip = await board(a, 'vip.level');
    const pos = (uid: number) => vip.entries.findIndex((e) => e.player!.uid === uid);
    expect(pos(b.user.uid)).toBeLessThan(pos(a.user.uid));
    await t.db.execute(sql`INSERT INTO charm_ledger (user_id, delta, total_after, reason) VALUES
      (${a.user.id}::uuid, 500, 500, 'gift'), (${a.user.id}::uuid, -200, 300, 'gift_reversal'), (${a.user.id}::uuid, 10000, 10300, 'admin_adjust'), (${c.user.id}::uuid, 400, 400, 'gift')`);
    const charm = await board(a, 'charm.received', '?period=day');
    expect(charm.entries.filter((e) => [a.user.uid, c.user.uid].includes(e.player!.uid)).map((e) => [e.player!.uid, e.value])).toEqual([
      [c.user.uid, 400],
      [a.user.uid, 300],
    ]);
    await call('POST', '/api/players/like', bearer(b.token), { uid: c.user.uid });
    await call('POST', '/api/players/like', bearer(b.token), { uid: c.user.uid });
    await call('POST', '/api/players/follow', bearer(a.token), { uid: c.user.uid });
    const likes = await board(a, 'profile.likes', '?period=week');
    expect(likes.entries.find((e) => e.player!.uid === c.user.uid)?.value).toBe(1);
    const featured = await board(a, 'profile.featured', '?period=week');
    expect(featured.entries.find((e) => e.player!.uid === c.user.uid)).toMatchObject({ value: 2, detail: { likes: 1, followers: 1 } });
    await call('POST', '/api/players/unlike', bearer(b.token), { uid: c.user.uid });
    clearLeaderboardCache();
    expect((await board(a, 'profile.likes', '?period=week')).entries.find((e) => e.player!.uid === c.user.uid)).toBeUndefined();
  });

  it('lists boards with only the periods they support; inactive boards are empty, never filled with made-up rows', async () => {
    const a = await register(t);
    const list = (await call('GET', '/api/leaderboards', bearer(a.token))).json().boards as { id: string; periods: string[]; active: boolean }[];
    expect(list.find((b) => b.id === 'poker.current_streak')!.periods).toEqual(['all']);
    expect(list.find((b) => b.id === 'poker.wins')!.periods).not.toContain('season'); // no active season in this test
    expect(list.find((b) => b.id === 'events.seasonal')!.active).toBe(false);
    expect((await board(a, 'events.seasonal')).entries).toEqual([]);
    expect((await board(a, 'tournament.titles')).entries).toEqual([]);
    expect((await call('GET', '/api/leaderboards/nope.board', bearer(a.token))).statusCode).toBe(404);
  });
});

describe('closing a month', () => {
  it('snapshots once, gives reigning + Hall of Fame frames to the Top 3 once, and never changes the snapshot', async () => {
    const last = previousMonth();
    const inLast = new Date(last.start!.getTime() + 5 * 86_400_000);
    const [a, b, c, d] = [await register(t), await register(t), await register(t), await register(t)];
    for (let i = 0; i < 9; i++) await W(a, 'roulette', { at: inLast });
    for (let i = 0; i < 7; i++) await W(b, 'roulette', { at: inLast });
    for (let i = 0; i < 5; i++) await W(c, 'roulette', { at: inLast });
    for (let i = 0; i < 3; i++) await W(d, 'roulette', { at: inLast });
    const def = boardById('roulette.wins')!;
    // A running period is never awarded.
    const now = { ...last, key: 'M-current', start: new Date(), end: new Date(Date.now() + 86_400_000) };
    await expect(finalizeBoard(t.db, def, now)).rejects.toThrow();
    const r = await finalizeBoard(t.db, def, last);
    expect(r).toMatchObject({ finalized: true });
    const again = await finalizeBoard(t.db, def, last);
    expect(again).toEqual({ finalized: false, awarded: 0 });
    const inv = await rows<{ uid: string; item_id: string; expires_at: Date | null }>(sql`
      SELECT u.uid, i.item_id, i.expires_at FROM inventory_items i JOIN users u ON u.id = i.user_id
      WHERE i.user_id IN (${a.user.id}::uuid, ${b.user.id}::uuid, ${c.user.id}::uuid, ${d.user.id}::uuid) ORDER BY u.uid, i.item_id`);
    const items = (uid: number) => inv.filter((x) => Number(x.uid) === uid).map((x) => x.item_id);
    expect(items(a.user.uid)).toEqual(['hof_champion', 'lb_roulette_champion']);
    expect(items(b.user.uid)).toEqual(['hof_elite', 'lb_roulette_elite']);
    expect(items(c.user.uid)).toEqual(['hof_master', 'lb_roulette_master']);
    expect(items(d.user.uid)).toEqual([]);
    const reign = inv.find((x) => x.item_id === 'lb_roulette_champion')!;
    expect(new Date(reign.expires_at!).getTime()).toBe(Date.UTC(last.end!.getUTCFullYear(), last.end!.getUTCMonth() + 1, 1));
    expect(inv.find((x) => x.item_id === 'hof_champion')!.expires_at).toBeNull();
    // Immutable history.
    await expect(t.db.execute(sql`UPDATE leaderboard_snapshots SET entries = '[]' WHERE board_id = 'roulette.wins'`)).rejects.toThrow();
    await expect(t.db.execute(sql`DELETE FROM leaderboard_awards WHERE board_id = 'roulette.wins'`)).rejects.toThrow();
    // Shown on the winner's profile.
    const prof = (await call('GET', `/api/players/${a.user.uid}`, bearer(b.token))).json().player;
    expect(prof.awards[0]).toMatchObject({ board: 'roulette.wins', place: 1, value: 9, reigningItem: 'lb_roulette_champion', legacyItem: 'hof_champion' });
    expect(prof.gameStats.find((g: { game: string }) => g.game === 'roulette')).toMatchObject({ wins: 9 });
    // The winner can wear the reigning frame.
    expect((await call('POST', '/api/me/equip', bearer(a.token), { slot: 'frame', itemId: 'lb_roulette_champion' })).statusCode).toBe(200);
  });

  it('tournament frames only for a finished tournament, once', async () => {
    const [a, b] = [await register(t), await register(t)];
    const [running] = await rows<{ id: string }>(sql`INSERT INTO tournaments (name_vi, name_en, game, starts_at, ends_at, status) VALUES ('Giải A', 'Cup A', 'poker', now() - interval '1 day', now() + interval '1 day', 'running') RETURNING id`);
    await expect(finalizeTournament(t.db, null, running!.id, [{ userId: a.user.id, placement: 1, points: 100 }])).rejects.toThrow();
    const [done] = await rows<{ id: string }>(sql`INSERT INTO tournaments (name_vi, name_en, game, starts_at, ends_at, status) VALUES ('Giải B', 'Cup B', 'poker', now() - interval '2 day', now() - interval '1 hour', 'running') RETURNING id`);
    await finalizeTournament(t.db, null, done!.id, [{ userId: a.user.id, placement: 1, points: 100 }, { userId: b.user.id, placement: 2, points: 60 }]);
    await expect(finalizeTournament(t.db, null, done!.id, [{ userId: a.user.id, placement: 1, points: 100 }])).rejects.toThrow();
    const got = await rows<{ item_id: string }>(sql`SELECT item_id FROM inventory_items WHERE user_id = ${a.user.id}::uuid AND source = 'tournament'`);
    expect(got.map((g) => g.item_id)).toEqual(['tour_champion']);
    clearLeaderboardCache();
    const titles = await board(a, 'tournament.titles');
    expect(titles.entries.find((e) => e.player!.uid === a.user.uid)?.value).toBe(1);
  });
});

describe('role frames', () => {
  it('follow real roles only: cannot be bought, granted, owned or traded, and disappear with the role', async () => {
    const player = await register(t);
    const mod = await createStaff(t, 'moderator');
    const superAdmin = await createStaff(t, 'super_admin');
    const equip = (token: string, itemId: string) => call('POST', '/api/me/equip', bearer(token), { slot: 'frame', itemId });
    expect(code(await equip(player.token, 'role_moderator'))).toBe('not_owned');
    expect(code(await equip(player.token, 'role_owner_gm'))).toBe('not_owned');
    expect((await equip(mod.token, 'role_moderator')).statusCode).toBe(200);
    expect(code(await equip(mod.token, 'role_admin'))).toBe('not_owned');
    expect((await equip(superAdmin.token, 'role_super_admin')).statusCode).toBe(200);
    // Owner variants are per UID: UID 1002 wears Keyo_GM's, never Keyo Captain's.
    expect((await equip(owner.token, 'role_owner_gm')).statusCode).toBe(200);
    expect(code(await equip(owner.token, 'role_owner_captain'))).toBe('not_owned');
    const inv = (await call('GET', '/api/me/inventory', bearer(mod.token))).json();
    expect(inv.roleFrames).toEqual(['role_moderator']);
    // Never owned, bought, priced or traded.
    await expect(t.db.transaction((tx) => grantItem(tx, player.user.id, 'role_admin', 'admin', null))).rejects.toThrow();
    await expect(t.db.execute(sql`INSERT INTO inventory_items (user_id, item_id, kind, source) VALUES (${player.user.id}::uuid, 'role_admin', 'frame', 'admin')`)).rejects.toThrow();
    expect(code(await call('POST', '/api/shop/buy', bearer(player.token), { itemId: 'role_admin' }))).toMatch(/item_not_found|not_found|bad_request/);
    expect(code(await call('PATCH', '/api/admin/items/role_admin', owner.headers, { priceSilver: 1000 }))).toBe('forbidden');
    expect(code(await call('PATCH', '/api/admin/items/role_admin', owner.headers, { tradable: true }))).toBe('forbidden');
    // Losing the role takes the frame off; the rest of the profile is untouched.
    expect((await call('DELETE', `/api/admin/users/${mod.user.uid}/roles/moderator`, owner.headers)).statusCode).toBe(200);
    const [u] = await rows<{ frame: string }>(sql`SELECT frame FROM users WHERE id = ${mod.user.id}::uuid`);
    expect(u!.frame).toBe('classic');
    expect(code(await equip(mod.token, 'role_moderator'))).toMatch(/not_owned|unauthorized/);
  });
});

describe('maintenance', () => {
  it('reset:test-data covers the new tables', async () => {
    expect(await uncoveredForeignKeys(t.db)).toEqual([]);
  });
});
