import { randomUUID } from 'node:crypto';
import { DIVISIONS, GAMEPLAY_EXP, LEVEL_MAX, MAX_DIVISION, PROTECTED_MAX_DIVISION, SERIES_DIVISIONS, totalExpForLevel, type ProgressView } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordRankedMatch } from '../src/services/rank';
import { createOwner, createStaff, randomIp, reauthHeaders, register, startTestApp, TestSocket, type TestApp } from './helpers';

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
const idx = (tier: string, roman: number) => DIVISIONS.find((d) => d.tier === tier && d.roman === roman)!.index;
const progress = async (token: string) => (await t.app.inject({ url: '/api/me/progress', headers: { authorization: `Bearer ${token}` } })).json() as ProgressView;
const asOwner = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  t.app.inject({ method, url, payload, headers: await reauthHeaders(t, owner.token), remoteAddress: randomIp() });
const setRank = (userId: string, seasonId: number, division: number, rp: number, streak = 0) =>
  t.db.execute(sql`INSERT INTO player_ranks (season_id, user_id, division, rp, streak, peak_division) VALUES (${seasonId}, ${userId}, ${division}, ${rp}, ${streak}, ${division})
    ON CONFLICT (season_id, user_id) DO UPDATE SET division = EXCLUDED.division, rp = EXCLUDED.rp, streak = EXCLUDED.streak, rp_at = now()`);

