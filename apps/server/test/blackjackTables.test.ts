import { randomUUID } from 'node:crypto';
import type { BjtTableView, Card } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { randomIp, register, startTestApp, TEST_DB, TestSocket, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.app.close();
});

type Player = Awaited<ReturnType<typeof register>> & { ws: TestSocket };
async function player(): Promise<Player> {
  const r = await register(t);
  return { ...r, ws: await TestSocket.connect(t.port, r.token) };
}
const TABLE = 'bj-1';

async function balances(userId: string) {
  const [r] = await t.db.execute<{ balance: string; ledger: string }>(sql`
    SELECT balance, (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = ${userId} AND currency = 'silver') AS ledger FROM wallets WHERE user_id = ${userId}`);
  expect(r!.balance).toBe(r!.ledger);
  return Number(r!.balance);
}
const round = async () => (await t.db.execute<{ id: string; status: string; state: { phase: string; shoe: Card[]; players: { seat: number }[] } }>(sql`SELECT id, status, state FROM bj_rounds WHERE table_id = ${TABLE} ORDER BY seq DESC LIMIT 1`))[0]!;

/** Clears the table (no active round, no seats, no break) so each test starts fresh. */
async function freeTable() {
  await t.db.execute(sql`UPDATE bj_rounds SET status = 'void', deadline = NULL, ended_at = now() - interval '1 minute' WHERE table_id = ${TABLE} AND status = 'active'`);
  await t.db.execute(sql`UPDATE bj_rounds SET ended_at = now() - interval '1 minute' WHERE table_id = ${TABLE}`);
  await t.db.execute(sql`DELETE FROM bj_seats WHERE table_id = ${TABLE}`);
}

/** Opens a betting round and stacks the shoe: `cards` are drawn in order (players' 1st cards, dealer up, players' 2nd, dealer hole, then hits). */
async function openWith(cards: Card[]) {
  await t.bjt.tick();
  const r = await round();
  expect(r.state.phase).toBe('betting');
  await t.db.execute(sql`UPDATE bj_rounds SET state = jsonb_set(state, '{shoe}', ${JSON.stringify(cards.slice().reverse())}::jsonb) WHERE id = ${r.id}`);
  return r.id;
}
const act = (p: Player, roundId: string, action: string, amount?: number, id?: string) =>
  p.ws.request({ type: 'bjt.act', tableId: TABLE, roundId, action, ...(amount !== undefined ? { amount } : {}) }, id);
const view = (p: Player) => p.ws.ok<BjtTableView>({ type: 'bjt.join', tableId: TABLE });

