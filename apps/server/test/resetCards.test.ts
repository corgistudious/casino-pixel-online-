import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeReset, MaintenanceRefused, planReset, uncoveredForeignKeys } from '../src/maintenance/testData';
import { applyDelta } from '../src/services/wallet';
import { register, startTestApp, TestSocket, type TestApp } from './helpers';

/**
 * reset:test-data against Poker / Liêng / Xì Tố hands and ranked matches: their players live in
 * `card_hands.state.players[].userId` and `ranked_matches.players` (no foreign keys). A running hand
 * or match with real players blocks the reset; finished ones keep the real players' history.
 */
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.app.close();
});

type P = Awaited<ReturnType<typeof register>> & { ws: TestSocket };
async function player(real = false): Promise<P> {
  const r = await register(t);
  if (real) await t.db.execute(sql`UPDATE users SET is_test = false WHERE id = ${r.user.id}::uuid`);
  await applyDelta(t.db, r.user.id, 50_000, 'admin_adjust');
  return { ...r, ws: await TestSocket.connect(t.port, r.token) };
}
const rows = async <T>(q: ReturnType<typeof sql>) => (await t.db.execute(q)) as unknown as T[];
const count = async (q: ReturnType<typeof sql>) => Number((await rows<{ c: string }>(q))[0]!.c);
const activeHand = async (tableId: string) => (await rows<{ id: string }>(sql`SELECT id FROM card_hands WHERE table_id = ${tableId} AND status = 'active'`))[0]?.id;
const handRow = async (id: string) => (await rows<{ status: string; state: { players: { seat: number; userId: string | null; removed?: boolean }[] } }>(sql`SELECT status, state FROM card_hands WHERE id = ${id}::uuid`))[0];
/** Times out every turn until the hand is over (each timeout checks or folds). */
async function finish(handId: string) {
  for (let i = 0; i < 40; i++) {
    if ((await handRow(handId))!.status !== 'active') return;
    await t.db.execute(sql`UPDATE card_hands SET deadline = now() - interval '1 second' WHERE id = ${handId}::uuid`);
    await t.cards.timeout(handId);
  }
  throw new Error('hand did not finish');
}
/** Pauses a table so no new hand starts, and ends the break of the last one. */
const pause = (tableId: string) => t.cards.setStatus(tableId, 'paused');
async function nextHand(tableId: string) {
  await t.db.execute(sql`UPDATE card_hands SET ended_at = now() - interval '1 minute' WHERE table_id = ${tableId}`);
  await t.cards.setStatus(tableId, 'open');
  await t.cards.tick();
  const id = await activeHand(tableId);
  expect(id).toBeTruthy();
  return id!;
}
async function wallet(userId: string) {
  const [r] = await rows<{ balance: string; ledger: string }>(sql`
    SELECT balance, (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = ${userId}::uuid AND currency = 'silver') AS ledger FROM wallets WHERE user_id = ${userId}::uuid`);
  expect(r!.balance).toBe(r!.ledger);
  return Number(r!.balance);
}

