import { type Rng, randInt } from './rng';

/** European single-zero wheel order (clockwise from 0). */
export const ROULETTE_WHEEL: readonly number[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26,
];

export const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RouletteColor = 'red' | 'black' | 'green';

export type RouletteBetKind = 'straight' | 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | 'dozen' | 'column';

export interface RouletteBet {
  kind: RouletteBetKind;
  /** straight: 0-36, dozen/column: 1-3, otherwise ignored */
  value?: number;
  amount: number;
}

export interface RouletteResult {
  number: number;
  color: RouletteColor;
  /** Index in ROULETTE_WHEEL, used by the client animation. */
  pocket: number;
  bets: (RouletteBet & { payout: number })[];
  payout: number;
}

export function rouletteColor(n: number): RouletteColor {
  if (n === 0) return 'green';
  return ROULETTE_RED.has(n) ? 'red' : 'black';
}

/** Total return (stake included) multiplier for a bet on the given number, 0 if lost. */
export function rouletteReturn(bet: Pick<RouletteBet, 'kind' | 'value'>, n: number): number {
  const v = bet.value ?? 0;
  switch (bet.kind) {
    case 'straight':
      return n === v ? 36 : 0;
    case 'red':
      return rouletteColor(n) === 'red' ? 2 : 0;
    case 'black':
      return rouletteColor(n) === 'black' ? 2 : 0;
    case 'odd':
      return n !== 0 && n % 2 === 1 ? 2 : 0;
    case 'even':
      return n !== 0 && n % 2 === 0 ? 2 : 0;
    case 'low':
      return n >= 1 && n <= 18 ? 2 : 0;
    case 'high':
      return n >= 19 ? 2 : 0;
    case 'dozen':
      return n !== 0 && Math.ceil(n / 12) === v ? 3 : 0;
    case 'column':
      return n !== 0 && ((n - 1) % 3) + 1 === v ? 3 : 0;
  }
}

export function isValidRouletteBet(bet: RouletteBet): boolean {
  if (!Number.isInteger(bet.amount) || bet.amount <= 0) return false;
  if (bet.kind === 'straight') return Number.isInteger(bet.value) && bet.value! >= 0 && bet.value! <= 36;
  if (bet.kind === 'dozen' || bet.kind === 'column') return bet.value === 1 || bet.value === 2 || bet.value === 3;
  return true;
}

export function settleRoulette(bets: readonly RouletteBet[], number: number): RouletteResult {
  const pocket = ROULETTE_WHEEL.indexOf(number);
  const settled = bets.map((b) => ({ ...b, payout: b.amount * rouletteReturn(b, number) }));
  return {
    number,
    color: rouletteColor(number),
    pocket,
    bets: settled,
    payout: settled.reduce((s, b) => s + b.payout, 0),
  };
}

export function spinRoulette(rng: Rng, bets: readonly RouletteBet[]): RouletteResult {
  return settleRoulette(bets, ROULETTE_WHEEL[randInt(rng, ROULETTE_WHEEL.length)]!);
}
