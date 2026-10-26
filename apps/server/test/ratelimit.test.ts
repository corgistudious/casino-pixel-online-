import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { register, startTestApp, TestSocket, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp({ WS_RATE_PER_SEC: '2', WS_BURST: '5' });
});
afterAll(async () => {
  await t.app.close();
});

describe('websocket rate limit', () => {
  it('rejects bursts above the bucket size', async () => {
    const { token } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    const results = await Promise.all(Array.from({ length: 12 }, () => s.request({ type: 'ping' })));
    const limited = results.filter((r) => !r.ok && r.error.code === 'rate_limited');
    expect(limited.length).toBeGreaterThan(0);
    s.close();
  });

  it('rejects malformed messages', async () => {
    const { token } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    await new Promise((r) => setTimeout(r, 1500));
    const res = await s.request({ type: 'slots.spin', bet: 'lots' });
    expect(res.ok ? null : res.error.code).toBe('bad_request');
    s.close();
  });
});

describe('HTTP rate limit', () => {
  it('limits every API route per client IP, separately for each IP', async () => {
    const t2 = await startTestApp({ HTTP_RATE_PER_MIN: '5' });
    try {
      const hit = (ip: string) => t2.app.inject({ url: '/api/leaderboard', remoteAddress: ip });
      const codes = [];
      for (let i = 0; i < 7; i++) codes.push((await hit('10.9.9.9')).statusCode);
      expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
      const limited = await hit('10.9.9.9');
      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe('rate_limited');
      expect((await hit('10.8.8.8')).statusCode).toBe(200);
    } finally {
      await t2.app.close();
    }
  });
});
