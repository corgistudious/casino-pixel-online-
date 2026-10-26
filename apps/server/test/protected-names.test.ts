import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  startTestApp,
  TEST_PASSWORD,
  type TestApp,
} from './helpers';

describe('protected player display names', () => {
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

  it('rejects official names during registration', async () => {
    for (const displayName of [
      'Keyo Support',
      'KEYO_ADMIN',
      'Administrator',
      'Keyo Official',
    ]) {
      const res = await t.app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          displayName,
          password: TEST_PASSWORD,
          confirmPassword: TEST_PASSWORD,
          acceptTerms: true,
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('username_taken');
    }
  });

  it('rejects official names during rename without using free rename', async () => {
    const registered = await t.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'Normal Player',
        password: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
        acceptTerms: true,
      },
    });

    expect(registered.statusCode).toBe(200);
    const { token } = registered.json();

    const rename = await t.app.inject({
      method: 'POST',
      url: '/api/me/rename',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        displayName: 'Keyo Support',
        useCard: false,
      },
    });

    expect(rename.statusCode).toBe(409);
    expect(rename.json().error.code).toBe('username_taken');

    const info = await t.app.inject({
      method: 'GET',
      url: '/api/me/rename',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(info.statusCode).toBe(200);
    expect(info.json().renameFreeAvailable).toBe(true);
    expect(info.json().renameCards).toBe(0);
  });
});
