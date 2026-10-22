import { describe, expect, it } from 'vitest';
import { settleSicBo, sicBoReturn, type SicBoBet } from '../src';

const allRolls: [number, number, number][] = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) allRolls.push([a, b, c]);

function rtp(bet: Pick<SicBoBet, 'kind' | 'value'>) {
  return allRolls.reduce((s, d) => s + sicBoReturn(bet, d), 0) / allRolls.length;
}

describe('sic bo', () => {
  it('triples lose big/small', () => {
    expect(sicBoReturn({ kind: 'big' }, [6, 6, 6])).toBe(0);
    expect(sicBoReturn({ kind: 'small' }, [1, 1, 1])).toBe(0);
    expect(sicBoReturn({ kind: 'anyTriple' }, [3, 3, 3])).toBe(31);
  });

  it('single pays per matching die', () => {
    expect(sicBoReturn({ kind: 'single', value: 4 }, [4, 4, 2])).toBe(3);
    expect(sicBoReturn({ kind: 'single', value: 5 }, [4, 4, 2])).toBe(0);
  });

  it('every bet has a house edge (RTP < 1) but is reasonable (> 0.8)', () => {
    const bets: Pick<SicBoBet, 'kind' | 'value'>[] = [
      { kind: 'small' },
      { kind: 'big' },
      { kind: 'odd' },
      { kind: 'even' },
      { kind: 'anyTriple' },
      ...[1, 2, 3, 4, 5, 6].map((value) => ({ kind: 'single' as const, value })),
      ...Array.from({ length: 14 }, (_, i) => ({ kind: 'total' as const, value: i + 4 })),
    ];
    for (const bet of bets) {
      const r = rtp(bet);
      expect(r, JSON.stringify(bet)).toBeLessThan(1);
      expect(r, JSON.stringify(bet)).toBeGreaterThan(0.8);
    }
  });

  it('settles', () => {
    const r = settleSicBo(
      [
        { kind: 'big', amount: 100 },
        { kind: 'total', value: 12, amount: 10 },
      ],
      [6, 4, 2],
    );
    expect(r.total).toBe(12);
    expect(r.payout).toBe(200 + 70);
  });
});
