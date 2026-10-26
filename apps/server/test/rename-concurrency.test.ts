import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  startTestApp,
  TEST_PASSWORD,
  type TestApp,
} from './helpers';
import { applyDelta } from '../src/services/wallet';

describe('rename concurrency safety', () => {
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

  it('prevents duplicate free renames and card consumption', async () => {
    const registration = await t.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'Concurrency Tester',
        password: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
        acceptTerms: true,
      },
    });

    expect(registration.statusCode).toBe(200);

    const { token, user } = registration.json();
    const headers = { authorization: `Bearer ${token}` };

    // Ten simultaneous requests for the first free rename.
    const freeResults = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        t.app.inject({
          method: 'POST',
          url: '/api/me/rename',
          headers,
          payload: {
            displayName: `Free Name ${i}`,
            useCard: false,
          },
        })
      )
    );

    expect(freeResults.filter(r => r.statusCode === 200))
      .toHaveLength(1);

    expect(freeResults.filter(r =>
      r.json().error?.code === 'too_soon'
    )).toHaveLength(9);

    // Fund the test account through the actual ledger.
    await t.db.transaction(async tx => {
      await applyDelta(
        tx, user.id, 300, 'admin_adjust',
        null, 'gold', 'rename-concurrency-test'
      );
    });

    // Ten concurrent purchases with enough gold for only one.
    const purchases = await Promise.all(
      Array.from({ length: 10 }, () =>
        t.app.inject({
          method: 'POST',
          url: '/api/shop/rename-card',
          headers,
        })
      )
    );

    expect(purchases.filter(r => r.statusCode === 200))
      .toHaveLength(1);

    expect(purchases.filter(r =>
      r.json().error?.code === 'insufficient_funds'
    )).toHaveLength(9);

    const before = await t.app.inject({
      method: 'GET',
      url: '/api/me/rename',
      headers,
    });

    expect(before.json().renameCards).toBe(1);

    // Ten concurrent attempts to consume the same rename card.
    const cardResults = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        t.app.inject({
          method: 'POST',
          url: '/api/me/rename',
          headers,
          payload: {
            displayName: `Card Name ${i}`,
            useCard: true,
          },
        })
      )
    );

    expect(cardResults.filter(r => r.statusCode === 200))
      .toHaveLength(1);

    expect(cardResults.filter(r =>
      r.json().error?.code === 'not_owned'
    )).toHaveLength(9);

    const after = await t.app.inject({
      method: 'GET',
      url: '/api/me/rename',
      headers,
    });

    expect(after.json().renameCards).toBe(0);

    const wallet = await t.db.execute<{ gold: string }>(sql`
      SELECT gold FROM wallets
      WHERE user_id = ${user.id}::uuid
    `);

    expect(Number(wallet[0]!.gold)).toBe(0);

    const ledger = await t.db.execute<{
      delta: string;
    }>(sql`
      SELECT delta
      FROM ledger_entries
      WHERE user_id = ${user.id}::uuid
        AND currency = 'gold'
      ORDER BY id
    `);

    expect(ledger.map(r => Number(r.delta)))
      .toEqual([300, -300]);

    const state = await t.db.execute<{
      quantity: number;
    }>(sql`
      SELECT quantity
      FROM keyo_rename_cards
      WHERE user_id = ${user.id}::uuid
    `);

    expect(state[0]!.quantity).toBe(0);
  });
});
