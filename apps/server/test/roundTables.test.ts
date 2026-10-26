import { randomUUID } from 'node:crypto';
import { ECONOMY, tableBetReturn, type RoundOutcome, type TableRoundView } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { sha256 } from '../src/services/fair';
import { roundOutcome } from '../src/services/roundTables';
import { createOwner, register, startTestApp, TEST_DB, TestSocket, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
  await t.tables.tick();
});
afterAll(async () => {
  await t.app.close();
});

const one = async <T>(q: ReturnType<typeof sql>) => ((await t.db.execute(q)) as unknown as T[])[0]!;
const current = (tableId: string) => one<{ id: string; status: string; server_seed: string; seed_hash: string; seq: number }>(sql`SELECT * FROM table_rounds WHERE table_id = ${tableId} ORDER BY seq DESC LIMIT 1`);
/** Moves the current round's clock so that `phase` has started (the scheduler is driven by hand in tests). */
async function fastForward(tableId: string, phase: 'bets' | 'lock' | 'reveal' | 'next') {
  const shift = { bets: 'bets_open_at', lock: 'locks_at', reveal: 'reveal_at', next: 'next_at' }[phase];
  const cols = ['bets_open_at', 'locks_at', 'reveal_at', 'next_at'];
  const upto = cols.slice(0, cols.indexOf(shift) + 1);
  await t.db.execute(sql.raw(`UPDATE table_rounds SET ${upto.map((c) => `${c} = now() - interval '1 second'`).join(', ')} WHERE id = (SELECT id FROM table_rounds WHERE table_id = '${tableId}' ORDER BY seq DESC LIMIT 1)`));
}
/** Keeps the current round open for betting regardless of how long the test takes. */
async function keepOpen(tableId: string) {
  await t.db.execute(sql.raw(`UPDATE table_rounds SET bets_open_at = now() - interval '1 second', locks_at = now() + interval '60 seconds', reveal_at = now() + interval '75 seconds', next_at = now() + interval '80 seconds' WHERE id = (SELECT id FROM table_rounds WHERE table_id = '${tableId}' ORDER BY seq DESC LIMIT 1) AND status = 'betting'`));
}
const balance = async (userId: string) => Number((await one<{ balance: string }>(sql`SELECT balance FROM wallets WHERE user_id = ${userId}`)).balance);
async function ledgerMatches(userId: string) {
  const r = await one<{ ledger: string; balance: string }>(sql`SELECT (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = ${userId} AND currency = 'silver') AS ledger, (SELECT balance FROM wallets WHERE user_id = ${userId}) AS balance`);
  expect(Number(r.ledger)).toBe(Number(r.balance));
}

