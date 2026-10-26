import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { ECONOMY } from '@casino/shared';
import {
  startTestApp,
  TEST_PASSWORD,
  lastMail,
  codeIn,
  type TestApp,
} from './helpers';

describe('new registration starter reward', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    if (t) {
      await t.app.close();
      await t.db.$client.end();
    }
  });

  async function register(displayName: string, email?: string) {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName,
        ...(email ? { email } : {}),
        password: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
        acceptTerms: true,
      },
    });

    expect(res.statusCode).toBe(200);
    return res.json();
  }

  async function checkReward(userId: string) {
    const rows = await t.db.execute<{
      balance: string;
      starter_granted_at: Date | null;
      ledger_count: string;
      ledger_total: string;
    }>(sql`
      SELECT
        w.balance,
        u.starter_granted_at,
        (
          SELECT count(*)
          FROM ledger_entries l
          WHERE l.user_id = u.id AND l.reason = 'welcome'
        ) AS ledger_count,
        (
          SELECT coalesce(sum(l.delta), 0)
          FROM ledger_entries l
          WHERE l.user_id = u.id AND l.reason = 'welcome'
        ) AS ledger_total
      FROM users u
      JOIN wallets w ON w.user_id = u.id
      WHERE u.id = ${userId}
    `);

    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.balance)).toBe(ECONOMY.welcome.silver);
    expect(rows[0]!.starter_granted_at).not.toBeNull();
    expect(Number(rows[0]!.ledger_count)).toBe(1);
    expect(Number(rows[0]!.ledger_total)).toBe(ECONOMY.welcome.silver);
  }

  it('grants welcome silver without an email', async () => {
    const { user } = await register('No Email Player');
    expect(user.status).toBe('active');
    expect(user.uid).toBeGreaterThanOrEqual(100000);
    await checkReward(user.id);
  });

  it('grants welcome silver before email verification', async () => {
    const { user } = await register(
      'Email Player',
      'reward-test@example.test',
    );

    expect(user.status).toBe('active');
    expect(user.emailVerified).toBe(false);
    await checkReward(user.id);
  });

  it('does not grant the reward twice after verification', async () => {
    const email = 'reward-verify@example.test';
    const { user, token } = await register('Verify Player', email);

    await checkReward(user.id);

    const mail = await lastMail(t, email);
    expect(mail?.template).toBe('verify_email');

    const verified = await t.app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      headers: { authorization: `Bearer ${token}` },
      payload: { code: codeIn(mail!.body_text) },
    });

    expect(verified.statusCode).toBe(200);
    expect(verified.json().user.emailVerified).toBe(true);

    await checkReward(user.id);
  });
});
