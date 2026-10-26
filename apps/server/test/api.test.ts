import { CHECKIN_REWARDS, checkinDate, ECONOMY, FRAMES } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createOwner, register, startTestApp, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.app.close();
});

/** Ledger sums must equal the wallet for both currencies. */
async function ledgerMatches(userId: string) {
  const [row] = await t.db.execute<{ s: string; g: string; balance: string; gold: string }>(sql`
    SELECT (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = ${userId} AND currency = 'silver') AS s,
           (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = ${userId} AND currency = 'gold') AS g,
           balance, gold FROM wallets WHERE user_id = ${userId}
  `);
  expect(Number(row!.s)).toBe(Number(row!.balance));
  expect(Number(row!.g)).toBe(Number(row!.gold));
}

describe('auth & profile', () => {
  it('registers with the starting balance', async () => {
    const { token, user } = await register(t, 'alice');
    expect(user.balance).toBe(ECONOMY.welcome.silver);
    const me = await t.app.inject({ url: '/api/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.uid).toBe(user.uid);
    expect(me.json().user.username).toBe(user.username);
    expect(user.username).toMatch(/^player_[a-f0-9]+$/);
  });

  it('rejects duplicate emails case-insensitively', async () => {
    const first = await register(t);
    const email = first.user.email;
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'Another Player',
        email: email.toUpperCase(),
        password: 'password123',
        confirmPassword: 'password123',
        acceptTerms: true,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('email_taken');
  });

  it('validates input', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'a!', password: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('bad_request');
  });

  it('logs in by UID and rejects bad passwords', async () => {
    const player = await register(t);
    const loginId = String(player.user.uid);
    const ok = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: loginId, password: 'password123' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().token).toBeTypeOf('string');
    expect(ok.json().user.uid).toBe(player.user.uid);
    const bad = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: loginId, password: 'wrongwrong' },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.code).toBe('invalid_credentials');
  });

  it('requires a token', async () => {
    const res = await t.app.inject({ url: '/api/me' });
    expect(res.statusCode).toBe(401);
  });

  it('updates profile without bypassing rename rules', async () => {
    const { token } = await register(t);
    const headers = { authorization: `Bearer ${token}` };
    const before = await t.app.inject({ url: '/api/me', headers });
    expect(before.statusCode).toBe(200);
    const originalName = before.json().user.displayName;

    const res = await t.app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers,
      payload: { locale: 'en', avatar: 3 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({
      displayName: originalName,
      locale: 'en',
      avatar: 3,
    });

    const forbidden = await t.app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers,
      payload: { displayName: 'Lucky' },
    });
    expect(forbidden.statusCode).not.toBe(200);

    const after = await t.app.inject({ url: '/api/me', headers });
    expect(after.json().user.displayName).toBe(originalName);
  });

  it('logout-all revokes existing tokens', async () => {
    const { token } = await register(t);
    const headers = { authorization: `Bearer ${token}` };
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/logout-all', headers })).statusCode).toBe(200);
    expect((await t.app.inject({ url: '/api/me', headers })).statusCode).toBe(401);
  });
});

