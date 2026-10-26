import { DAILY_LOGIN_SILVER } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomIp, register, startTestApp, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const claim = (token: string) => t.app.inject({ method: 'POST', url: '/api/me/checkin', headers: { authorization: `Bearer ${token}` }, remoteAddress: randomIp() });

describe('daily login reward', () => {
  it('pays 30,000 Cxu Bạc once per day, even when claimed many times at once', async () => {
    const p = await register(t);
    const [before] = await t.db.execute<{ balance: string }>(sql`SELECT balance FROM wallets WHERE user_id = ${p.user.id}`);
    const tries = await Promise.all(Array.from({ length: 5 }, () => claim(p.token)));
    expect(tries.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(tries.filter((r) => r.statusCode !== 200).every((r) => r.json().error.code === 'checkin_done')).toBe(true);
    const [after] = await t.db.execute<{ balance: string; n: number }>(sql`
      SELECT w.balance, (SELECT count(*)::int FROM ledger_entries WHERE user_id = w.user_id AND reason = 'checkin') AS n FROM wallets w WHERE w.user_id = ${p.user.id}`);
    expect(Number(after!.balance) - Number(before!.balance)).toBe(DAILY_LOGIN_SILVER);
    expect(after!.n).toBe(1);
  });

  it('pays the same 30,000 on every day of the streak and again the next day', async () => {
    const p = await register(t);
    for (let day = 1; day <= 8; day++) {
      const res = await claim(p.token);
      expect(res.statusCode).toBe(200);
      expect(res.json().reward).toEqual({ silver: DAILY_LOGIN_SILVER, gold: 0 });
      // Move the last claim back one day, as if the player returns tomorrow.
      await t.db.execute(sql`UPDATE users SET last_checkin_date = last_checkin_date - 1 WHERE id = ${p.user.id}`);
    }
    const [r] = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ledger_entries WHERE user_id = ${p.user.id} AND reason = 'checkin'`);
    expect(r!.n).toBe(8);
  });
});