describe('reset:test-data with card tables and ranked matches', () => {
  let real: P;
  const h: Record<string, string> = {};
  let realChips = 0;

  it('blocks while a hand with TEST and real players runs; deletes TEST-only hands; keeps and anonymises shared finished hands', async () => {
    real = await player(true);
    const [t1, t2, t3] = [await player(), await player(), await player()];
    await real.ws.ok({ type: 'card.sit', tableId: 'poker-1', seat: 0, buyIn: 2_000 });
    await t1.ws.ok({ type: 'card.sit', tableId: 'poker-1', seat: 1, buyIn: 2_000 });
    await t2.ws.ok({ type: 'card.sit', tableId: 'lieng-1', seat: 0, buyIn: 2_000 });
    await t3.ws.ok({ type: 'card.sit', tableId: 'lieng-1', seat: 1, buyIn: 2_000 });
    // One finished hand at each table, then a running one at each.
    await t.cards.tick();
    h.finishedMixed = (await activeHand('poker-1'))!;
    h.finishedTest = (await activeHand('lieng-1'))!;
    await finish(h.finishedMixed);
    await finish(h.finishedTest);
    h.activeMixed = await nextHand('poker-1');
    h.activeTest = await nextHand('lieng-1');

    // Ranked matches: running mixed, finished mixed (TEST player won), TEST-only.
    const ids = { real: real.user.id, t1: t1.user.id, t2: t2.user.id, t3: t3.user.id };
    const runningMatch = (await rows<{ id: string }>(sql`
      INSERT INTO ranked_matches (game, table_id, season_id, players, status) VALUES ('poker', 'poker-2', 1, ARRAY[${ids.real}::uuid, ${ids.t1}::uuid], 'active') RETURNING id`))[0]!.id;
    const sharedMatch = (await rows<{ id: string }>(sql`
      INSERT INTO ranked_matches (game, table_id, season_id, players, status, winner_id, ended_at) VALUES ('poker', 'poker-2', 1, ARRAY[${ids.real}::uuid, ${ids.t1}::uuid], 'finished', ${ids.t1}::uuid, now()) RETURNING id`))[0]!.id;
    await t.db.execute(sql`INSERT INTO ranked_matches (game, table_id, season_id, players, status, winner_id, ended_at) VALUES ('lieng', 'poker-2', 1, ARRAY[${ids.t2}::uuid, ${ids.t3}::uuid], 'finished', ${ids.t2}::uuid, now())`);
    h.runningMatch = runningMatch;
    h.sharedMatch = sharedMatch;

    let plan = await planReset(t.db);
    expect(plan.cardHands).toEqual({ activeTestOnly: 1, activeMixed: 1, finishedTestOnly: 1, finishedMixed: 1 });
    expect(plan.rankedMatches).toEqual({ activeTestOnly: 0, activeMixed: 1, finishedTestOnly: 1, finishedMixed: 1 });
    expect(plan.blockers.join(' ')).toMatch(/running card hand\(s\).*TEST and real/);
    expect(plan.blockers.join(' ')).toMatch(/running ranked match/);
    const before = await handRow(h.activeMixed);
    for (let i = 0; i < 2; i++) await expect(executeReset(t.db, plan.confirmPhrase, 'vitest')).rejects.toBeInstanceOf(MaintenanceRefused);
    expect(await handRow(h.activeMixed)).toEqual(before);

    // The running hand and match end; the tables stop dealing; the reset may run.
    await finish(h.activeMixed);
    await pause('poker-1');
    await pause('lieng-1');
    await t.db.execute(sql`UPDATE ranked_matches SET status = 'finished', winner_id = ${ids.real}::uuid, ended_at = now() WHERE id = ${runningMatch}::uuid`);
    realChips = (await wallet(real.user.id)) + Number((await rows<{ stack: string }>(sql`SELECT stack FROM card_seats WHERE user_id = ${real.user.id}::uuid`))[0]!.stack);
    const realRounds = await count(sql`SELECT count(*) AS c FROM game_rounds WHERE user_id = ${real.user.id}::uuid`);
    plan = await planReset(t.db);
    expect(plan.blockers).toEqual([]);
    expect(plan.cardHands).toEqual({ activeTestOnly: 1, activeMixed: 0, finishedTestOnly: 1, finishedMixed: 2 });

    const result = await executeReset(t.db, plan.confirmPhrase, 'vitest');
    expect(result.cardHands).toEqual({ deleted: 2, redacted: 2 });
    expect(result.rankedMatches).toEqual({ deleted: 1, redacted: 2 });
    // TEST-only hands are gone, the running one included.
    expect(await handRow(h.finishedTest)).toBeUndefined();
    expect(await handRow(h.activeTest)).toBeUndefined();
    // Shared hands stay: the real seat as it was, the TEST seat anonymised.
    for (const id of [h.finishedMixed, h.activeMixed]) {
      const row = (await handRow(id))!;
      expect(row.state.players.find((p) => p.seat === 0)!.userId).toBe(real.user.id);
      expect(row.state.players.find((p) => p.seat === 1)).toMatchObject({ userId: null, removed: true });
    }
    // Ranked matches keep the real player; TEST ids are NULL, including a TEST winner.
    const matchOf = (id: string) => rows(sql`SELECT players[1]::text AS first, players[2] IS NULL AS second_null, cardinality(players) AS n, winner_id FROM ranked_matches WHERE id = ${id}::uuid`);
    expect(await matchOf(sharedMatch)).toEqual([{ first: real.user.id, second_null: true, n: 2, winner_id: null }]);
    expect(await matchOf(runningMatch)).toEqual([{ first: real.user.id, second_null: true, n: 2, winner_id: real.user.id }]);
    expect(await count(sql`SELECT count(*) AS c FROM ranked_matches WHERE players && ARRAY(SELECT id FROM users WHERE is_test)`)).toBe(0);
    // No dangling ids anywhere; the real player's chips and history are untouched.
    expect(await count(sql`
      SELECT count(*) AS c FROM card_hands h, jsonb_array_elements(h.state->'players') p
      WHERE p->>'userId' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = (p->>'userId')::uuid)`)).toBe(0);
    expect((await wallet(real.user.id)) + Number((await rows<{ stack: string }>(sql`SELECT stack FROM card_seats WHERE user_id = ${real.user.id}::uuid`))[0]!.stack)).toBe(realChips);
    expect(await count(sql`SELECT count(*) AS c FROM game_rounds WHERE user_id = ${real.user.id}::uuid`)).toBe(realRounds);
    expect(await count(sql`SELECT count(*) AS c FROM card_seats`)).toBe(1);
    expect(await uncoveredForeignKeys(t.db)).toEqual([]);
  });

  it('the tables keep working after the reset; the redacted hand still renders; a second reset has nothing to do', async () => {
    await t.cards.setStatus('poker-1', 'open');
    const v = await t.cards.view('poker-1', real.user.id);
    expect(v.mySeat).toBe(0);
    // Standing up cashes the real player's chips out exactly once.
    const before = await wallet(real.user.id);
    const stack = Number((await rows<{ stack: string }>(sql`SELECT stack FROM card_seats WHERE user_id = ${real.user.id}::uuid`))[0]!.stack);
    await real.ws.ok({ type: 'card.stand', tableId: 'poker-1' });
    expect(await wallet(real.user.id)).toBe(before + stack);
    await t.cards.tick();
    expect(await wallet(real.user.id)).toBe(before + stack);
    const again = await planReset(t.db);
    expect(again.blockers.join(' ')).toMatch(/no TEST accounts/);
    expect(again.cardHands).toEqual({ activeTestOnly: 0, activeMixed: 0, finishedTestOnly: 0, finishedMixed: 0 });
    expect(again.rankedMatches).toEqual({ activeTestOnly: 0, activeMixed: 0, finishedTestOnly: 0, finishedMixed: 0 });
    real.ws.close();
  });
});
