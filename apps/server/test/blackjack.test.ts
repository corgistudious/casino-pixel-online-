import { randomUUID } from 'node:crypto';
import type { BlackjackState, BlackjackView, Card, RoundEnvelope } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { register, randomIp, startTestApp, TEST_DB, TestSocket, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.app.close();
});

type Env = RoundEnvelope<BlackjackView>;

async function balances(userId: string) {
  const [row] = await t.db.execute<{ ledger: string; balance: string; payouts: number }>(sql`
    SELECT (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = ${userId} AND currency = 'silver') AS ledger,
           (SELECT balance FROM wallets WHERE user_id = ${userId}) AS balance,
           (SELECT count(*)::int FROM ledger_entries WHERE user_id = ${userId} AND reason = 'payout') AS payouts
  `);
  expect(Number(row!.ledger)).toBe(Number(row!.balance));
  return { balance: Number(row!.balance), payouts: row!.payouts };
}

/**
 * Starts a real round (the opening bet goes through the ledger as usual), then swaps in known
 * cards so the outcome is deterministic. `shoe` lists the next cards to be drawn, in order.
 */
async function rigged(s: TestSocket, bet: number, player: Card[], dealer: Card[], shoe: Card[], phase: 'player' | 'insurance' = 'player'): Promise<Env> {
  let env: Env;
  do env = await s.ok<Env>({ type: 'blackjack.start', bet });
  while (env.result.phase === 'finished');
  const state: BlackjackState = {
    shoe: shoe.slice().reverse(),
    dealer,
    hands: [{ cards: player, bet, doubled: false, done: false, split: false, splitAces: false, outcome: null, payout: 0 }],
    active: 0,
    bet,
    phase,
    outcome: null,
    payout: 0,
    insurance: 0,
    insurancePayout: 0,
  };
  await t.db.execute(sql`UPDATE game_rounds SET state = ${JSON.stringify(state)}::jsonb WHERE id = ${env.roundId}`);
  return env;
}

const act = (s: TestSocket, roundId: string, action: string, id?: string) => s.ok<Env>({ type: 'blackjack.action', roundId, action }, id);

