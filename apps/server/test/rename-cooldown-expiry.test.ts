import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  startTestApp,
  TEST_PASSWORD,
  type TestApp,
} from './helpers';

describe('rename cooldown expiry', () => {
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

  it('allows another free rename after 60 days', async () => {
    const registration = await t.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'Cooldown Tester',
        password: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
        acceptTerms: true,
      },
    });

    expect(registration.statusCode).toBe(200);

    const { token, user } = registration.json();
    const headers = {
      authorization: `Bearer ${token}`,
    };

    const first = await t.app.inject({
      method: 'POST',
      url: '/api/me/rename',
      headers,
      payload: {
        displayName: 'First Name',
        useCard: false,
      },
    });

    expect(first.statusCode).toBe(200);

    // Simulate 59 days elapsed in the isolated test DB.
    await t.db.execute(sql`
      UPDATE keyo_rename_state
      SET last_renamed_at = now() - interval '59 days'
      WHERE user_id = ${user.id}::uuid
    `);

    const tooEarly = await t.app.inject({
      method: 'POST',
      url: '/api/me/rename',
      headers,
      payload: {
        displayName: 'Too Early Name',
        useCard: false,
      },
    });

    expect(tooEarly.json().error.code).toBe('too_soon');

    // Simulate 61 days elapsed in the isolated test DB.
    await t.db.execute(sql`
      UPDATE keyo_rename_state
      SET last_renamed_at = now() - interval '61 days'
      WHERE user_id = ${user.id}::uuid
    `);

    const second = await t.app.inject({
      method: 'POST',
      url: '/api/me/rename',
      headers,
      payload: {
        displayName: 'After Cooldown',
        useCard: false,
      },
    });

    expect(second.statusCode).toBe(200);
    expect(second.json().user.displayName)
      .toBe('After Cooldown');

    const info = await t.app.inject({
      method: 'GET',
      url: '/api/me/rename',
      headers,
    });

    expect(info.statusCode).toBe(200);
    expect(info.json().renameCards).toBe(0);
    expect(info.json().renameFreeAvailable).toBe(false);

    const availableAt = new Date(info.json().renameAvailableAt);
    const daysUntil =
      (availableAt.getTime() - Date.now()) / 86400000;

    expect(daysUntil).toBeGreaterThan(59);
    expect(daysUntil).toBeLessThanOrEqual(60);
  });
});
