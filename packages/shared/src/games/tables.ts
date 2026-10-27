import { z } from 'zod';
import { type Rng, randInt } from './rng';
import { ROULETTE_WHEEL, rouletteColor, rouletteReturn, type RouletteBetKind, type RouletteColor } from './roulette';
import { sicBoReturn, type SicBoBetKind } from './sicbo';

/**
 * Shared-round tables: every player at a table bets on the same round, on a server clock.
 * Tài Xỉu: shake (bowl covered) → betting → reveal (bowl lifts) → result/break.
 * Roulette: betting → spin (ball runs, result already fixed) → result/break.
 */
export const ROUND_GAMES = ['taixiu', 'roulette'] as const;
export type RoundGame = (typeof ROUND_GAMES)[number];

export interface RoundTimings {
  /** Bowl shaking before bets open (Tài Xỉu only, 0 for roulette). */
  shakeMs: number;
  /** Betting window. */
  betMs: number;
  /** Reveal animation between locking bets and paying out (bowl lift / wheel spin). */
  revealMs: number;
  /** Result shown after payout, before the next round starts. */
  breakMs: number;
}

export const DEFAULT_TIMINGS: Record<RoundGame, RoundTimings> = {
  taixiu: { shakeMs: 3_000, betMs: 30_000, revealMs: 4_000, breakMs: 5_000 },
  roulette: { shakeMs: 0, betMs: 25_000, revealMs: 15_000, breakMs: 5_000 },
};

/** Client-visible phase, derived from the round timestamps and the server clock. */
export type RoundPhase = 'shaking' | 'betting' | 'revealing' | 'result';

export interface TaiXiuOutcome {
  dice: [number, number, number];
  total: number;
  triple: boolean;
  /** 'tai' (11–17), 'xiu' (4–10) or 'triple' (both Tài and Xỉu lose). */
  side: 'tai' | 'xiu' | 'triple';
}

export interface RouletteOutcome {
  number: number;
  color: RouletteColor;
  /** Index in ROULETTE_WHEEL (where the ball lands). */
  pocket: number;
}

export type RoundOutcome = TaiXiuOutcome | RouletteOutcome;

export function rollTaiXiu(rng: Rng): TaiXiuOutcome {
  const dice: [number, number, number] = [randInt(rng, 6) + 1, randInt(rng, 6) + 1, randInt(rng, 6) + 1];
  const total = dice[0] + dice[1] + dice[2];
  const triple = dice[0] === dice[1] && dice[1] === dice[2];
  return { dice, total, triple, side: triple ? 'triple' : total >= 11 ? 'tai' : 'xiu' };
}

export function spinRouletteNumber(rng: Rng): RouletteOutcome {
  const pocket = randInt(rng, ROULETTE_WHEEL.length);
  const number = ROULETTE_WHEEL[pocket]!;
  return { number, color: rouletteColor(number), pocket };
}

/** Bet areas. Tài = big, Xỉu = small; both lose on any triple (standard Sic Bo rule). */
export const TAIXIU_BET_KINDS = ['big', 'small', 'odd', 'even', 'total', 'single', 'anyTriple'] as const satisfies readonly SicBoBetKind[];
export const ROULETTE_BET_KINDS = ['straight', 'red', 'black', 'odd', 'even', 'low', 'high', 'dozen', 'column'] as const satisfies readonly RouletteBetKind[];

export const tableBetSchema = z.object({
  kind: z.string().min(1).max(20),
  value: z.number().int().min(0).max(36).optional(),
  amount: z.number().int().positive().max(1_000_000),
});
export type TableBet = z.infer<typeof tableBetSchema>;

export function isValidTableBet(game: RoundGame, bet: TableBet): boolean {
  if (!Number.isSafeInteger(bet.amount) || bet.amount <= 0) return false;
  if (game === 'taixiu') {
    if (!(TAIXIU_BET_KINDS as readonly string[]).includes(bet.kind)) return false;
    if (bet.kind === 'total') return bet.value !== undefined && bet.value >= 4 && bet.value <= 17;
    if (bet.kind === 'single') return bet.value !== undefined && bet.value >= 1 && bet.value <= 6;
    return bet.value === undefined;
  }
  if (!(ROULETTE_BET_KINDS as readonly string[]).includes(bet.kind)) return false;
  if (bet.kind === 'straight') return bet.value !== undefined && bet.value >= 0 && bet.value <= 36;
  if (bet.kind === 'dozen' || bet.kind === 'column') return bet.value === 1 || bet.value === 2 || bet.value === 3;
  return bet.value === undefined;
}

/** Total return of a bet (stake included), 0 when it loses. */
export function tableBetReturn(game: RoundGame, bet: Pick<TableBet, 'kind' | 'value' | 'amount'>, outcome: RoundOutcome): number {
  if (game === 'taixiu') {
    const o = outcome as TaiXiuOutcome;
    return bet.amount * sicBoReturn({ kind: bet.kind as SicBoBetKind, value: bet.value }, o.dice);
  }
  return bet.amount * rouletteReturn({ kind: bet.kind as RouletteBetKind, value: bet.value }, (outcome as RouletteOutcome).number);
}

export const betAreaKey = (b: Pick<TableBet, 'kind' | 'value'>) => (b.value === undefined ? b.kind : `${b.kind}:${b.value}`);

export interface TableSummary {
  id: string;
  game: RoundGame;
  name: { vi: string; en: string };
  minBet: number;
  maxBet: number;
  status: 'open' | 'paused';
}

export interface MyTableBet {
  id: string;
  kind: string;
  value: number | null;
  amount: number;
  payout: number | null;
  status: 'placed' | 'settled' | 'refunded';
}

/** Everything a client needs to draw a shared-round table. Bets of other players are only shown as totals. */
export interface TableRoundView {
  table: TableSummary;
  round: {
    id: string;
    seq: number;
    phase: RoundPhase;
    opensAt: string;
    betsOpenAt: string;
    locksAt: string;
    revealAt: string;
    nextAt: string;
    /** SHA-256 of the server seed, published before betting (provably fair). */
    seedHash: string;
    /** Revealed after payout so anyone can recompute the outcome. */
    serverSeed: string | null;
    /** Only present once bets are locked. */
    outcome: RoundOutcome | null;
    status: 'betting' | 'locked' | 'settled' | 'void';
  };
  /** Server clock (ms since epoch) when this view was produced, to sync client countdowns. */
  serverNow: number;
  totals: Record<string, { amount: number; players: number }>;
  bettors: number;
  /** Public identities of players who placed a bet in this round; no bet amounts or balances. */
  players: { uid: number; displayName: string }[];
  watchers: number;
  history: RoundOutcome[];
  myBets: MyTableBet[];
}
