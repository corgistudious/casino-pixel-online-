import { type Rng, randInt } from './rng';

export type SicBoBetKind = 'small' | 'big' | 'odd' | 'even' | 'total' | 'single' | 'anyTriple';

export interface SicBoBet {
  kind: SicBoBetKind;
  /** total: 4-17, single: 1-6 */
  value?: number;
  amount: number;
}

export interface SicBoResult {
  dice: [number, number, number];
  total: number;
  triple: boolean;
  bets: (SicBoBet & { payout: number })[];
  payout: number;
}

/** "To one" odds for a specific total (Macau table). */
export const SICBO_TOTAL_ODDS: Record<number, number> = {
  4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6,
  11: 6, 12: 6, 13: 8, 14: 12, 15: 17, 16: 30, 17: 60,
};

export const SICBO_ANY_TRIPLE_ODDS = 30;

/** Total return (stake included) multiplier, 0 if lost. */
export function sicBoReturn(bet: Pick<SicBoBet, 'kind' | 'value'>, dice: readonly number[]): number {
  const total = dice[0]! + dice[1]! + dice[2]!;
  const triple = dice[0] === dice[1] && dice[1] === dice[2];
  switch (bet.kind) {
    case 'small':
      return !triple && total >= 4 && total <= 10 ? 2 : 0;
    case 'big':
      return !triple && total >= 11 && total <= 17 ? 2 : 0;
    case 'odd':
      return !triple && total % 2 === 1 ? 2 : 0;
    case 'even':
      return !triple && total % 2 === 0 ? 2 : 0;
    case 'total': {
      const odds = SICBO_TOTAL_ODDS[bet.value ?? -1];
      return odds !== undefined && total === bet.value ? odds + 1 : 0;
    }
    case 'single': {
      const hits = dice.filter((d) => d === bet.value).length;
      return hits === 0 ? 0 : hits + 1;
    }
    case 'anyTriple':
      return triple ? SICBO_ANY_TRIPLE_ODDS + 1 : 0;
  }
}

export function isValidSicBoBet(bet: SicBoBet): boolean {
  if (!Number.isInteger(bet.amount) || bet.amount <= 0) return false;
  if (bet.kind === 'total') return Number.isInteger(bet.value) && bet.value! >= 4 && bet.value! <= 17;
  if (bet.kind === 'single') return Number.isInteger(bet.value) && bet.value! >= 1 && bet.value! <= 6;
  return true;
}

export function settleSicBo(bets: readonly SicBoBet[], dice: [number, number, number]): SicBoResult {
  const settled = bets.map((b) => ({ ...b, payout: b.amount * sicBoReturn(b, dice) }));
  return {
    dice,
    total: dice[0] + dice[1] + dice[2],
    triple: dice[0] === dice[1] && dice[1] === dice[2],
    bets: settled,
    payout: settled.reduce((s, b) => s + b.payout, 0),
  };
}

export function rollSicBo(rng: Rng, bets: readonly SicBoBet[]): SicBoResult {
  const roll = () => randInt(rng, 6) + 1;
  return settleSicBo(bets, [roll(), roll(), roll()]);
}
