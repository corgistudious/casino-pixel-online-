import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyDelta } from '../src/services/wallet';
import { randomIp, register, startTestApp, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.app.close();
});

type Player = Awaited<ReturnType<typeof register>>;
const transfer = (p: Player, body: { idempotencyKey?: string; currency: 'silver' | 'gold'; direction: 'deposit' | 'withdraw'; amount: number }) =>
  t.app.inject({ method: 'POST', url: '/api/bank/transfer', headers: { authorization: `Bearer ${p.token}` }, payload: { idempotencyKey: randomUUID(), ...body }, remoteAddress: randomIp() });
const overview = async (p: Player) =>
  (await t.app.inject({ method: 'GET', url: '/api/bank', headers: { authorization: `Bearer ${p.token}` }, remoteAddress: randomIp() })).json() as {
    wallet: { balance: number; gold: number };
    bank: { silver: number; gold: number };
  };

/** Wallet = ledger, and wallet + bank never changes through bank transfers. */
async function consistent(p: Player) {
  const [r] = await t.db.execute<{ balance: string; gold: string; ls: string; lg: string }>(sql`
    SELECT w.balance, w.gold,
      (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = w.user_id AND currency = 'silver') AS ls,
      (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = w.user_id AND currency = 'gold') AS lg
    FROM wallets w WHERE w.user_id = ${p.user.id}`);
  expect(r!.balance).toBe(r!.ls);
  expect(r!.gold).toBe(r!.lg);
  const o = await overview(p);
  return { silver: o.wallet.balance + o.bank.silver, gold: o.wallet.gold + o.bank.gold, o };
}

describe('bank', () => {
  it('deposits and withdraws both currencies; total assets never change', async () => {
    const p = await register(t);
    await t.db.transaction((tx) => applyDelta(tx, p.user.id, 500, 'admin_adjust', null, 'gold', `test:${randomUUID()}`));
    const start = await consistent(p);
    expect((await transfer(p, { currency: 'silver', direction: 'deposit', amount: 20_000 })).statusCode).toBe(200);
    expect((await transfer(p, { currency: 'gold', direction: 'deposit', amount: 300 })).statusCode).toBe(200);
    expect((await transfer(p, { currency: 'silver', direction: 'withdraw', amount: 5_000 })).statusCode).toBe(200);
    const end = await consistent(p);
    expect(end.o.bank).toEqual({ silver: 15_000, gold: 300 });
    expect({ silver: end.silver, gold: end.gold }).toEqual({ silver: start.silver, gold: start.gold });
    const history = (await t.app.inject({ method: 'GET', url: '/api/bank/history', headers: { authorization: `Bearer ${p.token}` }, remoteAddress: randomIp() })).json();
    expect(history.transfers.map((h: { direction: string; amount: number }) => [h.direction, h.amount])).toEqual([
      ['withdraw', 5_000],
      ['deposit', 300],
      ['deposit', 20_000],
    ]);
  });

  it('never goes negative on either side', async () => {
    const p = await register(t);
    const { o } = await consistent(p);
    expect((await transfer(p, { currency: 'silver', direction: 'deposit', amount: o.wallet.balance + 1 })).json().error.code).toBe('insufficient_funds');
    expect((await transfer(p, { currency: 'silver', direction: 'withdraw', amount: 1 })).json().error.code).toBe('insufficient_funds');
    expect((await transfer(p, { currency: 'gold', direction: 'deposit', amount: 1 })).json().error.code).toBe('insufficient_funds');
    expect((await transfer(p, { currency: 'silver', direction: 'deposit', amount: 0 })).statusCode).toBe(400);
    expect((await transfer(p, { currency: 'silver', direction: 'deposit', amount: 1.5 })).statusCode).toBe(400);
    const [n] = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM bank_transfers WHERE user_id = ${p.user.id}`);
    expect(n!.n).toBe(0);
  });

  it('a retried request (same key) applies once, even concurrently; a changed retry is refused', async () => {
    const p = await register(t);
    const start = await consistent(p);
    const key = randomUUID();
    const body = { idempotencyKey: key, currency: 'silver' as const, direction: 'deposit' as const, amount: 10_000 };
    const results = await Promise.all(Array.from({ length: 5 }, () => transfer(p, body)));
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const end = await consistent(p);
    expect(end.o.bank.silver).toBe(10_000);
    expect(end.silver).toBe(start.silver);
    expect((await transfer(p, { ...body, amount: 20_000 })).json().error.code).toBe('idempotency_conflict');
    // Another player cannot reuse (or probe) someone else's key.
    const other = await register(t);
    expect((await transfer(other, body)).json().error.code).toBe('idempotency_conflict');
  });

  it('parallel withdrawals cannot overdraw the bank', async () => {
    const p = await register(t);
    await transfer(p, { currency: 'silver', direction: 'deposit', amount: 30_000 });
    const tries = await Promise.all(Array.from({ length: 6 }, () => transfer(p, { currency: 'silver', direction: 'withdraw', amount: 10_000 })));
    expect(tries.filter((r) => r.statusCode === 200)).toHaveLength(3);
    expect((await consistent(p)).o.bank.silver).toBe(0);
  });
});
