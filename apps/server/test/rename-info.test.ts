import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  startTestApp,
  TEST_PASSWORD,
  type TestApp,
} from './helpers';

describe('rename availability API', () => {
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

  it('reports free rename availability correctly', async () => {
    const registration = await t.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'Rename Info Tester',
        password: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
        acceptTerms: true,
      },
    });

    expect(registration.statusCode).toBe(200);

    const { token, user } = registration.json();
    const headers = { authorization: `Bearer ${token}` };

    const getInfo = () => t.app.inject({
      method: 'GET',
      url: '/api/me/rename',
      headers,
    });

    // First free rename is available immediately.
    let info = await getInfo();
    expect(info.statusCode).toBe(200);
    expect(info.json().renameFreeAvailable).toBe(true);
    expect(info.json().renameAvailableAt).toBeNull();

    // Consume first free rename.
    const rename = await t.app.inject({
      method: 'POST',
      url: '/api/me/rename',
      headers,
      payload: {
        displayName: 'First Rename',
        useCard: false,
      },
    });

    expect(rename.statusCode).toBe(200);

    // The player must wait for the next free rename.
    info = await getInfo();
    expect(info.json().renameFreeAvailable).toBe(false);
    expect(info.json().renameAvailableAt).not.toBeNull();

    // Simulate 59 days elapsed.
    await t.db.execute(sql`
      UPDATE keyo_rename_state
      SET last_renamed_at = now() - interval '59 days'
      WHERE user_id = ${user.id}::uuid
    `);

    info = await getInfo();
    expect(info.json().renameFreeAvailable).toBe(false);

    // Simulate 61 days elapsed.
    await t.db.execute(sql`
      UPDATE keyo_rename_state
      SET last_renamed_at = now() - interval '61 days'
      WHERE user_id = ${user.id}::uuid
    `);

    info = await getInfo();
    expect(info.json().renameFreeAvailable).toBe(true);
    expect(info.json().renameAvailableAt).toBeNull();

    // Free rename after cooldown must succeed.
    const second = await t.app.inject({
      method: 'POST',
      url: '/api/me/rename',
      headers,
      payload: {
        displayName: 'Second Free Rename',
        useCard: false,
      },
    });

    expect(second.statusCode).toBe(200);

    info = await getInfo();
    expect(info.json().renameFreeAvailable).toBe(false);
    expect(info.json().renameCards).toBe(0);
    expect(info.json().renameAvailableAt).not.toBeNull();
  });
});
