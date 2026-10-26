import { randomUUID } from 'node:crypto';
import { ECONOMY, spinSlots, type BlackjackView, type RoundEnvelope, type SlotsResult } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fairRng, sha256 } from '../src/services/fair';
import { playSlots } from '../src/services/games';
import { register, startTestApp, TestSocket, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.app.close();
});

async function ledgerMatchesWallet(userId: string) {
  const [row] = await t.db.execute<{ ledger: string; balance: string }>(sql`
    SELECT (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = ${userId} AND currency = 'silver') AS ledger,
           (SELECT balance FROM wallets WHERE user_id = ${userId}) AS balance
  `);
  expect(Number(row!.ledger)).toBe(Number(row!.balance));
  return Number(row!.balance);
}

describe('websocket games', () => {
  it('rejects game messages before auth', async () => {
    const s = await TestSocket.connect(t.port);
    const res = await s.request({ type: 'slots.spin', bet: 100 });
    expect(res.ok).toBe(false);
    s.close();
  });

  it('rejects invalid tokens', async () => {
    const s = await TestSocket.connect(t.port);
    const closed = s.waitClose();
    const res = await s.request({ type: 'auth', token: 'nope' });
    expect(res.ok).toBe(false);
    expect(await closed).toBe(4001);
  });

  it('spins slots and settles the wallet', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    let expected = ECONOMY.welcome.silver;
    for (let i = 0; i < 20; i++) {
      const data = await s.ok<RoundEnvelope<SlotsResult>>({ type: 'slots.spin', bet: 100 });
      expected += data.result.payout - 100;
      expect(data.balance).toBe(expected);
      expect(data.result.grid).toHaveLength(5);
    }
    expect(await ledgerMatchesWallet(user.id)).toBe(expected);
    s.close();
  });

  it('replays a retried request instead of charging twice', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    const id = randomUUID();
    const a = await s.ok<RoundEnvelope<SlotsResult>>({ type: 'slots.spin', bet: 500 }, id);
    const b = await s.ok<RoundEnvelope<SlotsResult>>({ type: 'slots.spin', bet: 500 }, id);
    expect(b.roundId).toBe(a.roundId);
    expect(b.result).toEqual(a.result);
    expect(await ledgerMatchesWallet(user.id)).toBe(a.balance);
    s.close();
  });

  it('enforces bet limits and funds', async () => {
    const { token } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    expect((await s.request({ type: 'slots.spin', bet: 1 })).ok).toBe(false);
    const res = await s.request({ type: 'blackjack.start', bet: ECONOMY.maxBet });
    expect(res.ok ? null : res.error.code).toBe('insufficient_funds');
    s.close();
  });

  it('plays roulette with multiple bets', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    const data = await s.ok({
      type: 'roulette.spin',
      bets: [
        { kind: 'red', amount: 100 },
        { kind: 'straight', value: 7, amount: 10 },
        { kind: 'dozen', value: 2, amount: 50 },
      ],
    });
    expect(data.result.number).toBeGreaterThanOrEqual(0);
    expect(data.balance).toBe(ECONOMY.welcome.silver - 160 + data.result.payout);
    await ledgerMatchesWallet(user.id);
    const bad = await s.request({ type: 'roulette.spin', bets: [{ kind: 'dozen', value: 7, amount: 100 }] });
    expect(bad.ok).toBe(false);
    s.close();
  });

  it('plays sic bo', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    const data = await s.ok({
      type: 'sicbo.roll',
      bets: [
        { kind: 'big', amount: 100 },
        { kind: 'total', value: 10, amount: 20 },
      ],
    });
    expect(data.result.dice).toHaveLength(3);
    expect(data.balance).toBe(ECONOMY.welcome.silver - 120 + data.result.payout);
    await ledgerMatchesWallet(user.id);
    s.close();
  });

  it('plays blackjack to completion and hides the hole card', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    for (let hand = 0; hand < 10; hand++) {
      let env = await s.ok<RoundEnvelope<BlackjackView>>({ type: 'blackjack.start', bet: 100 });
      if (env.result.phase !== 'finished') {
        expect(env.result.dealer[1]).toBeNull();
        const again = await s.request({ type: 'blackjack.start', bet: 100 });
        expect(again.ok ? null : again.error.code).toBe('round_active');
        const resumed = await s.ok<RoundEnvelope<BlackjackView> | null>({ type: 'blackjack.resume' });
        expect(resumed?.roundId).toBe(env.roundId);
      }
      if (env.result.phase === 'insurance') env = await s.ok({ type: 'blackjack.action', roundId: env.roundId, action: 'insurance', amount: 0 });
      while (env.result.phase === 'player') {
        const action = env.result.playerTotal < 17 ? 'hit' : 'stand';
        env = await s.ok({ type: 'blackjack.action', roundId: env.roundId, action });
      }
      expect(env.result.outcome).not.toBeNull();
      expect(env.result.dealer.every((c) => c !== null)).toBe(true);
      const late = await s.request({ type: 'blackjack.action', roundId: env.roundId, action: 'hit' });
      expect(late.ok ? null : late.error.code).toBe('round_finished');
    }
    await ledgerMatchesWallet(user.id);
    s.close();
  });

  it('broadcasts presence', async () => {
    const a = await register(t);
    const s = await TestSocket.connect(t.port, a.token);
    expect(s.events.some((e) => e.type === 'event' && e.event === 'presence')).toBe(true);
    s.close();
  });
});