describe('blackjack on the server', () => {
  it('split: the second stake is debited, both hands settle, the payout is credited once', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    const env = await rigged(s, 100, ['8S', '8D'], ['10H', '7C'], ['3C', '10D', '9S']);
    const start = await balances(user.id);
    let r = await act(s, env.roundId, 'split');
    expect(r.result.hands).toHaveLength(2);
    expect(r.result.bet).toBe(200);
    expect(r.balance).toBe(start.balance - 100);
    expect(r.result.dealer[1]).toBeNull();
    r = await act(s, env.roundId, 'hit');
    r = await act(s, env.roundId, 'stand');
    r = await act(s, env.roundId, 'stand');
    expect(r.result.phase).toBe('finished');
    expect(r.result.hands.map((h) => h.outcome)).toEqual(['win', 'win']);
    expect(r.result.payout).toBe(400);
    const end = await balances(user.id);
    expect(end.balance).toBe(start.balance - 100 + 400);
    expect(end.payouts).toBe(start.payouts + 1);
    const [round] = await t.db.execute<{ bet: string; payout: string; status: string; state: unknown }>(sql`SELECT bet, payout, status, state FROM game_rounds WHERE id = ${env.roundId}`);
    expect(round).toMatchObject({ bet: '200', payout: '400', status: 'settled', state: null });
    // Nothing more can happen to a settled round.
    const late = await s.request({ type: 'blackjack.action', roundId: env.roundId, action: 'hit' });
    expect(late.ok ? null : late.error.code).toBe('round_finished');
    s.close();
  });

  it('double down debits once, draws one card and pays 2× the doubled stake', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    const env = await rigged(s, 100, ['5S', '6D'], ['10H', '7C'], ['KD']);
    const start = await balances(user.id);
    const r = await act(s, env.roundId, 'double');
    expect(r.result.hands[0]!.cards).toHaveLength(3);
    expect(r.result.outcome).toBe('win');
    expect(r.result.payout).toBe(400);
    expect((await balances(user.id)).balance).toBe(start.balance - 100 + 400);
    s.close();
  });

  it('dealer bust, push and bust settle correctly', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    const cases: [Card[], Card[], Card[], string, string, number][] = [
      [['10S', '8D'], ['9H', '6C'], ['KD'], 'stand', 'win', 200], // dealer 15 + K = bust
      [['10S', '8D'], ['9H', '9C'], [], 'stand', 'push', 100],
      [['10S', '6D'], ['9H', '7C'], ['QC'], 'hit', 'bust', 0],
    ];
    for (const [player, dealer, shoe, action, outcome, payout] of cases) {
      const env = await rigged(s, 100, player, dealer, shoe);
      const before = await balances(user.id);
      const r = await act(s, env.roundId, action);
      expect(r.result.outcome).toBe(outcome);
      expect(r.result.payout).toBe(payout);
      expect((await balances(user.id)).balance).toBe(before.balance + payout);
    }
    s.close();
  });

  it('natural blackjack pays 3:2 at once (no actions accepted)', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    for (let i = 0; i < 400; i++) {
      const before = await balances(user.id);
      const env = await s.ok<Env>({ type: 'blackjack.start', bet: 10 });
      if (env.result.outcome === 'blackjack') {
        expect(env.result.phase).toBe('finished');
        expect(env.result.payout).toBe(25);
        expect(env.balance).toBe(before.balance - 10 + 25);
        s.close();
        return;
      }
      let r = env;
      if (r.result.phase === 'insurance') r = await s.ok<Env>({ type: 'blackjack.action', roundId: r.roundId, action: 'insurance', amount: 0 });
      while (r.result.phase === 'player') r = await act(s, r.roundId, 'stand');
    }
    throw new Error('no natural in 400 hands');
  });

  it('split or double without the funds is refused and changes nothing', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    const env = await rigged(s, 100, ['8S', '8D'], ['10H', '7C'], ['3C', '10D', '9S']);
    // Park the rest of the wallet in the bank so the second stake cannot be paid.
    const { balance } = await balances(user.id);
    const bank = await t.app.inject({
      method: 'POST',
      url: '/api/bank/transfer',
      headers: { authorization: `Bearer ${token}` },
      payload: { idempotencyKey: randomUUID(), currency: 'silver', direction: 'deposit', amount: balance },
      remoteAddress: randomIp(),
    });
    expect(bank.statusCode).toBe(200);
    for (const action of ['split', 'double']) {
      const res = await s.request({ type: 'blackjack.action', roundId: env.roundId, action });
      expect(res.ok ? null : res.error.code).toBe('insufficient_funds');
    }
    const resumed = await s.ok<Env | null>({ type: 'blackjack.resume' });
    expect(resumed!.result.hands).toHaveLength(1);
    expect(resumed!.result.hands[0]!.cards).toEqual(['8S', '8D']);
    expect((await balances(user.id)).balance).toBe(0);
    // Standing needs no money and still settles.
    const r = await act(s, env.roundId, 'stand');
    expect(r.result.phase).toBe('finished');
    s.close();
  });

  it('a retried or concurrent action request is applied once', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    const env = await rigged(s, 100, ['8S', '8D'], ['10H', '7C'], ['3C', '10D', '9S']);
    const start = await balances(user.id);
    // A network retry re-sends the same request id: the server replays instead of splitting again.
    const id = randomUUID();
    const first = await act(s, env.roundId, 'split', id);
    const retry = await act(s, env.roundId, 'split', id);
    expect(retry.result).toEqual(first.result);
    expect((await balances(user.id)).balance).toBe(start.balance - 100);
    // Two different requests racing on the same hand are serialised: only one double goes through.
    const [x, y] = await Promise.all([
      s.request({ type: 'blackjack.action', roundId: env.roundId, action: 'double' }),
      s.request({ type: 'blackjack.action', roundId: env.roundId, action: 'double' }),
    ]);
    const okCount = [x.ok, y.ok].filter(Boolean).length;
    const [bets] = await t.db.execute<{ n: number; sum: string }>(sql`SELECT count(*)::int AS n, sum(delta) AS sum FROM ledger_entries WHERE round_id = ${env.roundId} AND reason = 'bet'`);
    expect(bets!.n).toBe(2 + okCount); // opening bet + split + one per accepted double
    let r = (await s.ok<Env | null>({ type: 'blackjack.resume' })) ?? null;
    while (r && r.result.phase === 'player') r = await act(s, env.roundId, 'stand');
    const end = await balances(user.id);
    expect(end.payouts).toBeLessThanOrEqual(start.payouts + 1);
    const [round] = await t.db.execute<{ bet: string }>(sql`SELECT bet FROM game_rounds WHERE id = ${env.roundId}`);
    expect(Number(round!.bet)).toBe(-Number(bets!.sum));
    s.close();
  });

  it('a disconnect or a server restart resumes the same hand from the database', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    const env = await rigged(s, 100, ['8S', '8D'], ['10H', '7C'], ['3C', '10D', '9S']);
    await act(s, env.roundId, 'split');
    s.close();
    const second = await buildApp(loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, JWT_SECRET: 'test-secret-test-secret-test-secret-123', REDIS_URL: '', TABLE_SCHEDULER: 'off' }), { logger: false });
    try {
      await second.app.listen({ port: 0, host: '127.0.0.1' });
      const address = second.app.server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const s2 = await TestSocket.connect(port, token);
      const resumed = await s2.ok<Env | null>({ type: 'blackjack.resume' });
      expect(resumed!.roundId).toBe(env.roundId);
      expect(resumed!.result.hands.map((h) => h.cards)).toEqual([['8S', '3C'], ['8D', '10D']]);
      let r = await act(s2, env.roundId, 'hit');
      r = await act(s2, env.roundId, 'stand');
      r = await act(s2, env.roundId, 'stand');
      expect(r.result.payout).toBe(400);
      s2.close();
    } finally {
      await second.app.close();
    }
    await balances(user.id);
  });

  it('a round left from the single-hand version still plays and pays', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    let env: Env;
    do env = await s.ok<Env>({ type: 'blackjack.start', bet: 100 });
    while (env.result.phase === 'finished');
    const legacy = { shoe: ['KD'], player: ['10S', '8D'], dealer: ['9H', '6C'], bet: 100, doubled: false, phase: 'player', outcome: null, payout: 0 };
    await t.db.execute(sql`UPDATE game_rounds SET state = ${JSON.stringify(legacy)}::jsonb WHERE id = ${env.roundId}`);
    const before = await balances(user.id);
    const resumed = await s.ok<Env | null>({ type: 'blackjack.resume' });
    expect(resumed!.result.playerTotal).toBe(18);
    const r = await act(s, env.roundId, 'stand');
    expect(r.result.outcome).toBe('win');
    expect((await balances(user.id)).balance).toBe(before.balance + 200);
    s.close();
  });

  it('insurance: staked once, pays 2:1 against a dealer blackjack, settled once', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    const env = await rigged(s, 100, ['10S', '7D'], ['AS', 'KC'], [], 'insurance');
    const start = await balances(user.id);
    const resumed = await s.ok<Env | null>({ type: 'blackjack.resume' });
    expect(resumed!.result.insuranceMax).toBe(50);
    expect(resumed!.result.dealer).toEqual(['AS', null]);
    const insure = (amount: number, id?: string) => s.request({ type: 'blackjack.action', roundId: env.roundId, action: 'insurance', amount }, id);
    // Above half the bet, or any other action before deciding, is refused and changes nothing.
    expect(((await insure(51)) as { error?: { code: string } }).error?.code).toBe('invalid_bet');
    const early = await s.request({ type: 'blackjack.action', roundId: env.roundId, action: 'hit' });
    expect(early.ok ? null : early.error.code).toBe('invalid_bet');
    expect((await balances(user.id)).balance).toBe(start.balance);
    // The same request sent twice (network retry) is applied once.
    const id = randomUUID();
    const first = await insure(50, id);
    const retry = await insure(50, id);
    expect(first.ok && retry.ok).toBe(true);
    const result = (first as { data: Env }).data.result;
    expect(result.phase).toBe('finished');
    expect(result.outcome).toBe('dealer_blackjack');
    expect(result.insurancePayout).toBe(150);
    const end = await balances(user.id);
    expect(end.balance).toBe(start.balance - 50 + 150);
    expect(end.payouts).toBe(start.payouts + 1);
    const [round] = await t.db.execute<{ bet: string; payout: string }>(sql`SELECT bet, payout FROM game_rounds WHERE id = ${env.roundId}`);
    expect(round).toEqual({ bet: '150', payout: '150' });
    s.close();
  });

  it('insurance is lost when the dealer has no blackjack; declining costs nothing', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    const env = await rigged(s, 100, ['10S', '9D'], ['AS', '6C'], ['5H'], 'insurance');
    const start = await balances(user.id);
    const r = await s.ok<Env>({ type: 'blackjack.action', roundId: env.roundId, action: 'insurance', amount: 30 });
    expect(r.result.phase).toBe('player');
    expect(r.result.dealer[1]).toBeNull();
    expect((await balances(user.id)).balance).toBe(start.balance - 30);
    const done = await s.ok<Env>({ type: 'blackjack.action', roundId: env.roundId, action: 'stand' }); // 19 vs soft 17
    expect(done.result.outcome).toBe('win');
    expect((await balances(user.id)).balance).toBe(start.balance - 30 + 200);

    const env2 = await rigged(s, 100, ['10S', '9D'], ['AS', '6C'], ['5H'], 'insurance');
    const mid = await balances(user.id);
    const declined = await s.ok<Env>({ type: 'blackjack.action', roundId: env2.roundId, action: 'insurance', amount: 0 });
    expect(declined.result.insurance).toBe(0);
    expect((await balances(user.id)).balance).toBe(mid.balance);
    s.close();
  });

  it('insurance cannot be staked without the funds', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    const env = await rigged(s, 100, ['10S', '7D'], ['AS', 'KC'], [], 'insurance');
    const { balance } = await balances(user.id);
    await t.app.inject({ method: 'POST', url: '/api/bank/transfer', headers: { authorization: `Bearer ${token}` }, payload: { idempotencyKey: randomUUID(), currency: 'silver', direction: 'deposit', amount: balance }, remoteAddress: randomIp() });
    const res = await s.request({ type: 'blackjack.action', roundId: env.roundId, action: 'insurance', amount: 50 });
    expect(res.ok ? null : res.error.code).toBe('insufficient_funds');
    expect((await s.ok<Env | null>({ type: 'blackjack.resume' }))!.result.phase).toBe('insurance');
    s.close();
  });
});
