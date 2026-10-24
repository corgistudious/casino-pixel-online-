import { describe, expect, it } from 'vitest';
import { BALL_LAND_AT, ballRelative, clockOffset, mergeBets, phaseAt, sumBets } from '../src/lib/tables';

const at = (s: number) => new Date(1_700_000_000_000 + s * 1000).toISOString();
const round = { betsOpenAt: at(3), locksAt: at(33), revealAt: at(37), nextAt: at(42) };
const ms = (s: number) => 1_700_000_000_000 + s * 1000;

describe('phaseAt', () => {
  it('follows shake → betting → reveal → result on the server clock', () => {
    expect(phaseAt(round, ms(0))).toEqual({ phase: 'shaking', endsAt: ms(3) });
    expect(phaseAt(round, ms(3))).toEqual({ phase: 'betting', endsAt: ms(33) });
    expect(phaseAt(round, ms(32.999)).phase).toBe('betting');
    expect(phaseAt(round, ms(33))).toEqual({ phase: 'revealing', endsAt: ms(37) });
    expect(phaseAt(round, ms(37))).toEqual({ phase: 'result', endsAt: ms(42) });
  });
});

describe('bet sums', () => {
  it('groups confirmed bets by spot and merges pending chips', () => {
    const placed = sumBets([
      { kind: 'big', value: null, amount: 100 },
      { kind: 'big', value: null, amount: 50 },
      { kind: 'total', value: 9, amount: 20 },
    ]);
    expect(placed).toEqual({ big: 150, 'total:9': 20 });
    expect(mergeBets(placed, { big: 10, small: 5 })).toEqual({ big: 160, 'total:9': 20, small: 5 });
  });
});

describe('ballRelative', () => {
  it('ends exactly on the pocket and stays there', () => {
    const pocket = 1.234;
    expect(ballRelative(BALL_LAND_AT, 50, pocket)).toBe(pocket);
    expect(ballRelative(1, 50, pocket)).toBe(pocket);
    expect(ballRelative(0, 50, pocket)).toBe(pocket + 50);
  });
  it('only ever slows down (monotonic approach)', () => {
    let prev = Infinity;
    for (let p = 0; p <= 1; p += 0.01) {
      const v = ballRelative(p, 44, 0);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('clockOffset', () => {
  it('uses the least-delayed sample', () => {
    expect(clockOffset([])).toBe(0);
    expect(clockOffset([-120, -40, -300])).toBe(-40);
  });
});
