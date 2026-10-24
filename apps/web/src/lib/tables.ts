import { betAreaKey, type MyTableBet, type TableRoundView } from '@casino/shared';

export type TablePhase = 'shaking' | 'betting' | 'revealing' | 'result';

/** Phase of a shared round at server time `now`, and when it ends. Mirrors the server's phase rules. */
export function phaseAt(round: Pick<TableRoundView['round'], 'betsOpenAt' | 'locksAt' | 'revealAt' | 'nextAt'>, now: number): { phase: TablePhase; endsAt: number } {
  const betsOpen = Date.parse(round.betsOpenAt);
  const locks = Date.parse(round.locksAt);
  const reveal = Date.parse(round.revealAt);
  if (now < betsOpen) return { phase: 'shaking', endsAt: betsOpen };
  if (now < locks) return { phase: 'betting', endsAt: locks };
  if (now < reveal) return { phase: 'revealing', endsAt: reveal };
  return { phase: 'result', endsAt: Date.parse(round.nextAt) };
}

/** Confirmed bets grouped by table spot (key → amount). */
export function sumBets(bets: Pick<MyTableBet, 'kind' | 'value' | 'amount'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of bets) {
    const key = betAreaKey({ kind: b.kind, value: b.value ?? undefined });
    out[key] = (out[key] ?? 0) + b.amount;
  }
  return out;
}

export function mergeBets(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** Fraction of the roulette spin after which the ball rests in its pocket. */
export const BALL_LAND_AT = 0.86;

/**
 * Ball angle relative to the wheel at spin progress p (0..1): starts `rel0` radians ahead and
 * decelerates onto `pocketRel`, where it stays from BALL_LAND_AT on — so the ball always ends on
 * the server's pocket whatever the starting angles.
 */
export function ballRelative(p: number, rel0: number, pocketRel: number): number {
  const q = Math.min(1, Math.max(0, p) / BALL_LAND_AT);
  return pocketRel + rel0 * (1 - q) ** 3;
}

/** Server clock offset estimate: the largest (server − client) sample carries the least network delay. */
export function clockOffset(samples: number[]): number {
  return samples.length ? Math.max(...samples) : 0;
}
