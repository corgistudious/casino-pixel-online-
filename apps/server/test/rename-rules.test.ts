import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  startTestApp,
  TEST_PASSWORD,
  type TestApp,
} from './helpers';

describe('rename rules', () => {
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

  it('allows first free rename and enforces 60-day cooldown', async () => {
    const registration = await t.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'Original Player',
        password: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
        acceptTerms: true,
      },
    });

    expect(registration.statusCode).toBe(200);
    const { token } = registration.json();
    const headers = { authorization: `Bearer ${token}` };

    const before = await t.app.inject({
      method: 'GET',
      url: '/api/me/rename',
      headers,
    });

    expect(before.statusCode).toBe(200);
    expect(before.json().renameFreeAvailable).toBe(true);

    const first = await t.app.inject({
      method: 'POST',
      url: '/api/me/rename',
      headers,
      payload: {
        displayName: 'Renamed Player',
        useCard: false,
      },
    });

    expect(first.statusCode).toBe(200);
    expect(first.json().user.displayName).toBe('Renamed Player');

    const info = await t.app.inject({
      method: 'GET',
      url: '/api/me/rename',
      headers,
    });

    expect(info.statusCode).toBe(200);
    expect(info.json().renameFreeAvailable).toBe(false);
    expect(info.json().renameCards).toBe(0);

    const availableAt = new Date(info.json().renameAvailableAt);
    const daysUntil = (availableAt.getTime() - Date.now()) / 86400000;

    expect(daysUntil).toBeGreaterThan(59);
    expect(daysUntil).toBeLessThanOrEqual(60);

    const second = await t.app.inject({
      method: 'POST',
      url: '/api/me/rename',
      headers,
      payload: {
        displayName: 'Another Player',
        useCard: false,
      },
    });

    expect(second.json().error.code).toBe('too_soon');

    const after = await t.app.inject({
      method: 'GET',
      url: '/api/me/rename',
      headers,
    });

    expect(after.json().renameCards).toBe(0);
    expect(after.json().renameAvailableAt).toBe(info.json().renameAvailableAt);
  });
});