describe('shared blackjack tables', () => {
  it('two players, one dealer: seat order, live updates, every payout exactly once', async () => {
    await freeTable();
    const [a, b] = [await player(), await player()];
    await view(a);
    await a.ws.ok({ type: 'bjt.sit', tableId: TABLE, seat: 0 });
    await b.ws.ok({ type: 'bjt.sit', tableId: TABLE, seat: 3 });
    // a: 10,6 ; b: 9,9 ; dealer 10 up / 7 hole ; a hits 5 → 21.
    const id = await openWith(['10S', '9H', '10D', '6C', '9S', '7H', '5D']);
    const [ba, bb] = [await balances(a.user.id), await balances(b.user.id)];
    await a.ws.ok({ type: 'bjt.bet', tableId: TABLE, amount: 200 });
    expect((await round()).state.phase).toBe('betting');
    await b.ws.ok({ type: 'bjt.bet', tableId: TABLE, amount: 100 });
    // Everyone seated has bet: dealt at once.
    let v = await view(a);
    expect(v.round!.phase).toBe('playing');
    expect(v.round!.turnSeat).toBe(0);
    expect(v.round!.dealer).toEqual(['10D', null]);
    expect(a.ws.events.some((e) => e.type === 'event' && e.event === 'bjt')).toBe(true);
    const wrong = await act(b, id, 'stand');
    expect(wrong.ok ? null : wrong.error.code).toBe('illegal_action');
    await act(a, id, 'hit');
    v = await view(b);
    expect(v.round!.turnSeat).toBe(3);
    await act(b, id, 'stand');
    v = await view(a);
    expect(v.round!.phase).toBe('done');
    expect(v.round!.serverSeed).not.toBeNull();
    expect(v.round!.players.map((p) => [p.seat, p.payout])).toEqual([
      [0, 400],
      [3, 200],
    ]);
    expect(await balances(a.user.id)).toBe(ba - 200 + 400);
    expect(await balances(b.user.id)).toBe(bb - 100 + 200);
    // Another scheduler pass changes nothing.
    await t.bjt.tick();
    expect(await balances(a.user.id)).toBe(ba + 200);
    const rows = await t.db.execute<{ bet: string; payout: string }>(sql`SELECT bet, payout FROM game_rounds WHERE idempotency_key LIKE ${`bjt:${id}:%`} ORDER BY idempotency_key`);
    expect(rows).toEqual([
      { bet: '200', payout: '400' },
      { bet: '100', payout: '200' },
    ]);
    a.ws.close();
    b.ws.close();
  });

  it('insurance per player: 2:1 against a dealer blackjack; undecided players time out to no insurance', async () => {
    await freeTable();
    const [a, b] = [await player(), await player()];
    await a.ws.ok({ type: 'bjt.sit', tableId: TABLE, seat: 1 });
    await b.ws.ok({ type: 'bjt.sit', tableId: TABLE, seat: 2 });
    // a: 10,7 ; b: 9,9 ; dealer A up / K hole.
    const id = await openWith(['10S', '9C', 'AD', '7S', '9D', 'KH']);
    const [ba, bb] = [await balances(a.user.id), await balances(b.user.id)];
    await a.ws.ok({ type: 'bjt.bet', tableId: TABLE, amount: 100 });
    await b.ws.ok({ type: 'bjt.bet', tableId: TABLE, amount: 100 });
    expect((await view(a)).round!.phase).toBe('insurance');
    const over = await act(a, id, 'insurance', 51);
    expect(over.ok ? null : over.error.code).toBe('illegal_action');
    expect((await act(a, id, 'insurance', 50)).ok).toBe(true);
    expect(await balances(a.user.id)).toBe(ba - 150);
    // b never answers: the deadline passes.
    await t.db.execute(sql`UPDATE bj_rounds SET deadline = now() - interval '1 second' WHERE id = ${id}`);
    await t.bjt.tick();
    const v = await view(a);
    expect(v.round!.phase).toBe('done');
    expect(v.round!.players.map((p) => [p.seat, p.insurance, p.insurancePayout, p.payout])).toEqual([
      [1, 50, 150, 150],
      [2, 0, 0, 0],
    ]);
    expect(await balances(a.user.id)).toBe(ba);
    expect(await balances(b.user.id)).toBe(bb - 100);
    a.ws.close();
    b.ws.close();
  });

  it('turn timeouts stand; a disconnected player is not waited for; reconnecting shows the same round', async () => {
    await freeTable();
    const [a, b] = [await player(), await player()];
    await a.ws.ok({ type: 'bjt.sit', tableId: TABLE, seat: 0 });
    await b.ws.ok({ type: 'bjt.sit', tableId: TABLE, seat: 1 });
    const id = await openWith(['10S', '9H', '10D', '6C', '9S', '7H']);
    await a.ws.ok({ type: 'bjt.bet', tableId: TABLE, amount: 100 });
    await b.ws.ok({ type: 'bjt.bet', tableId: TABLE, amount: 100 });
    // a's turn runs out → stands at 16.
    await t.db.execute(sql`UPDATE bj_rounds SET deadline = now() - interval '1 second' WHERE id = ${id}`);
    await t.bjt.tick();
    expect((await view(b)).round!.turnSeat).toBe(1);
    // b drops the connection: their turn gets a short grace instead of the full timer.
    b.ws.close();
    await new Promise((r) => setTimeout(r, 150));
    await act(a, id, 'stand').catch(() => {});
    const [{ deadline }] = (await t.db.execute<{ deadline: string }>(sql`SELECT deadline FROM bj_rounds WHERE id = ${id}`)) as unknown as [{ deadline: string }];
    expect(new Date(deadline).getTime()).toBeGreaterThan(Date.now() - 1000);
    // b comes back before it expires and sees their cards and turn.
    const b2 = await TestSocket.connect(t.port, b.token);
    const v = await b2.ok<BjtTableView>({ type: 'bjt.join', tableId: TABLE });
    expect(v.mySeat).toBe(1);
    expect(v.round!.id).toBe(id);
    expect(v.round!.players.find((p) => p.seat === 1)!.hands[0]!.cards).toEqual(['9H', '9S']);
    expect((await b2.request({ type: 'bjt.act', tableId: TABLE, roundId: id, action: 'stand' })).ok).toBe(true);
    expect((await round()).status).toBe('done');
    a.ws.close();
    b2.close();
  });

  it('retried requests apply once; bets need the funds and the table limits', async () => {
    await freeTable();
    const [a, b] = [await player(), await player()];
    await a.ws.ok({ type: 'bjt.sit', tableId: TABLE, seat: 0 });
    await b.ws.ok({ type: 'bjt.sit', tableId: TABLE, seat: 4 });
    // Only a will get a bet in: a 8,8 ; dealer 10 up / 7 hole ; the split draws 3 and K.
    const id = await openWith(['8S', '10D', '8C', '7H', '3D', 'KC']);
    const tooSmall = await a.ws.request({ type: 'bjt.bet', tableId: TABLE, amount: 50 });
    expect(tooSmall.ok ? null : tooSmall.error.code).toBe('invalid_bet');
    const start = await balances(a.user.id);
    const key = randomUUID();
    await a.ws.ok({ type: 'bjt.bet', tableId: TABLE, amount: 100 }, key);
    await a.ws.ok({ type: 'bjt.bet', tableId: TABLE, amount: 100 }, key);
    expect(await balances(a.user.id)).toBe(start - 100);
    // b has no money left in the wallet.
    const all = await balances(b.user.id);
    await t.app.inject({ method: 'POST', url: '/api/bank/transfer', headers: { authorization: `Bearer ${b.token}` }, payload: { idempotencyKey: randomUUID(), currency: 'silver', direction: 'deposit', amount: all }, remoteAddress: randomIp() });
    const broke = await b.ws.request({ type: 'bjt.bet', tableId: TABLE, amount: 100 });
    expect(broke.ok ? null : broke.error.code).toBe('insufficient_funds');
    // Betting closes on the timer with only a in the round.
    await t.db.execute(sql`UPDATE bj_rounds SET deadline = now() - interval '1 second' WHERE id = ${id}`);
    await t.bjt.tick();
    expect((await round()).state.players.map((p) => p.seat)).toEqual([0]);
    const splitKey = randomUUID();
    expect((await act(a, id, 'split', undefined, splitKey)).ok).toBe(true);
    expect((await act(a, id, 'split', undefined, splitKey)).ok).toBe(true);
    expect(await balances(a.user.id)).toBe(start - 200);
    a.ws.close();
    b.ws.close();
  });

  it('standing mid-round keeps the bet in play and frees the seat afterwards; a restart resumes the round', async () => {
    await freeTable();
    const [a, b] = [await player(), await player()];
    await a.ws.ok({ type: 'bjt.sit', tableId: TABLE, seat: 0 });
    await b.ws.ok({ type: 'bjt.sit', tableId: TABLE, seat: 1 });
    const id = await openWith(['10S', '9H', '10D', '6C', '9S', '7H', '5D']);
    await a.ws.ok({ type: 'bjt.bet', tableId: TABLE, amount: 100 });
    await b.ws.ok({ type: 'bjt.bet', tableId: TABLE, amount: 100 });
    expect(await a.ws.ok({ type: 'bjt.stand', tableId: TABLE })).toEqual({ leaving: true });
    // A second server instance (e.g. after a restart) picks the round up from the database.
    const second = await buildApp(loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, JWT_SECRET: 'test-secret-test-secret-test-secret-123', REDIS_URL: '', TABLE_SCHEDULER: 'off' }), { logger: false });
    try {
      await second.bjt.tick(new Date(Date.now() + 1000)); // a's turn expired at once (left): stands
      await second.bjt.act(b.user.id, TABLE, id, 'stand', 0, randomUUID());
    } finally {
      await second.app.close();
    }
    expect((await round()).status).toBe('done');
    await t.db.execute(sql`UPDATE bj_rounds SET ended_at = now() - interval '1 minute' WHERE id = ${id}`);
    await t.bjt.tick();
    const seats = await t.db.execute<{ seat: number }>(sql`SELECT seat FROM bj_seats WHERE table_id = ${TABLE} ORDER BY seat`);
    expect(seats.map((s) => s.seat)).toEqual([1]);
    a.ws.close();
    b.ws.close();
  });
});
