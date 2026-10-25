import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOwner, createStaff, randomIp, register, startTestApp, TestSocket, type TestApp } from './helpers';

let t: TestApp;
let owner: Awaited<ReturnType<typeof createOwner>>;
let player: Awaited<ReturnType<typeof register>>;

beforeAll(async () => {
  t = await startTestApp();
  owner = await createOwner(t);
  player = await register(t);
  const ws = await TestSocket.connect(t.port, player.token);
  await ws.ok({ type: 'slots.spin', bet: 100 });
  await ws.ok({ type: 'slots.spin', bet: 200 });
  ws.close();
});
afterAll(async () => {
  await t.app.close();
});

const get = (url: string, headers: Record<string, string>) => t.app.inject({ url, headers, remoteAddress: randomIp() });

describe('dashboard', () => {
  it('reports real numbers from the database', async () => {
    const d = (await get('/api/admin/dashboard', owner.headers)).json();
    const [counts] = await t.db.execute<{ players: string; rounds: string; silver: string }>(sql`
      SELECT (SELECT count(*) FROM users WHERE account_type = 'player') AS players,
             (SELECT count(*) FROM game_rounds WHERE status = 'settled') AS rounds,
             (SELECT sum(balance) FROM wallets) AS silver`);
    expect(d.players.total).toBe(Number(counts!.players));
    expect(d.players.newToday).toBeGreaterThanOrEqual(2);
    expect(d.rounds.total).toBe(Number(counts!.rounds));
    expect(d.rounds.wagered24h).toBe(300);
    expect(d.circulation.silver).toBe(Number(counts!.silver));
    expect(d.series).toHaveLength(14);
    expect(d.series.at(-1).rounds).toBe(2);
    expect(d.recentTransactions.length).toBeGreaterThan(0);
    expect(d.alerts.map((a: { code: string }) => a.code)).toContain('test_mode');
  });

  it('hides individual transactions from staff without economy.read', async () => {
    const mod = await createStaff(t, 'moderator');
    const d = (await get('/api/admin/dashboard', mod.headers)).json();
    expect(d.recentTransactions).toBeNull();
    expect(d.players.total).toBeGreaterThan(0);
  });

  it('is closed to Support (no dashboard.read) and players', async () => {
    const sup = await createStaff(t, 'support');
    expect((await get('/api/admin/dashboard', sup.headers)).statusCode).toBe(403);
    expect((await get('/api/admin/dashboard', { authorization: `Bearer ${player.token}` })).statusCode).toBe(403);
  });
});

describe('player drill-down', () => {
  it('shows inventory, rounds and stats; security history only with users.pii', async () => {
    const ws = await TestSocket.connect(t.port, player.token);
    await ws.ok({ type: 'slots.spin', bet: 50 });
    ws.close();
    const a = (await get(`/api/admin/users/${player.user.uid}/activity`, owner.headers)).json();
    expect(a.stats).toEqual({ rounds: 3, wagered: 350, won: expect.any(Number) });
    expect(a.rounds[0].game).toBe('slots');
    expect(a.security.map((s: { action: string }) => s.action)).toContain('account.register');
    const mod = await createStaff(t, 'moderator');
    expect((await get(`/api/admin/users/${player.user.uid}/activity`, mod.headers)).json().security).toBeNull();
  });

  it('ledger is economy data: Owner yes, Admin no', async () => {
    const entries = (await get(`/api/admin/users/${player.user.uid}/ledger`, owner.headers)).json().entries;
    expect(entries[0]).toMatchObject({ currency: 'silver' });
    const adm = await createStaff(t, 'admin');
    expect((await get(`/api/admin/users/${player.user.uid}/ledger`, adm.headers)).statusCode).toBe(403);
  });

  it('ban history names who issued and lifted each ban', async () => {
    const target = await register(t);
    const ban = (await t.app.inject({ method: 'POST', url: `/api/admin/users/${target.user.uid}/bans`, headers: owner.headers, payload: { duration: 'permanent', reason: 'abuse' } })).json().ban;
    await t.app.inject({ method: 'POST', url: `/api/admin/bans/${ban.id}/revoke`, headers: owner.headers, payload: { reason: 'appeal accepted' } });
    const detail = (await get(`/api/admin/users/${target.user.uid}`, owner.headers)).json();
    expect(detail.bans[0]).toMatchObject({ reason: 'abuse', issuedByUid: 1002, revokedByUid: 1002, revokeReason: 'appeal accepted' });
  });
});

describe('audit browser', () => {
  it('filters by action prefix, actor and target', async () => {
    const target = await register(t);
    await t.app.inject({
      method: 'POST',
      url: `/api/admin/users/${target.user.uid}/grant`,
      headers: owner.headers,
      payload: { amount: 10, reason: 'audit test', idempotencyKey: randomUUID() },
    });
    const byAction = (await get('/api/admin/audit/search?action=economy.', owner.headers)).json().entries;
    expect(byAction.length).toBeGreaterThan(0);
    expect(byAction.every((e: { action: string }) => e.action.startsWith('economy.'))).toBe(true);
    expect(byAction[0]).toMatchObject({ actorUid: 1002, actorName: 'keyo_gm', targetId: String(target.user.uid) });
    const byTarget = (await get(`/api/admin/audit/search?target=${target.user.uid}`, owner.headers)).json().entries;
    expect(byTarget.some((e: { action: string }) => e.action === 'account.register')).toBe(true);
    const byActor = (await get('/api/admin/audit/search?actor=1002&action=economy.grant', owner.headers)).json().entries;
    expect(byActor.length).toBe(byAction.length);
    expect((await get('/api/admin/audit/search?action=DROP%20TABLE', owner.headers)).statusCode).toBe(400);
  });

  it('is limited to audit.read', async () => {
    const adm = await createStaff(t, 'admin');
    expect((await get('/api/admin/audit/search', adm.headers)).statusCode).toBe(403);
  });
});

describe('alerts', () => {
  // Runs last: it starts a second app, which resets the shared test database.
  it('flags a missing Owner', async () => {
    const t2 = await startTestApp();
    try {
      const sa = await createStaff(t2, 'super_admin');
      const d = (await t2.app.inject({ url: '/api/admin/dashboard', headers: sa.headers })).json();
      expect(d.alerts.map((a: { code: string }) => a.code)).toContain('no_owner');
    } finally {
      await t2.app.close();
    }
  });
});
