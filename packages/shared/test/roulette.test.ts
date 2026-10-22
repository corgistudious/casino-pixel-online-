import { describe, expect, it } from 'vitest';
import { ROULETTE_WHEEL, rouletteColor, rouletteReturn, settleRoulette, type RouletteBet } from '../src';

describe('roulette', () => {
  it('wheel has 37 unique pockets', () => {
    expect(new Set(ROULETTE_WHEEL).size).toBe(37);
  });

  it('colors', () => {
    expect(rouletteColor(0)).toBe('green');
    expect(rouletteColor(1)).toBe('red');
    expect(rouletteColor(2)).toBe('black');
  });

  it('zero loses all outside bets', () => {
    for (const kind of ['red', 'black', 'odd', 'even', 'low', 'high'] as const) expect(rouletteReturn({ kind }, 0)).toBe(0);
    expect(rouletteReturn({ kind: 'dozen', value: 1 }, 0)).toBe(0);
    expect(rouletteReturn({ kind: 'column', value: 1 }, 0)).toBe(0);
    expect(rouletteReturn({ kind: 'straight', value: 0 }, 0)).toBe(36);
  });

  it('dozens and columns', () => {
    expect(rouletteReturn({ kind: 'dozen', value: 3 }, 25)).toBe(3);
    expect(rouletteReturn({ kind: 'column', value: 1 }, 34)).toBe(3);
    expect(rouletteReturn({ kind: 'column', value: 3 }, 36)).toBe(3);
  });

  it('every bet type returns 36/37 on average', () => {
    const bets: Pick<RouletteBet, 'kind' | 'value'>[] = [
      { kind: 'straight', value: 17 },
      { kind: 'red' },
      { kind: 'black' },
      { kind: 'odd' },
      { kind: 'even' },
      { kind: 'low' },
      { kind: 'high' },
      { kind: 'dozen', value: 2 },
      { kind: 'column', value: 2 },
    ];
    for (const bet of bets) {
      const total = ROULETTE_WHEEL.reduce((s, n) => s + rouletteReturn(bet, n), 0);
      expect(total).toBe(36);
    }
  });

  it('settles multiple bets', () => {
    const r = settleRoulette(
      [
        { kind: 'red', amount: 10 },
        { kind: 'straight', value: 32, amount: 5 },
        { kind: 'even', amount: 20 },
      ],
      32,
    );
    expect(r.payout).toBe(20 + 180 + 40);
    expect(ROULETTE_WHEEL[r.pocket]).toBe(32);
  });
});