describe('integrity', () => {
  it('never overdraws under concurrent bets', async () => {
    const { user } = await register(t);
    // 30 concurrent max-size spins against a 10,000 balance: most must fail cleanly.
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () => playSlots(t.db, user.id, randomUUID(), 5_000)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBeGreaterThanOrEqual(2);
    const balance = await ledgerMatchesWallet(user.id);
    expect(balance).toBeGreaterThanOrEqual(0);
    for (const r of results) {
      if (r.status === 'rejected') expect((r.reason as { code?: string }).code).toBe('insufficient_funds');
    }
  });

  it('results are reproducible from the revealed seed (provably fair)', async () => {
    const { token } = await register(t);
    const headers = { authorization: `Bearer ${token}` };
    const before = (await t.app.inject({ url: '/api/me/fairness', headers })).json();
    const s = await TestSocket.connect(t.port, token);
    const rounds: RoundEnvelope<SlotsResult>[] = [];
    for (let i = 0; i < 3; i++) rounds.push(await s.ok({ type: 'slots.spin', bet: 100 }));
    s.close();

    const rotated = (
      await t.app.inject({ method: 'POST', url: '/api/me/fairness/rotate', headers, payload: { clientSeed: 'my-seed' } })
    ).json();
    expect(rotated.revealed.serverSeedHash).toBe(before.serverSeedHash);
    expect(sha256(rotated.revealed.serverSeed)).toBe(before.serverSeedHash);
    expect(rotated.revealed.finalNonce).toBe(3);
    expect(rotated.next.clientSeed).toBe('my-seed');

    for (const r of rounds) {
      const replay = spinSlots(fairRng(rotated.revealed.serverSeed, rotated.revealed.clientSeed, r.nonce), 100);
      expect(replay.grid).toEqual(r.result.grid);
      expect(replay.payout).toBe(r.result.payout);
    }
  });

  it('cannot rotate seeds during an active blackjack hand', async () => {
    const { token } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    let env: RoundEnvelope<BlackjackView>;
    // Retry until we get a hand that is not settled immediately by a natural.
    do env = await s.ok({ type: 'blackjack.start', bet: 10 });
    while (env.result.phase === 'finished');
    s.close();
    const res = await t.app.inject({ method: 'POST', url: '/api/me/fairness/rotate', headers: { authorization: `Bearer ${token}` } });
    expect(res.json().error.code).toBe('round_active');
  });
});
