import { randomUUID } from 'node:crypto';
import {
  applyBlackjackAction,
  blackjackView,
  canDouble,
  canInsure,
  canSplit,
  insuranceMax,
  extraStake,
  normalizeBlackjack,
  totalStake,
  ECONOMY,
  isValidRouletteBet,
  isValidSicBoBet,
  rollSicBo,
  spinRoulette,
  spinSlots,
  startBlackjack,
  type BlackjackAction,
  type BlackjackState,
  type BlackjackView,
  type GameKey,
  type Rng,
  type RouletteBet,
  type RoundEnvelope,
  type SicBoBet,
} from '@casino/shared';
import { and, eq } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { gameRounds } from '../db/schema';
import { fail } from '../errors';
import { takeNonce } from './fair';
import { isUniqueViolation } from './users';
import { awardGameplayExp, type ExpResult } from './progression';
import { applyDelta, getBalance } from './wallet';

export interface PlayOutcome<T> {
  envelope: RoundEnvelope<T>;
  game: GameKey;
  /** Total stake and payout of a round that settled during this call (null if still running or replayed). */
  settled: { bet: number; payout: number } | null;
  /** EXP/level change caused by this round (null when none). */
  progress?: ExpResult | null;
}

export function assertStake(total: number): void {
  if (!Number.isSafeInteger(total) || total <= 0) throw fail('invalid_bet');
  if (total < ECONOMY.minBet) throw fail('bet_too_low');
  if (total > ECONOMY.maxBet) throw fail('bet_too_high');
}

async function findByKey(db: Db | Tx, userId: string, key: string) {
  const [row] = await db
    .select()
    .from(gameRounds)
    .where(and(eq(gameRounds.userId, userId), eq(gameRounds.idempotencyKey, key)));
  return row;
}

async function replay<T>(db: Db, userId: string, row: typeof gameRounds.$inferSelect, game: GameKey): Promise<PlayOutcome<T>> {
  if (row.game !== game) throw fail('bad_request', 'idempotency key reused for another game');
  return {
    envelope: { roundId: row.id, balance: await getBalance(db, userId), nonce: row.nonce ?? 0, result: row.result as T },
    game,
    settled: null,
  };
}

