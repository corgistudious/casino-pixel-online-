import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  startTestApp,
  TEST_PASSWORD,
  type TestApp,
} from './helpers';
import { applyDelta } from '../src/services/wallet';

describe('rename card economy', () => {
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

  it('purchases and consumes a rename card safely', async () => {
    const registration = await t.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'Card Tester',
        password: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
        acceptTerms: true,
      },
    });

    expect(registration.statusCode).toBe(200);

    const { token, user } = registration.json();
    const headers = { authorization: `Bearer ${token}` };

    const purchaseWithoutGold = await t.app.inject({
      method: 'POST',
      url: '/api/shop/rename-card',
      headers,
    });

    expect(purchaseWithoutGold.json().error.code)
      .toBe('insufficient_funds');

    let info = await t.app.inject({
      method: 'GET',
      url: '/api/me/rename',
      headers,
    });

    expect(info.json().renameCards).toBe(0);

    // Test-only funding through the real ledger service.
    await t.db.transaction(async tx => {
      await applyDelta(
        tx, user.id, 500, 'admin_adjust',
        null, 'gold', 'rename-card-test'
      );
    });

    const purchase = await t.app.inject({
      method: 'POST',
      url: '/api/shop/rename-card',
      headers,
    });

    expect(purchase.statusCode).toBe(200);

    info = await t.app.inject({
      method: 'GET',
      url: '/api/me/rename',
      headers,
    });

    expect(info.json().renameCards).toBe(1);

    const wallet = await t.db.execute<{ gold: string }>(sql`
      SELECT gold FROM wallets
      WHERE user_id = ${user.id}::uuid
    `);

    expect(Number(wallet[0]!.gold)).toBe(200);

    const first = await t.app.inject({
      method: 'POST',
      url: '/api/me/rename',
      headers,
      payload: {
        displayName: 'First Rename',
        useCard: false,
      },
    });

    expect(first.statusCode).toBe(200);

    const second = await t.app.inject({
      method: 'POST',
      url: '/api/me/rename',
      headers,
      payload: {
        displayName: 'Card Rename',
        useCard: true,
      },
    });

    expect(second.statusCode).toBe(200);
    expect(second.json().user.displayName).toBe('Card Rename');

    info = await t.app.inject({
      method: 'GET',
      url: '/api/me/rename',
      headers,
    });

    expect(info.json().renameCards).toBe(0);

    const blocked = await t.app.inject({
      method: 'POST',
      url: '/api/me/rename',
      headers,
      payload: {
        displayName: 'Keyo Support',
        useCard: true,
      },
    });

    expect(blocked.json().error.code).toBe('username_taken');

    const ledger = await t.db.execute<{
      delta: string;
      currency: string;
      reason: string;
    }>(sql`
      SELECT delta, currency, reason
      FROM ledger_entries
      WHERE user_id = ${user.id}::uuid
        AND currency = 'gold'
      ORDER BY id
    `);

    expect(ledger.map(row => Number(row.delta)))
      .toEqual([500, -300]);

    expect(ledger.map(row => row.reason))
      .toEqual(['admin_adjust', 'shop']);
  });
});
