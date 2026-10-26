import { MISSION_RULES, type MissionsOverview } from '@casino/shared';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOwner, randomIp, register, startTestApp, TestSocket, type TestApp } from './helpers';

let t: TestApp;
let seasonId: number;
beforeAll(async () => {
  t = await startTestApp();
  const owner = await createOwner(t);
  const s = await t.app.inject({ method: 'POST', url: '/api/admin/rank/seasons', headers: owner.headers, remoteAddress: randomIp(), payload: { name: 'Mùa Nhiệm Vụ', startsAt: new Date(Date.now() - 60_000).toISOString() } });
  seasonId = s.json().season.id;
  await t.app.inject({ method: 'POST', url: `/api/admin/rank/seasons/${seasonId}/start`, headers: owner.headers, remoteAddress: randomIp() });
});
afterAll(async () => {
  await t.app.close();
});

type Player = Awaited<ReturnType<typeof register>>;
const call = (p: Player, method: 'GET' | 'POST', url: string, payload?: unknown) =>
  t.app.inject({ method, url, headers: { authorization: `Bearer ${p.token}` }, payload: payload as object, remoteAddress: randomIp() });
const overview = async (p: Player) => (await call(p, 'GET', '/api/missions')).json() as MissionsOverview;
const mission = async (p: Player, id: string) => (await overview(p)).missions.find((m) => m.id === id)!;
const claim = (p: Player, id: string) => call(p, 'POST', '/api/missions/claim', { id });

async function silver(userId: string) {
  const [r] = await t.db.execute<{ balance: string; ledger: string }>(sql`
    SELECT balance, (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = ${userId} AND currency = 'silver') AS ledger FROM wallets WHERE user_id = ${userId}`);
  expect(r!.balance).toBe(r!.ledger);
  return Number(r!.balance);
}

/** A ranked result as the rank service writes it (season, result, optional card match). */
async function rankedResult(userId: string, result: 'win' | 'loss', matchKey = `test:${randomUUID()}`) {
  await t.db.execute(sql`
    INSERT INTO rank_events (season_id, user_id, match_key, result, rp_delta, division_before, division_after, rp_before, rp_after, streak_after)
    VALUES (${seasonId}, ${userId}, ${matchKey}, ${result}, 0, 0, 0, 0, 0, 0)`);
}

describe('missions', () => {
  it('progress comes only from settled play; a mission pays once per period', async () => {
    const p = await register(t);
    expect((await mission(p, 'daily_play')).progress).toBe(0);
    expect((await claim(p, 'daily_play')).json().error.code).toBe('mission_incomplete');
    const s = await TestSocket.connect(t.port, p.token);
    for (let i = 0; i < 3; i++) await s.ok({ type: 'slots.spin', bet: 100 });
    s.close();
    const m = await mission(p, 'daily_play');
    expect(m.progress).toBe(3);
    expect(m.resetsAt).toMatch(/T00:00:00.000Z$/);
    const before = await silver(p.user.id);
    const [a, b] = await Promise.all([claim(p, 'daily_play'), claim(p, 'daily_play')]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect(await silver(p.user.id)).toBe(before + 300);
    expect((await mission(p, 'daily_play')).claimed).toBe(true);
    expect((await mission(p, 'daily_wager')).progress).toBe(300);
    expect((await claim(p, 'no_such_mission')).statusCode).toBe(404);
  });

  it('claims made by the old quest system still count as claimed', async () => {
    const p = await register(t);
    const [key] = await t.db.execute<{ k: string }>(sql`SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS k`);
    await t.db.execute(sql`INSERT INTO quest_claims (user_id, quest_id, period_key) VALUES (${p.user.id}, 'daily_play', ${key!.k})`);
    expect((await mission(p, 'daily_play')).claimed).toBe(true);
  });

  it('rank missions read real ranked results, skip forfeits and cap weekly VIP EXP', async () => {
    const p = await register(t);
    // Two wins, one loss, and a forfeited card match that must not count.
    await rankedResult(p.user.id, 'win');
    await rankedResult(p.user.id, 'win');
    await rankedResult(p.user.id, 'loss');
    const [opp] = await t.db.execute<{ id: string }>(sql`SELECT id FROM users WHERE id <> ${p.user.id} AND account_type = 'player' LIMIT 1`);
    await t.db.execute(sql`INSERT INTO card_tables (id, game, name_vi, name_en, config, mode) VALUES ('rk-mission-1', 'poker', 'x', 'x', '{}', 'ranked') ON CONFLICT DO NOTHING`);
    const [match] = await t.db.execute<{ id: string }>(sql`
      INSERT INTO ranked_matches (game, table_id, season_id, players, status, forfeit_id, winner_id)
      VALUES ('poker', 'rk-mission-1', ${seasonId}, ARRAY[${p.user.id}, ${opp!.id}]::uuid[], 'done', ${p.user.id}, ${opp!.id}) RETURNING id`);
    await rankedResult(p.user.id, 'loss', `card:${match!.id}`);
    expect((await mission(p, 'rank_week_play')).progress).toBe(3);
    expect((await mission(p, 'rank_week_win')).progress).toBe(2);
    expect((await claim(p, 'rank_week_win')).json().error.code).toBe('mission_incomplete');

    // Season goals from the player's peak division this season.
    await t.db.execute(sql`
      INSERT INTO player_ranks (season_id, user_id, division, rp, peak_division) VALUES (${seasonId}, ${p.user.id}, 10, 0, 10)
      ON CONFLICT (season_id, user_id) DO UPDATE SET division = 10, peak_division = 10`);
    for (const id of ['rank_reach_silver', 'rank_reach_gold', 'rank_reach_platinum']) expect((await claim(p, id)).statusCode).toBe(200);
    // 20 + 30 + 40 = 90 VIP EXP so far; the next 25 is trimmed to the 100 cap.
    await rankedResult(p.user.id, 'win');
    const res = await claim(p, 'rank_week_win');
    expect(res.statusCode).toBe(200);
    expect(res.json().reward.vipExp).toBe(MISSION_RULES.vipExpWeeklyCap - 90);
    const o = await overview(p);
    expect(o.vip).toEqual({ exp: MISSION_RULES.vipExpWeeklyCap, weekGranted: MISSION_RULES.vipExpWeeklyCap, weekCap: MISSION_RULES.vipExpWeeklyCap });
    // Further rank missions this week still pay Cxu but no more VIP EXP.
    await rankedResult(p.user.id, 'loss');
    await rankedResult(p.user.id, 'loss');
    const more = await claim(p, 'rank_week_play');
    expect(more.json().reward.vipExp).toBe(0);
    const [vip] = await t.db.execute<{ exp: string }>(sql`SELECT exp FROM vip_progress WHERE user_id = ${p.user.id}`);
    expect(Number(vip!.exp)).toBe(MISSION_RULES.vipExpWeeklyCap);
  });

  it('season missions are unavailable without a running season', async () => {
    const p = await register(t);
    await t.db.execute(sql`UPDATE rank_seasons SET status = 'ended' WHERE id = ${seasonId}`);
    try {
      const m = await mission(p, 'rank_reach_silver');
      expect(m.unavailable).toBe(true);
      expect((await claim(p, 'rank_reach_silver')).json().error.code).toBe('season_inactive');
    } finally {
      await t.db.execute(sql`UPDATE rank_seasons SET status = 'active' WHERE id = ${seasonId}`);
    }
  });
});