describe('shared-round tables', () => {
  it('opens a round per table: Tài Xỉu starts with the bowl shaking, roulette with betting', async () => {
    const tables = (await t.app.inject({ url: '/api/tables' })).json().tables as { id: string }[];
    expect(tables.map((x) => x.id)).toEqual(['taixiu-1', 'roulette-1']);
    const tx = (await t.app.inject({ url: '/api/tables/taixiu-1' })).json() as TableRoundView;
    expect(tx.round.phase).toBe('shaking');
    expect(tx.round.outcome).toBeNull();
    expect(tx.round.serverSeed).toBeNull();
    expect(tx.round.seedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(new Date(tx.round.locksAt).getTime() - new Date(tx.round.betsOpenAt).getTime()).toBe(30_000);
    expect(new Date(tx.round.nextAt).getTime() - new Date(tx.round.revealAt).getTime()).toBe(5_000);
    expect(((await t.app.inject({ url: '/api/tables/roulette-1' })).json() as TableRoundView).round.phase).toBe('betting');
  });

  it('refuses bets while the bowl is still shaking', async () => {
    const p = await register(t);
    const ws = await TestSocket.connect(t.port, p.token);
    const view = await ws.ok<TableRoundView>({ type: 'table.join', tableId: 'taixiu-1' });
    const res = await ws.request({ type: 'table.bet', tableId: 'taixiu-1', roundId: view.round.id, bets: [{ kind: 'big', amount: 100 }] });
    expect(res.ok ? null : res.error.code).toBe('betting_closed');
    ws.close();
  });

  it('plays a full Tài Xỉu round: bets, lock, reveal, exact payout, provably fair', async () => {
    await fastForward('taixiu-1', 'bets');
    const a = await register(t);
    const b = await register(t);
    const watcher = await register(t);
    const wa = await TestSocket.connect(t.port, a.token);
    const wb = await TestSocket.connect(t.port, b.token);
    const ww = await TestSocket.connect(t.port, watcher.token);
    const view = await wa.ok<TableRoundView>({ type: 'table.join', tableId: 'taixiu-1' });
    await ww.ok({ type: 'table.join', tableId: 'taixiu-1' });
    expect(view.round.phase).toBe('betting');

    const betId = randomUUID();
    const bet = { type: 'table.bet', tableId: 'taixiu-1', roundId: view.round.id, bets: [{ kind: 'big', amount: 1000 }, { kind: 'total', value: 10, amount: 200 }] };
    const first = await wa.ok<{ myBets: unknown[]; balance: number }>(bet, betId);
    const replay = await wa.ok<{ myBets: unknown[]; balance: number }>(bet, betId); // same message id: no second bet
    expect(first.myBets).toHaveLength(2);
    expect(replay.myBets).toHaveLength(2);
    expect(replay.balance).toBe(ECONOMY.welcome.silver - 1200);
    await wb.ok({ type: 'table.bet', tableId: 'taixiu-1', roundId: view.round.id, bets: [{ kind: 'small', amount: 500 }] });

    // Nothing reveals the outcome while betting is open.
    const live = (await t.app.inject({ url: '/api/tables/taixiu-1' })).json() as TableRoundView;
    expect(live.round.outcome).toBeNull();
    expect(live.totals).toMatchObject({ big: { amount: 1000, players: 1 }, small: { amount: 500, players: 1 }, 'total:10': { amount: 200, players: 1 } });
    expect(live.bettors).toBe(2);

    // Lock: the outcome is fixed and broadcast; later bets are refused.
    await fastForward('taixiu-1', 'lock');
    ww.events.length = 0;
    await t.tables.tick();
    const locked = ww.events.find((e) => e.type === 'event' && e.event === 'table') as { data: TableRoundView } | undefined;
    expect(locked?.data.round.status).toBe('locked');
    expect(locked?.data.round.outcome).not.toBeNull();
    expect(locked?.data.round.serverSeed).toBeNull();
    const late = await wb.request({ type: 'table.bet', tableId: 'taixiu-1', roundId: view.round.id, bets: [{ kind: 'big', amount: 100 }] });
    expect(late.ok ? null : late.error.code).toBe('betting_closed');

    // Player A disconnects mid-round; settlement still pays.
    wa.close();
    await fastForward('taixiu-1', 'reveal');
    await t.tables.tick();
    const round = await current('taixiu-1');
    expect(round.status).toBe('settled');
    const outcome = locked!.data.round.outcome as RoundOutcome;
    const expectA = tableBetReturn('taixiu', { kind: 'big', amount: 1000 }, outcome) + tableBetReturn('taixiu', { kind: 'total', value: 10, amount: 200 }, outcome);
    const expectB = tableBetReturn('taixiu', { kind: 'small', amount: 500 }, outcome);
    expect(await balance(a.user.id)).toBe(ECONOMY.welcome.silver - 1200 + expectA);
    expect(await balance(b.user.id)).toBe(ECONOMY.welcome.silver - 500 + expectB);
    await ledgerMatches(a.user.id);
    await ledgerMatches(b.user.id);

    // Provably fair: the revealed seed matches the published hash and reproduces the outcome.
    const settled = (await t.app.inject({ url: '/api/tables/taixiu-1' })).json() as TableRoundView;
    expect(sha256(settled.round.serverSeed!)).toBe(settled.round.seedHash);
    expect(roundOutcome('taixiu', settled.round.serverSeed!, settled.round.id)).toEqual(outcome);
    // History rows feed stats and the admin dashboard.
    const hist = await one<{ n: string }>(sql`SELECT count(*) AS n FROM game_rounds WHERE game = 'taixiu' AND idempotency_key = ${`table:${view.round.id}`}`);
    expect(Number(hist.n)).toBe(2);
    wb.close();
    ww.close();
  });

  it('never pays twice: repeated and concurrent settlement are no-ops', async () => {
    await fastForward('taixiu-1', 'next');
    await t.tables.tick();
    await fastForward('taixiu-1', 'bets');
    const p = await register(t);
    const ws = await TestSocket.connect(t.port, p.token);
    const view = await ws.ok<TableRoundView>({ type: 'table.join', tableId: 'taixiu-1' });
    await ws.ok({ type: 'table.bet', tableId: 'taixiu-1', roundId: view.round.id, bets: [{ kind: 'odd', amount: 300 }, { kind: 'even', amount: 300 }] });
    await fastForward('taixiu-1', 'lock');
    await t.tables.tick();
    const results = await Promise.all([t.tables.settleRound(view.round.id), t.tables.settleRound(view.round.id), t.tables.settleRound(view.round.id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await t.tables.settleRound(view.round.id)).toBe(false);
    const payouts = await one<{ n: string }>(sql`SELECT count(*) AS n FROM ledger_entries WHERE user_id = ${p.user.id} AND reason = 'payout' AND ref = ${`round:${view.round.id}`}`);
    expect(Number(payouts.n)).toBeLessThanOrEqual(1);
    await ledgerMatches(p.user.id);
    ws.close();
  });

  it('enforces the minimum, the per-round maximum (even concurrently) and valid bet areas', async () => {
    await keepOpen('roulette-1');
    const view = (await t.app.inject({ url: '/api/tables/roulette-1' })).json() as TableRoundView;
    const p = await register(t);
    await t.db.execute(sql`UPDATE wallets SET balance = 500000 WHERE user_id = ${p.user.id}`);
    await t.db.execute(sql`INSERT INTO ledger_entries (user_id, currency, delta, balance_after, reason) VALUES (${p.user.id}, 'silver', ${500000 - ECONOMY.welcome.silver}, 500000, 'admin_adjust')`);
    const ws = await TestSocket.connect(t.port, p.token);
    const send = (bets: unknown[]) => ws.request({ type: 'table.bet', tableId: 'roulette-1', roundId: view.round.id, bets });
    expect((await send([{ kind: 'red', amount: 5 }])) as { ok: boolean }).toMatchObject({ ok: false, error: { code: 'bet_too_low' } });
    expect((await send([{ kind: 'big', amount: 100 }])) as { ok: boolean }).toMatchObject({ ok: false, error: { code: 'invalid_bet' } });
    expect((await send([{ kind: 'straight', value: 37, amount: 100 }])) as { ok: boolean }).toMatchObject({ ok: false });
    const [r1, r2] = await Promise.all([send([{ kind: 'red', amount: 60_000 }]), (await TestSocket.connect(t.port, p.token)).request({ type: 'table.bet', tableId: 'roulette-1', roundId: view.round.id, bets: [{ kind: 'black', amount: 60_000 }] })]);
    const outcomes = [r1, r2].map((r) => (r.ok ? 'ok' : r.error.code)).sort();
    expect(outcomes).toEqual(['bet_too_high', 'ok']);
    await ledgerMatches(p.user.id);
    ws.close();
  });

  it('roulette pays exactly by the wheel result', async () => {
    await keepOpen('roulette-1');
    const view = (await t.app.inject({ url: '/api/tables/roulette-1' })).json() as TableRoundView;
    const p = await register(t);
    const ws = await TestSocket.connect(t.port, p.token);
    const bets = [
      { kind: 'straight', value: 17, amount: 100 },
      { kind: 'red', amount: 200 },
      { kind: 'dozen', value: 2, amount: 300 },
      { kind: 'column', value: 3, amount: 100 },
    ];
    await ws.ok({ type: 'table.bet', tableId: 'roulette-1', roundId: view.round.id, bets });
    await fastForward('roulette-1', 'lock');
    await t.tables.tick();
    await fastForward('roulette-1', 'reveal');
    await t.tables.tick();
    const settled = (await t.app.inject({ url: '/api/tables/roulette-1' })).json() as TableRoundView;
    const outcome = settled.round.outcome!;
    const expected = bets.reduce((s, b) => s + tableBetReturn('roulette', b, outcome), 0);
    expect(await balance(p.user.id)).toBe(ECONOMY.welcome.silver - 700 + expected);
    expect(roundOutcome('roulette', settled.round.serverSeed!, settled.round.id)).toEqual(outcome);
    ws.close();
  });

  it('a server restart mid-round carries on and settles exactly once', async () => {
    await fastForward('roulette-1', 'next');
    await t.tables.tick();
    await keepOpen('roulette-1');
    const view = (await t.app.inject({ url: '/api/tables/roulette-1' })).json() as TableRoundView;
    const p = await register(t);
    const ws = await TestSocket.connect(t.port, p.token);
    await ws.ok({ type: 'table.bet', tableId: 'roulette-1', roundId: view.round.id, bets: [{ kind: 'odd', amount: 1000 }] });
    ws.close();
    await fastForward('roulette-1', 'lock');
    await t.tables.tick(); // locked, then "crash" before paying

    // A second server process on the same database (no reset) picks the round up.
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, JWT_SECRET: 'test-secret-test-secret-test-secret-123', TABLE_SCHEDULER: 'off' });
    const second = await buildApp(config, { logger: false });
    try {
      await fastForward('roulette-1', 'reveal');
      await Promise.all([second.tables.tick(), t.tables.tick()]); // both instances try
      const outcome = ((await second.app.inject({ url: '/api/tables/roulette-1' })).json() as TableRoundView).round.outcome!;
      expect(await balance(p.user.id)).toBe(ECONOMY.welcome.silver - 1000 + tableBetReturn('roulette', { kind: 'odd', amount: 1000 }, outcome));
      await ledgerMatches(p.user.id);
    } finally {
      await second.app.close();
    }
  });

  it('starts the next round after the break and keeps a result history', async () => {
    await fastForward('roulette-1', 'next');
    await t.tables.tick();
    const view = (await t.app.inject({ url: '/api/tables/roulette-1' })).json() as TableRoundView;
    expect(view.round.phase).toBe('betting');
    expect(view.history.length).toBeGreaterThanOrEqual(2);
  });

  it('staff can void a round and refund every stake', async () => {
    await keepOpen('roulette-1');
    const owner = await createOwner(t);
    const view = (await t.app.inject({ url: '/api/tables/roulette-1' })).json() as TableRoundView;
    const p = await register(t);
    const ws = await TestSocket.connect(t.port, p.token);
    await ws.ok({ type: 'table.bet', tableId: 'roulette-1', roundId: view.round.id, bets: [{ kind: 'low', amount: 2500 }] });
    ws.close();
    const res = await t.app.inject({ method: 'POST', url: `/api/admin/tables/rounds/${view.round.id}/void`, headers: owner.headers, payload: { reason: 'wheel stuck' } });
    expect(res.json().refundedPlayers).toBe(1);
    expect(await balance(p.user.id)).toBe(ECONOMY.welcome.silver);
    expect((await current('roulette-1')).status).toBe('void');
    await ledgerMatches(p.user.id);
  });
});