/** Runs a single-shot game (debit, fair RNG, settle) in one transaction. Safe to retry with the same key. */
async function playInstant<T extends { payout: number }>(
  db: Db,
  userId: string,
  key: string,
  game: GameKey,
  stake: number,
  compute: (rng: Rng) => T,
): Promise<PlayOutcome<T>> {
  assertStake(stake);
  const existing = await findByKey(db, userId, key);
  if (existing) return replay(db, userId, existing, game);
  try {
    return await db.transaction(async (tx) => {
      const roundId = randomUUID();
      await applyDelta(tx, userId, -stake, 'bet', roundId);
      const { seedId, nonce, rng } = await takeNonce(tx, userId);
      const result = compute(rng);
      await tx.insert(gameRounds).values({
        id: roundId,
        userId,
        game,
        bet: stake,
        payout: result.payout,
        status: 'settled',
        result,
        seedId,
        nonce,
        idempotencyKey: key,
        settledAt: new Date(),
      });
      const balance = result.payout > 0 ? await applyDelta(tx, userId, result.payout, 'payout', roundId) : await getBalance(tx, userId);
      const progress = await awardGameplayExp(tx, userId, roundId, stake);
      return { envelope: { roundId, balance, nonce, result }, game, settled: { bet: stake, payout: result.payout }, progress };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const row = await findByKey(db, userId, key);
      if (row) return replay(db, userId, row, game);
    }
    throw err;
  }
}

export function playSlots(db: Db, userId: string, key: string, bet: number) {
  return playInstant(db, userId, key, 'slots', bet, (rng) => spinSlots(rng, bet));
}

export function playRoulette(db: Db, userId: string, key: string, bets: RouletteBet[]) {
  if (!bets.every(isValidRouletteBet)) throw fail('invalid_bet');
  const stake = bets.reduce((s, b) => s + b.amount, 0);
  return playInstant(db, userId, key, 'roulette', stake, (rng) => spinRoulette(rng, bets));
}

export function playSicBo(db: Db, userId: string, key: string, bets: SicBoBet[]) {
  if (!bets.every(isValidSicBoBet)) throw fail('invalid_bet');
  const stake = bets.reduce((s, b) => s + b.amount, 0);
  return playInstant(db, userId, key, 'sicbo', stake, (rng) => rollSicBo(rng, bets));
}

export async function blackjackStart(db: Db, userId: string, key: string, bet: number): Promise<PlayOutcome<BlackjackView>> {
  assertStake(bet);
  const existing = await findByKey(db, userId, key);
  if (existing) return replay(db, userId, existing, 'blackjack');
  try {
    return await db.transaction(async (tx) => {
      const [active] = await tx
        .select({ id: gameRounds.id })
        .from(gameRounds)
        .where(and(eq(gameRounds.userId, userId), eq(gameRounds.game, 'blackjack'), eq(gameRounds.status, 'active')));
      if (active) throw fail('round_active');

      const roundId = randomUUID();
      await applyDelta(tx, userId, -bet, 'bet', roundId);
      const { seedId, nonce, rng } = await takeNonce(tx, userId);
      const state = startBlackjack(rng, bet);
      const view = blackjackView(state);
      const finished = state.phase === 'finished';
      await tx.insert(gameRounds).values({
        id: roundId,
        userId,
        game: 'blackjack',
        bet,
        payout: state.payout,
        status: finished ? 'settled' : 'active',
        state: finished ? null : state,
        result: view,
        seedId,
        nonce,
        idempotencyKey: key,
        settledAt: finished ? new Date() : null,
      });
      const balance =
        finished && state.payout > 0 ? await applyDelta(tx, userId, state.payout, 'payout', roundId) : await getBalance(tx, userId);
      const progress = finished ? await awardGameplayExp(tx, userId, roundId, bet) : null;
      return {
        envelope: { roundId, balance, nonce, result: view },
        game: 'blackjack' as const,
        settled: finished ? { bet, payout: state.payout } : null,
        progress,
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const row = await findByKey(db, userId, key);
      if (row) return replay(db, userId, row, 'blackjack');
      throw fail('round_active');
    }
    throw err;
  }
}

export async function blackjackAct(
  db: Db,
  userId: string,
  key: string,
  roundId: string,
  action: BlackjackAction,
  amount = 0,
): Promise<PlayOutcome<BlackjackView>> {
  return db.transaction(async (tx) => {
    const [round] = await tx
      .select()
      .from(gameRounds)
      .where(and(eq(gameRounds.id, roundId), eq(gameRounds.userId, userId), eq(gameRounds.game, 'blackjack')))
      .for('update');
    if (!round) throw fail('round_not_found');
    if (round.lastActionKey === key) {
      return {
        envelope: { roundId, balance: await getBalance(tx, userId), nonce: round.nonce ?? 0, result: round.result as BlackjackView },
        game: 'blackjack' as const,
        settled: null,
      };
    }
    if (round.status !== 'active' || !round.state) throw fail('round_finished');

    const state = normalizeBlackjack(round.state as BlackjackState);
    if ((action === 'double' && !canDouble(state)) || (action === 'split' && !canSplit(state)) || (action === 'insurance' && !canInsure(state))) throw fail('invalid_bet');
    if (action === 'insurance' && (amount < 0 || amount > insuranceMax(state.bet))) throw fail('invalid_bet');
    // Doubling or splitting stakes the active hand's bet again, insurance stakes the chosen amount;
    // it is taken from the wallet first (insufficient_funds rolls the whole action back).
    const extra = extraStake(state, action, amount);
    if (extra > 0) await applyDelta(tx, userId, -extra, 'bet', roundId);
    let next: BlackjackState;
    try {
      next = applyBlackjackAction(state, action, amount);
    } catch {
      throw fail('invalid_bet');
    }
    const view = blackjackView(next);
    const finished = next.phase === 'finished';
    const stake = totalStake(next);
    await tx
      .update(gameRounds)
      .set({
        state: finished ? null : next,
        result: view,
        bet: stake,
        payout: next.payout,
        status: finished ? 'settled' : 'active',
        lastActionKey: key,
        settledAt: finished ? new Date() : null,
      })
      .where(eq(gameRounds.id, roundId));
    const balance =
      finished && next.payout > 0 ? await applyDelta(tx, userId, next.payout, 'payout', roundId) : await getBalance(tx, userId);
    const progress = finished ? await awardGameplayExp(tx, userId, roundId, stake) : null;
    return {
      envelope: { roundId, balance, nonce: round.nonce ?? 0, result: view },
      game: 'blackjack' as const,
      settled: finished ? { bet: stake, payout: next.payout } : null,
      progress,
    };
  });
}

export async function blackjackResume(db: Db, userId: string): Promise<RoundEnvelope<BlackjackView> | null> {
  const [round] = await db
    .select()
    .from(gameRounds)
    .where(and(eq(gameRounds.userId, userId), eq(gameRounds.game, 'blackjack'), eq(gameRounds.status, 'active')));
  if (!round?.state) return null;
  return {
    roundId: round.id,
    balance: await getBalance(db, userId),
    nonce: round.nonce ?? 0,
    result: blackjackView(normalizeBlackjack(round.state as BlackjackState)),
  };
}

export function isBigWin(settled: { bet: number; payout: number }): boolean {
  return settled.payout >= settled.bet * ECONOMY.bigWin.multiplier && settled.payout >= ECONOMY.bigWin.minPayout;
}
