import { randomUUID } from 'node:crypto';
import { bjtView, type BjtState, type Card } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { executeReset, MaintenanceRefused, planReset, uncoveredForeignKeys } from '../src/maintenance/testData';
import { applyDelta } from '../src/services/wallet';
import { register, startTestApp, TEST_DB, TestSocket, type TestApp } from './helpers';

/**
 * reset:test-data against shared Blackjack tables: `bj_rounds.state.players[].userId` is JSON with
 * no foreign key, so the reset must find TEST players there itself, and must never void, refund or
 * re-pay a round a real player is in.
 */
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.app.close();
});

type Player = Awaited<ReturnType<typeof register>> & { ws: TestSocket };
async function player(real = false): Promise<Player> {
  const r = await register(t);
  if (real) await t.db.execute(sql`UPDATE users SET is_test = false WHERE id = ${r.user.id}::uuid`);
  await applyDelta(t.db, r.user.id, 50_000, 'admin_adjust');
  return { ...r, ws: await TestSocket.connect(t.port, r.token) };
}
const restartedServer = () =>
  buildApp(loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, JWT_SECRET: 'test-secret-test-secret-test-secret-123', REDIS_URL: '', TABLE_SCHEDULER: 'off' }), { logger: false });

const count = async (q: ReturnType<typeof sql>) => Number(((await t.db.execute(q)) as unknown as { c: string }[])[0]!.c);
async function balance(userId: string) {
  const [r] = await t.db.execute<{ balance: string; ledger: string }>(sql`
    SELECT balance, (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = ${userId}::uuid AND currency = 'silver') AS ledger FROM wallets WHERE user_id = ${userId}::uuid`);
  expect(r!.balance).toBe(r!.ledger);
  return Number(r!.balance);
}
type Row = { id: string; status: string; version: number; state: { phase: string; keys?: string[]; players: { seat: number; userId: string | null; payout: number; removed?: boolean }[] } };
const roundRow = async (id: string) => (await t.db.execute<Row>(sql`SELECT id, status, version, state FROM bj_rounds WHERE id = ${id}::uuid`))[0];
const latest = async (table: string) => (await t.db.execute<Row>(sql`SELECT id, status, version, state FROM bj_rounds WHERE table_id = ${table} ORDER BY seq DESC LIMIT 1`))[0]!;

/** Ends the break on every table, opens betting rounds, and stacks the shoe of each listed table. */
async function openRounds(shoes: Record<string, Card[]>) {
  await t.db.execute(sql`UPDATE bj_rounds SET ended_at = now() - interval '1 minute' WHERE status <> 'active'`);
  await t.bjt.tick();
  const ids: Record<string, string> = {};
  for (const [table, cards] of Object.entries(shoes)) {
    const r = await latest(table);
    expect([r.status, r.state.phase]).toEqual(['active', 'betting']);
    await t.db.execute(sql`UPDATE bj_rounds SET state = jsonb_set(state, '{shoe}', ${JSON.stringify(cards.slice().reverse())}::jsonb) WHERE id = ${r.id}::uuid`);
    ids[table] = r.id;
  }
  return ids;
}
const bet = (p: Player, tableId: string, amount: number) => p.ws.ok({ type: 'bjt.bet', tableId, amount });
const act = (p: Player, tableId: string, roundId: string, action: string) => p.ws.ok({ type: 'bjt.act', tableId, roundId, action });

