import { ECONOMY } from '@casino/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { register, startTestApp, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.app.close();
});

describe('auth & profile', () => {
  it('registers with the starting balance', async () => {
    const { token, user } = await register(t, 'alice');
    expect(user.balance).toBe(ECONOMY.startingBalance);
    const me = await t.app.inject({ url: '/api/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.json().user.username).toBe('alice');
  });

  it('rejects duplicate usernames case-insensitively', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'ALICE', password: 'password123' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('username_taken');
  });

  it('validates input', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'a!', password: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('bad_request');
  });

  it('logs in and rejects bad passwords', async () => {
    const ok = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'Alice', password: 'password123' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().token).toBeTypeOf('string');
    const bad = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'alice', password: 'wrongwrong' } });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.code).toBe('invalid_credentials');
  });

  it('requires a token', async () => {
    const res = await t.app.inject({ url: '/api/me' });
    expect(res.statusCode).toBe(401);
  });

  it('updates profile', async () => {
    const { token } = await register(t);
    const res = await t.app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'Lucky', locale: 'en', avatar: 3 },
    });
    expect(res.json().user).toMatchObject({ displayName: 'Lucky', locale: 'en', avatar: 3 });
  });

  it('logout-all revokes existing tokens', async () => {
    const { token } = await register(t);
    const headers = { authorization: `Bearer ${token}` };
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/logout-all', headers })).statusCode).toBe(200);
    expect((await t.app.inject({ url: '/api/me', headers })).statusCode).toBe(401);
  });
});

describe('economy', () => {
  it('daily bonus can be claimed once per day', async () => {
    const { token } = await register(t);
    const headers = { authorization: `Bearer ${token}` };
    const first = await t.app.inject({ method: 'POST', url: '/api/me/daily-bonus', headers });
    expect(first.json().user.balance).toBe(ECONOMY.startingBalance + ECONOMY.dailyBonus);
    expect(first.json().user.nextDailyBonusAt).toBeTypeOf('string');
    const second = await t.app.inject({ method: 'POST', url: '/api/me/daily-bonus', headers });
    expect(second.json().error.code).toBe('bonus_not_ready');
  });

  it('daily bonus is safe under concurrent claims', async () => {
    const { token } = await register(t);
    const headers = { authorization: `Bearer ${token}` };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => t.app.inject({ method: 'POST', url: '/api/me/daily-bonus', headers })),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
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

describe('admin', () => {
  it('only admins reach admin endpoints', async () => {
    const player = await register(t);
    const denied = await t.app.inject({ url: '/api/admin/overview', headers: { authorization: `Bearer ${player.token}` } });
    expect(denied.statusCode).toBe(401);

    const admin = await register(t, 'boss');
    const headers = { authorization: `Bearer ${admin.token}` };
    const overview = await t.app.inject({ url: '/api/admin/overview', headers });
    expect(overview.statusCode).toBe(200);
    expect(overview.json().users).toBeGreaterThan(0);

    const grant = await t.app.inject({
      method: 'POST',
      url: `/api/admin/users/${player.user.username}/grant`,
      headers,
      payload: { amount: 500 },
    });
    expect(grant.json().balance).toBe(ECONOMY.startingBalance + 500);

    const ban = await t.app.inject({
      method: 'POST',
      url: `/api/admin/users/${player.user.username}/ban`,
      headers,
      payload: { banned: true },
    });
    expect(ban.statusCode).toBe(200);
    const me = await t.app.inject({ url: '/api/me', headers: { authorization: `Bearer ${player.token}` } });
    expect(me.statusCode).toBe(401);
  });
});