describe('level & EXP', () => {
  it('gives EXP for each settled round exactly once, on the server', async () => {
    const p = await register(t);
    const ws = await TestSocket.connect(t.port, p.token);
    const id = randomUUID();
    await ws.ok({ type: 'slots.spin', bet: 100 }, id);
    await ws.ok({ type: 'slots.spin', bet: 100 }, id); // replayed message: same round, no second EXP
    await ws.ok({ type: 'slots.spin', bet: 1000 });
    const pr = await progress(p.token);
    expect(pr.level).toMatchObject({ level: 1, totalExp: GAMEPLAY_EXP.perRound * 2 + GAMEPLAY_EXP.bonus });
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM exp_events WHERE user_id = ${p.user.id}`)).n).toBe(2);
    await new Promise((r) => setTimeout(r, 100));
    expect(ws.events.some((e) => e.type === 'event' && e.event === 'progress')).toBe(true);
    ws.close();
  });

  it('stops gameplay EXP at the daily cap', async () => {
    const p = await register(t);
    const ws = await TestSocket.connect(t.port, p.token);
    await ws.ok({ type: 'slots.spin', bet: 100 });
    await t.db.execute(sql`UPDATE player_progress SET exp_today = ${GAMEPLAY_EXP.dailyCap - 4} WHERE user_id = ${p.user.id}`);
    await ws.ok({ type: 'slots.spin', bet: 100 });
    await ws.ok({ type: 'slots.spin', bet: 100 });
    const r = await one<{ exp: string; exp_today: number }>(sql`SELECT exp, exp_today FROM player_progress WHERE user_id = ${p.user.id}`);
    expect(Number(r.exp)).toBe(14);
    expect(r.exp_today).toBe(GAMEPLAY_EXP.dailyCap);
    ws.close();
  });

  it('delivers a level reward by mail once, and never passes level 999', async () => {
    const put = await asOwner('PUT', '/api/admin/progression/level-rewards/2', { attachments: [{ type: 'silver', amount: 500 }] });
    expect(put.statusCode).toBe(200);
    const p = await register(t);
    const adjust = (expDelta: number) => asOwner('POST', `/api/admin/users/${p.user.uid}/progression`, { expDelta, reason: 'event compensation', idempotencyKey: randomUUID() });
    expect((await adjust(150)).json().exp.levelsGained).toEqual([2]);
    await adjust(-100); // back to level 1
    await adjust(100); // level 2 again: no second reward
    const mail = await rows<{ subject: string; reward_key: string }>(sql`SELECT subject, reward_key FROM mail_messages WHERE user_id = ${p.user.id}`);
    expect(mail).toHaveLength(1);
    expect(mail[0]!.reward_key).toBe('level:2');
    const me = (await t.app.inject({ url: '/api/me', headers: { authorization: `Bearer ${p.token}` } })).json().user;
    expect(me.level).toBe(2);
    await adjust(10_000_000);
    const pr = await progress(p.token);
    expect(pr.level.level).toBe(LEVEL_MAX);
    expect(pr.level.totalExp).toBe(totalExpForLevel(LEVEL_MAX));
  });

  it('only Owner/Super Admin change EXP, RP and rewards; Admin can only read; others cannot', async () => {
    const p = await register(t);
    const admin = await createStaff(t, 'admin');
    const mod = await createStaff(t, 'moderator');
    const sup = await createStaff(t, 'super_admin');
    expect((await t.app.inject({ url: `/api/admin/users/${p.user.uid}/progression`, headers: admin.headers })).statusCode).toBe(200);
    expect((await t.app.inject({ url: `/api/admin/users/${p.user.uid}/progression`, headers: mod.headers })).statusCode).toBe(403);
    const body = { expDelta: 50, reason: 'try to grant exp', idempotencyKey: randomUUID() };
    expect((await t.app.inject({ method: 'POST', url: `/api/admin/users/${p.user.uid}/progression`, payload: body, headers: admin.headers })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'PUT', url: '/api/admin/progression/level-rewards/5', payload: { attachments: [{ type: 'silver', amount: 1 }] }, headers: admin.headers })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'POST', url: `/api/admin/users/${p.user.uid}/progression`, payload: body, headers: sup.headers })).statusCode).toBe(200);
    // A player can never change their own progress: there is no such route.
    expect((await t.app.inject({ method: 'POST', url: '/api/me/progress', headers: { authorization: `Bearer ${p.token}` }, payload: { exp: 1e9 } })).statusCode).toBe(404);
  });
});

describe('ranked seasons', () => {
  let seasonId: number;

  it('refuses ranked results without a running season', async () => {
    const p = await register(t);
    await expect(recordRankedMatch(t.db, 'm-none', [{ userId: p.user.id, result: 'win' }])).rejects.toMatchObject({ code: 'season_inactive' });
  });

  it('Owner creates and starts a season; only one can run', async () => {
    const create = await asOwner('POST', '/api/admin/rank/seasons', {
      name: 'Mùa 1',
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      rewards: { tiers: { bronze: [{ type: 'silver', amount: 100 }], wargod: [{ type: 'gold', amount: 50 }] }, top: { vuong_gia: [{ type: 'gold', amount: 500 }] } },
    });
    expect(create.statusCode).toBe(200);
    seasonId = create.json().season.id;
    expect((await asOwner('POST', `/api/admin/rank/seasons/${seasonId}/start`)).statusCode).toBe(200);
    const second = await asOwner('POST', '/api/admin/rank/seasons', { name: 'Mùa 2', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString() });
    const res = await asOwner('POST', `/api/admin/rank/seasons/${second.json().season.id}/start`);
    expect(res.json().error.code).toBe('season_active');
  });

  it('applies each match once: protected losses, replays and concurrent duplicates', async () => {
    const a = await register(t);
    const b = await register(t);
    const first = await recordRankedMatch(t.db, 'match-1', [{ userId: a.user.id, result: 'win' }, { userId: b.user.id, result: 'loss' }]);
    expect(first.every((r) => r.applied)).toBe(true);
    const replay = await recordRankedMatch(t.db, 'match-1', [{ userId: a.user.id, result: 'win' }, { userId: b.user.id, result: 'loss' }]);
    expect(replay.some((r) => r.applied)).toBe(false);
    await Promise.allSettled([1, 2, 3, 4].map(() => recordRankedMatch(t.db, 'match-2', [{ userId: a.user.id, result: 'win' }])));
    const pa = await progress(a.token);
    expect(pa.rank!.state).toEqual({ division: 0, rp: 50, streak: 0 });
    expect(pa.rank!.wins).toBe(2);
    const pb = await progress(b.token);
    expect(pb.rank!.state).toEqual({ division: 0, rp: 0, streak: 0 }); // Đồng III: no RP loss
    expect(pb.rank!.protected).toBe(true);
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM rank_events WHERE user_id = ${a.user.id}`)).n).toBe(2);
  });

  it('drops Bạch Kim V to Vàng I, then protects Vàng I', async () => {
    const p = await register(t);
    await setRank(p.user.id, seasonId, idx('platinum', 5), 10);
    expect((await progress(p.token)).rank!.demotionRisk).toBe(true);
    await recordRankedMatch(t.db, 'd-1', [{ userId: p.user.id, result: 'loss' }]);
    expect((await progress(p.token)).rank!.state).toEqual({ division: PROTECTED_MAX_DIVISION, rp: 190, streak: 0 });
    await recordRankedMatch(t.db, 'd-2', [{ userId: p.user.id, result: 'loss' }]);
    expect((await progress(p.token)).rank!.state).toEqual({ division: PROTECTED_MAX_DIVISION, rp: 190, streak: 0 });
    const ev = await one<{ demoted: boolean }>(sql`SELECT demoted FROM rank_events WHERE user_id = ${p.user.id} AND match_key = 'd-1'`);
    expect(ev.demoted).toBe(true);
  });

  it('needs 3 wins in a row from Bạch Kim I; a loss resets the series', async () => {
    const p = await register(t);
    const pI = SERIES_DIVISIONS[0]!;
    await setRank(p.user.id, seasonId, pI, 200);
    const play = (key: string, result: 'win' | 'loss') => recordRankedMatch(t.db, key, [{ userId: p.user.id, result }]);
    await play('s1', 'win');
    await play('s2', 'win');
    expect((await progress(p.token)).rank).toMatchObject({ state: { division: pI, rp: 200, streak: 2 }, seriesActive: true });
    await play('s3', 'loss');
    expect((await progress(p.token)).rank!.state).toEqual({ division: pI, rp: 180, streak: 0 });
    for (const k of ['s4', 's5', 's6', 's7']) await play(k, 'win');
    expect((await progress(p.token)).rank!.state).toEqual({ division: idx('diamond', 5), rp: 0, streak: 0 });
  });

  it('ranks the Top 50 among full Chiến Thần I only, with one title each and a stable tie-break', async () => {
    const players = [];
    for (let i = 0; i < 12; i++) players.push(await register(t));
    for (const [i, p] of players.entries()) await setRank(p.user.id, seasonId, MAX_DIVISION, 300 - i * 5);
    // Tie: two players on 245; the one who got there first ranks higher.
    await setRank(players[10]!.user.id, seasonId, MAX_DIVISION, 245);
    await setRank(players[11]!.user.id, seasonId, MAX_DIVISION, 245);
    await t.db.execute(sql`UPDATE player_ranks SET rp_at = now() - interval '1 hour' WHERE user_id = ${players[11]!.user.id}`);
    const almost = await register(t);
    await setRank(almost.user.id, seasonId, MAX_DIVISION, 199); // not eligible
    const ladder = (await t.app.inject({ url: '/api/rank/ladder' })).json().entries as { uid: number; topTitle: string | null; rp: number }[];
    const top = ladder.filter((e) => e.topTitle);
    expect(top).toHaveLength(12);
    expect(top.slice(0, 3).every((e) => e.topTitle === 'vuong_gia')).toBe(true);
    expect(top.slice(3, 10).every((e) => e.topTitle === 'than_tuong')).toBe(true);
    expect(top.slice(10).every((e) => e.topTitle === 'than_vuong')).toBe(true);
    expect(top[10]!.uid).toBe(players[11]!.user.uid);
    expect(top[11]!.uid).toBe(players[10]!.user.uid);
    expect(ladder.find((e) => e.uid === almost.user.uid)!.topTitle).toBeNull();
    const me = await progress(players[0]!.token);
    expect(me.rank).toMatchObject({ topPosition: 1, topTitle: 'vuong_gia' });
  });

  it('Admin and Moderator cannot touch RP; Owner can, with an audit entry', async () => {
    const p = await register(t);
    const admin = await createStaff(t, 'admin');
    const body = { rpDelta: 400, reason: 'manual correction', idempotencyKey: randomUUID() };
    expect((await t.app.inject({ method: 'POST', url: `/api/admin/users/${p.user.uid}/progression`, payload: body, headers: admin.headers })).statusCode).toBe(403);
    const res = await asOwner('POST', `/api/admin/users/${p.user.uid}/progression`, body);
    expect(res.json().rank).toEqual({ division: 2, rp: 0, streak: 0 });
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'progression.adjust' AND target_id = ${String(p.user.uid)}`)).n).toBe(1);
  });

  it('ends the season once: final standings, rewards by mail once, soft reset next season, level kept', async () => {
    const p = await register(t);
    await setRank(p.user.id, seasonId, MAX_DIVISION, 400);
    const levelBefore = (await progress(p.token)).level;
    const end = await asOwner('POST', `/api/admin/rank/seasons/${seasonId}/end`, { reason: 'season finished' });
    expect(end.statusCode).toBe(200);
    expect(end.json().players).toBeGreaterThan(10);
    expect((await asOwner('POST', `/api/admin/rank/seasons/${seasonId}/end`, { reason: 'season finished' })).json().error.code).toBe('season_inactive');
    const res = await one<{ top_position: number; top_title: string }>(sql`SELECT top_position, top_title FROM rank_season_results WHERE season_id = ${seasonId} AND user_id = ${p.user.id}`);
    expect(res).toEqual({ top_position: 1, top_title: 'vuong_gia' });
    const mail = await rows<{ reward_key: string }>(sql`SELECT reward_key FROM mail_messages WHERE user_id = ${p.user.id} ORDER BY reward_key`);
    expect(mail.map((m) => m.reward_key)).toEqual([`season:${seasonId}:tier`, `season:${seasonId}:top`]);
    // Bronze players got the bronze reward too; nobody got anything twice.
    const dup = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM (SELECT user_id, reward_key FROM mail_messages WHERE reward_key LIKE 'season:%' GROUP BY 1, 2 HAVING count(*) > 1) d`);
    expect(dup.n).toBe(0);

    const next = await asOwner('POST', '/api/admin/rank/seasons', { name: 'Mùa 3', startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString() });
    await asOwner('POST', `/api/admin/rank/seasons/${next.json().season.id}/start`);
    const pr = await progress(p.token);
    expect(pr.rank).toMatchObject({ seasonName: 'Mùa 3', state: { division: MAX_DIVISION - 5, rp: 0, streak: 0 } });
    expect(pr.level).toEqual(levelBefore);
    const hist = (await t.app.inject({ url: '/api/me/rank/seasons', headers: { authorization: `Bearer ${p.token}` } })).json().results;
    expect(hist[0]).toMatchObject({ seasonId, topTitle: 'vuong_gia' });
  });
});