describe('reset:test-data with shared Blackjack tables', () => {
  let real: Player;
  let t1: Player;
  let t2: Player;
  const r = {} as Record<'finishedMixed' | 'finishedTest' | 'activeMixed' | 'activeTest', string>;
  let realBalance = 0;

  it('sets up: finished mixed and TEST-only rounds, then running mixed and TEST-only rounds with unsettled stakes', async () => {
    real = await player(true);
    [t1, t2] = [await player(), await player()];
    await real.ws.ok({ type: 'bjt.sit', tableId: 'bj-1', seat: 0 });
    await t1.ws.ok({ type: 'bjt.sit', tableId: 'bj-1', seat: 1 });
    await t2.ws.ok({ type: 'bjt.sit', tableId: 'bj-2', seat: 2 });
    const start = await balance(real.user.id);

    // Finished rounds. bj-1: real 16, t1 18, dealer 10/7 → real loses 100, t1 wins. bj-2: t2 19 vs 17 → wins.
    let ids = await openRounds({ 'bj-1': ['10S', '9H', '10D', '6C', '9S', '7H'], 'bj-2': ['10S', '10D', '9C', '7H'] });
    [r.finishedMixed, r.finishedTest] = [ids['bj-1']!, ids['bj-2']!];
    await bet(real, 'bj-1', 100);
    await bet(t1, 'bj-1', 100);
    await act(real, 'bj-1', r.finishedMixed, 'stand');
    await act(t1, 'bj-1', r.finishedMixed, 'stand');
    await bet(t2, 'bj-2', 1000);
    await act(t2, 'bj-2', r.finishedTest, 'stand');
    expect((await roundRow(r.finishedMixed))!.status).toBe('done');
    expect((await roundRow(r.finishedTest))!.status).toBe('done');
    expect(await balance(real.user.id)).toBe(start - 100);

    // Running rounds. bj-1: real 20, t1 18 (real's turn). bj-2: t2 alone, dealt, stake unsettled.
    ids = await openRounds({ 'bj-1': ['10S', '9H', '10D', '10C', '9S', '7H'], 'bj-2': ['10S', '10D', '6C', '7H'] });
    [r.activeMixed, r.activeTest] = [ids['bj-1']!, ids['bj-2']!];
    await bet(real, 'bj-1', 100);
    await bet(t1, 'bj-1', 100);
    await bet(t2, 'bj-2', 1000);
    expect((await roundRow(r.activeMixed))!.state.phase).toBe('playing');
    expect((await roundRow(r.activeTest))!.state.phase).toBe('playing');
    // The TEST player at the mixed table loses the connection mid-round.
    t1.ws.close();
    realBalance = await balance(real.user.id);
    expect(realBalance).toBe(start - 200);
  });

  it('refuses while a running round seats TEST and real players together, changing nothing (every time)', async () => {
    const plan = await planReset(t.db);
    expect(plan.bjRounds).toEqual({ activeTestOnly: 1, activeMixed: 1, finishedTestOnly: 1, finishedMixed: 1 });
    expect(plan.blockers.join(' ')).toMatch(/running shared Blackjack round\(s\) seat TEST and real players/);
    const before = await roundRow(r.activeMixed);
    for (let i = 0; i < 2; i++) await expect(executeReset(t.db, plan.confirmPhrase, 'vitest')).rejects.toBeInstanceOf(MaintenanceRefused);
    expect(await roundRow(r.activeMixed)).toEqual(before);
    expect((await roundRow(r.activeTest))!.status).toBe('active');
    expect(await count(sql`SELECT count(*) AS c FROM users WHERE id = ${t1.user.id}::uuid`)).toBe(1);
    expect(await balance(real.user.id)).toBe(realBalance);
  });

  it('after a restart the mixed round finishes (the offline TEST player auto-stands), paid exactly once', async () => {
    await act(real, 'bj-1', r.activeMixed, 'stand');
    // t1 is offline: a short grace instead of the full turn timer.
    const graced = (await t.db.execute<{ s: number }>(sql`SELECT extract(epoch FROM deadline - now()) AS s FROM bj_rounds WHERE id = ${r.activeMixed}::uuid`))[0]!;
    expect(Number(graced.s)).toBeLessThanOrEqual(6);
    const second = await restartedServer();
    try {
      await second.bjt.tick(new Date(Date.now() + 10_000));
      await second.bjt.tick(new Date(Date.now() + 10_000));
    } finally {
      await second.app.close();
    }
    const done = (await roundRow(r.activeMixed))!;
    expect(done.status).toBe('done');
    expect(done.state.players.map((p) => [p.seat, p.payout])).toEqual([
      [0, 200],
      [1, 200],
    ]);
    realBalance += 200;
    expect(await balance(real.user.id)).toBe(realBalance);
    expect(await count(sql`SELECT count(*) AS c FROM game_rounds WHERE user_id = ${real.user.id}::uuid AND idempotency_key LIKE 'bjt:%'`)).toBe(2);
  });

  it('removes TEST rounds and TEST identities, keeps real rounds, money and history untouched', async () => {
    const plan = await planReset(t.db);
    expect(plan.blockers).toEqual([]);
    expect(plan.bjRounds).toEqual({ activeTestOnly: 1, activeMixed: 0, finishedTestOnly: 1, finishedMixed: 2 });
    expect(plan.tables.find((x) => x.table === 'bj_seats')).toMatchObject({ test: 2, kept: 1 });
    const realLedger = await count(sql`SELECT count(*) AS c FROM ledger_entries WHERE user_id = ${real.user.id}::uuid`);
    const realEntries = async () =>
      (await t.db.execute<{ p: unknown }>(sql`
        SELECT p FROM bj_rounds r, jsonb_array_elements(r.state->'players') p WHERE p->>'userId' = ${real.user.id} ORDER BY r.seq`)).map((x) => x.p);
    const keptEntries = await realEntries();
    expect(keptEntries).toHaveLength(2);

    const result = await executeReset(t.db, plan.confirmPhrase, 'vitest');
    expect(result.bjRounds).toEqual({ deleted: 2, redacted: 2 });
    expect(result.verification.after.bjRealRounds).toEqual(result.verification.before.bjRealRounds);

    // TEST-only rounds are gone, the running one included; nothing was refunded to anybody.
    expect(await roundRow(r.finishedTest)).toBeUndefined();
    expect(await roundRow(r.activeTest)).toBeUndefined();
    expect(await count(sql`SELECT count(*) AS c FROM ledger_entries WHERE round_id IN (${r.activeTest}::uuid, ${r.finishedTest}::uuid)`)).toBe(0);
    expect(await count(sql`SELECT count(*) AS c FROM bj_rounds WHERE table_id = 'bj-2'`)).toBe(0);
    // bj-1's next betting round (opened by the scheduler after the break) has no players yet and is untouched.
    expect((await latest('bj-1')).state).toMatchObject({ phase: 'betting', players: [] });
    // Mixed rounds stay with the real player's entry unchanged and no trace of the TEST player.
    for (const id of [r.finishedMixed, r.activeMixed]) {
      const row = (await roundRow(id))!;
      expect(row.status).toBe('done');
      expect(row.state.keys).toBeUndefined();
      expect(row.state.players.find((p) => p.seat === 1)).toMatchObject({ userId: null, removed: true, payout: 200 });
    }
    expect(await realEntries()).toEqual(keptEntries);
    expect(await count(sql`
      SELECT count(*) AS c FROM bj_rounds r, jsonb_array_elements(r.state->'players') p
      WHERE p->>'userId' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = (p->>'userId')::uuid)`)).toBe(0);
    // Real money and history.
    expect(await balance(real.user.id)).toBe(realBalance);
    expect(await count(sql`SELECT count(*) AS c FROM ledger_entries WHERE user_id = ${real.user.id}::uuid`)).toBe(realLedger);
    expect(await count(sql`SELECT count(*) AS c FROM game_rounds WHERE user_id = ${real.user.id}::uuid AND idempotency_key LIKE 'bjt:%'`)).toBe(2);
    expect(await count(sql`SELECT count(*) AS c FROM bj_seats`)).toBe(1);
    expect(await uncoveredForeignKeys(t.db)).toEqual([]);
  });

  it('the tables keep working after the reset and after a restart; a second reset has nothing to do', async () => {
    // A redacted finished round still renders.
    const redacted = (await roundRow(r.activeMixed))!;
    expect(bjtView(redacted.state as unknown as BjtState, { id: redacted.id, seq: 1, deadline: null, seedHash: '', serverSeed: '' }).players.map((p) => [p.seat, p.payout])).toEqual([
      [0, 200],
      [1, 200],
    ]);
    expect((await t.bjt.view('bj-1', real.user.id)).mySeat).toBe(0);

    const second = await restartedServer();
    try {
      await t.db.execute(sql`UPDATE bj_rounds SET ended_at = now() - interval '1 minute'`);
      await second.bjt.tick();
    } finally {
      await second.app.close();
    }
    // Only the real player's table starts a round; the emptied TEST table stays idle.
    expect((await latest('bj-1')).state.phase).toBe('betting');
    expect(await count(sql`SELECT count(*) AS c FROM bj_rounds WHERE table_id = 'bj-2'`)).toBe(0);
    const before = await balance(real.user.id);
    await bet(real, 'bj-1', 100);
    expect(await balance(real.user.id)).toBe(before - 100);
    // Retrying the same request does not take the stake twice.
    const id = randomUUID();
    const roundId = (await latest('bj-1')).id;
    await real.ws.request({ type: 'bjt.act', tableId: 'bj-1', roundId, action: 'stand' }, id);
    await real.ws.request({ type: 'bjt.act', tableId: 'bj-1', roundId, action: 'stand' }, id);
    expect((await roundRow(roundId))!.status).toBe('done');

    const again = await planReset(t.db);
    expect(again.blockers.join(' ')).toMatch(/no TEST accounts/);
    expect(again.bjRounds).toEqual({ activeTestOnly: 0, activeMixed: 0, finishedTestOnly: 0, finishedMixed: 0 });
    await expect(executeReset(t.db, again.confirmPhrase, 'vitest')).rejects.toBeInstanceOf(MaintenanceRefused);
    real.ws.close();
    t2.ws.close();
  });
});