describe('economy', () => {
  it('grants the silver starter reward on verification', async () => {
    const { token } = await register(t);
    const me = (await t.app.inject({ url: '/api/me', headers: { authorization: `Bearer ${token}` } })).json().user;
    expect(me.balance).toBe(ECONOMY.welcome.silver);
    expect(me.gold).toBe(ECONOMY.welcome.gold);
    expect(me.badges).toEqual([]);
    expect(me.checkin).toMatchObject({ streak: 0, claimedToday: false, nextDay: 1 });
  });

  it('daily check-in pays day 1 once per day', async () => {
    const { token, user } = await register(t);
    const headers = { authorization: `Bearer ${token}` };
    const first = (await t.app.inject({ method: 'POST', url: '/api/me/checkin', headers })).json();
    expect(first.day).toBe(1);
    expect(first.reward).toEqual(CHECKIN_REWARDS[0]);
    expect(first.user.balance).toBe(ECONOMY.welcome.silver + CHECKIN_REWARDS[0]!.silver);
    expect(first.user.checkin).toMatchObject({ streak: 1, claimedToday: true, nextDay: 2 });
    const second = await t.app.inject({ method: 'POST', url: '/api/me/checkin', headers });
    expect(second.statusCode).toBe(400);
    expect(second.json().error.code).toBe('checkin_done');
    await ledgerMatches(user.id);
  });

  it('check-in is safe under concurrent claims', async () => {
    const { token } = await register(t);
    const headers = { authorization: `Bearer ${token}` };
    const results = await Promise.all(Array.from({ length: 8 }, () => t.app.inject({ method: 'POST', url: '/api/me/checkin', headers })));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
  });

  it('continues the streak from yesterday and pays gold on day 7', async () => {
    const { token, user } = await register(t);
    const headers = { authorization: `Bearer ${token}` };
    const yesterday = checkinDate(new Date(Date.now() - 24 * 3600 * 1000));
    await t.db.execute(sql`UPDATE users SET checkin_streak = 6, last_checkin_date = ${yesterday} WHERE id = ${user.id}`);
    const res = (await t.app.inject({ method: 'POST', url: '/api/me/checkin', headers })).json();
    expect(res.day).toBe(7);
    expect(res.user.gold).toBe(ECONOMY.welcome.gold + CHECKIN_REWARDS[6]!.gold);
    await ledgerMatches(user.id);
  });

  it('restarts the cycle after a missed day', async () => {
    const { token, user } = await register(t);
    const headers = { authorization: `Bearer ${token}` };
    const old = checkinDate(new Date(Date.now() - 3 * 24 * 3600 * 1000));
    await t.db.execute(sql`UPDATE users SET checkin_streak = 4, last_checkin_date = ${old} WHERE id = ${user.id}`);
    const res = (await t.app.inject({ method: 'POST', url: '/api/me/checkin', headers })).json();
    expect(res.day).toBe(1);
  });

  it('rescue only works when nearly broke', async () => {
    const { token } = await register(t);
    const res = await t.app.inject({ method: 'POST', url: '/api/me/rescue', headers: { authorization: `Bearer ${token}` } });
    expect(res.json().error.code).toBe('rescue_not_available');
  });

  it('leaderboard lists players by balance', async () => {
    const res = await t.app.inject({ url: '/api/leaderboard' });
    const entries = res.json().entries as { rank: number; balance: number }[];
    expect(entries.length).toBeGreaterThan(0);
    for (let i = 1; i < entries.length; i++) expect(entries[i - 1]!.balance).toBeGreaterThanOrEqual(entries[i]!.balance);
  });
});

