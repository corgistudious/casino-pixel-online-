import { describe, expect, it } from 'vitest';
import { addChip, parseKey, rouletteKey, toBetList, totalOf } from '../src/lib/bets';
import { compactChips, formatDuration } from '../src/lib/format';

describe('bet helpers', () => {
  it('stacks chips by spot key', () => {
    let bets: Record<string, number> = {};
    bets = addChip(bets, rouletteKey({ kind: 'red' }), 100);
    bets = addChip(bets, rouletteKey({ kind: 'straight', value: 7 }), 50);
    bets = addChip(bets, 'red', 100);
    expect(bets).toEqual({ red: 200, 'straight:7': 50 });
    expect(totalOf(bets)).toBe(250);
  });

  it('converts to the API bet list', () => {
    expect(toBetList({ red: 200, 'straight:0': 10, odd: 0 })).toEqual([
      { kind: 'red', amount: 200 },
      { kind: 'straight', value: 0, amount: 10 },
    ]);
    expect(parseKey('dozen:3')).toEqual({ kind: 'dozen', value: 3 });
  });
});

describe('format', () => {
  it('compacts chip amounts', () => {
    expect(compactChips(950)).toBe('950');
    expect(compactChips(1500)).toBe('1.5K');
    expect(compactChips(2_000_000)).toBe('2M');
  });

  it('formats countdowns', () => {
    expect(formatDuration(3_723_000)).toBe('01:02:03');
    expect(formatDuration(-5)).toBe('00:00:00');
  });
});