describe('shop', () => {
  it('buys and equips a frame with Cxu Bạc', async () => {
    const { token, user } = await register(t);
    const headers = { authorization: `Bearer ${token}` };
    const frame = FRAMES.find((f) => f.price > 0 && f.price <= ECONOMY.welcome.silver)!;
    const notOwned = await t.app.inject({ method: 'POST', url: '/api/me/frame', headers, payload: { itemId: frame.id } });
    expect(notOwned.json().error.code).toBe('not_owned');

    const bought = (await t.app.inject({ method: 'POST', url: '/api/shop/buy', headers, payload: { itemId: frame.id } })).json();
    expect(bought.user.balance).toBe(ECONOMY.welcome.silver - frame.price);
    expect(bought.user.gold).toBe(0);
    expect(bought.user.ownedFrames).toContain(frame.id);

    const again = await t.app.inject({ method: 'POST', url: '/api/shop/buy', headers, payload: { itemId: frame.id } });
    expect(again.statusCode).toBe(409);

    const equipped = (await t.app.inject({ method: 'POST', url: '/api/me/frame', headers, payload: { itemId: frame.id } })).json();
    expect(equipped.user.frame).toBe(frame.id);
    await ledgerMatches(user.id);
  });

  it('rejects purchases without enough silver, and unknown items', async () => {
    const { token, user } = await register(t);
    const headers = { authorization: `Bearer ${token}` };
    const expensive = FRAMES.reduce((a, b) => (b.price > a.price ? b : a));
    expect(expensive.price).toBeGreaterThan(ECONOMY.welcome.silver);
    const res = await t.app.inject({ method: 'POST', url: '/api/shop/buy', headers, payload: { itemId: expensive.id } });
    expect(res.json().error.code).toBe('insufficient_funds');
    const me = (await t.app.inject({ url: '/api/me', headers })).json().user;
    expect(me.ownedFrames).toEqual(['classic']);
    expect(me.balance).toBe(ECONOMY.welcome.silver);
    const unknown = await t.app.inject({ method: 'POST', url: '/api/shop/buy', headers, payload: { itemId: 'nope' } });
    expect(unknown.statusCode).toBe(404);
    await ledgerMatches(user.id);
  });

  it('concurrent purchases of the same frame charge once', async () => {
    const { token, user } = await register(t);
    const headers = { authorization: `Bearer ${token}` };
    const frame = FRAMES.find((f) => f.price > 0)!;
    const results = await Promise.all(Array.from({ length: 6 }, () => t.app.inject({ method: 'POST', url: '/api/shop/buy', headers, payload: { itemId: frame.id } })));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    const me = (await t.app.inject({ url: '/api/me', headers })).json().user;
    expect(me.balance).toBe(ECONOMY.welcome.silver - frame.price);
    await ledgerMatches(user.id);
  });
});

describe('admin', () => {
  it('only admins reach admin endpoints', async () => {
    const player = await register(t);
    const denied = await t.app.inject({ url: '/api/admin/overview', headers: { authorization: `Bearer ${player.token}` } });
    expect(denied.statusCode).toBe(403);

    // Registering grants nothing; the Owner (UID 1002) holds every permission.
    const owner = await createOwner(t);
    const headers = owner.headers;
    expect((await t.app.inject({ url: '/api/me', headers })).json().user.permissions).toContain('admin.access');
    const overview = await t.app.inject({ url: '/api/admin/overview', headers });
    expect(overview.statusCode).toBe(200);
    expect(overview.json().users).toBeGreaterThan(0);

    const grant = await t.app.inject({
      method: 'POST',
      url: `/api/admin/users/${player.user.uid}/grant`,
      headers,
      payload: { amount: 500, reason: 'test grant', idempotencyKey: randomUUID() },
    });
    expect(grant.json().balance).toBe(ECONOMY.welcome.silver + 500);
    const gold = await t.app.inject({
      method: 'POST',
      url: `/api/admin/users/${player.user.uid}/grant`,
      headers,
      payload: { amount: 7, currency: 'gold', reason: 'test gold', idempotencyKey: randomUUID() },
    });
    expect(gold.json().gold).toBe(ECONOMY.welcome.gold + 7);
    await ledgerMatches(player.user.id);

    const badges = await t.app.inject({
      method: 'POST',
      url: `/api/admin/users/${player.user.uid}/badges`,
      headers,
      payload: { verified: true, partner: true },
    });
    expect(badges.json().badges).toEqual(['verified', 'partner']);
    const board = (await t.app.inject({ url: '/api/leaderboard' })).json().entries as { username: string; badges: string[] }[];
    expect(board.find((e) => e.username === player.user.username)?.badges).toEqual(['verified', 'partner']);
    const me = (await t.app.inject({ url: '/api/me', headers: { authorization: `Bearer ${player.token}` } })).json().user;
    expect(me.badges).toEqual(['verified', 'partner']);

    const ban = await t.app.inject({
      method: 'POST',
      url: `/api/admin/users/${player.user.uid}/bans`,
      headers,
      payload: { duration: 'permanent', reason: 'test ban' },
    });
    expect(ban.statusCode).toBe(200);
    const banned = await t.app.inject({ url: '/api/me', headers: { authorization: `Bearer ${player.token}` } });
    expect(banned.statusCode).toBe(403);
    expect(banned.json().error).toMatchObject({ code: 'banned', endsAt: null, reason: 'test ban' });
  });
});
