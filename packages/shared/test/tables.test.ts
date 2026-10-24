import { describe, expect, it } from 'vitest';
import { isValidTableBet, rollTaiXiu, ROULETTE_WHEEL, seededRng, sequenceRng, spinRouletteNumber, tableBetReturn, type TaiXiuOutcome } from '../src';

const tx = (dice: [number, number, number]): TaiXiuOutcome => {
  const total = dice[0] + dice[1] + dice[2];
  const triple = dice[0] === dice[1] && dice[1] === dice[2];
  return { dice, total, triple, side: triple ? 'triple' : total >= 11 ? 'tai' : 'xiu' };
};

describe('Tài Xỉu rules', () => {
  it('Tài wins on 11–17, Xỉu on 4–10, both pay 1:1 (stake back + 1)', () => {
    expect(tableBetReturn('taixiu', { kind: 'big', amount: 100 }, tx([5, 4, 2]))).toBe(200);
    expect(tableBetReturn('taixiu', { kind: 'small', amount: 100 }, tx([5, 4, 2]))).toBe(0);
    expect(tableBetReturn('taixiu', { kind: 'small', amount: 100 }, tx([1, 2, 3]))).toBe(200);
  });

  it('any triple makes both Tài and Xỉu lose; Any Triple pays 30:1', () => {
    for (const d of [1, 2, 3, 4, 5, 6]) {
      const o = tx([d, d, d]);
      expect(o.side).toBe('triple');
      expect(tableBetReturn('taixiu', { kind: 'big', amount: 100 }, o)).toBe(0);
      expect(tableBetReturn('taixiu', { kind: 'small', amount: 100 }, o)).toBe(0);
      expect(tableBetReturn('taixiu', { kind: 'anyTriple', amount: 100 }, o)).toBe(3100);
    }
  });

  it('totals and singles follow the Sic Bo table', () => {
    expect(tableBetReturn('taixiu', { kind: 'total', value: 4, amount: 10 }, tx([1, 1, 2]))).toBe(610);
    expect(tableBetReturn('taixiu', { kind: 'single', value: 6, amount: 10 }, tx([6, 6, 1]))).toBe(30);
  });

  it('rolls fair dice from the RNG', () => {
    expect(rollTaiXiu(sequenceRng([0, 0.5, 0.999]))).toEqual(tx([1, 4, 6]));
    const counts = new Map<number, number>();
    const rng = seededRng(42);
    for (let i = 0; i < 60_000; i++) for (const d of rollTaiXiu(rng).dice) counts.set(d, (counts.get(d) ?? 0) + 1);
    for (const face of [1, 2, 3, 4, 5, 6]) expect(Math.abs(counts.get(face)! / 180_000 - 1 / 6)).toBeLessThan(0.01);
  });

  it('validates bet areas', () => {
    expect(isValidTableBet('taixiu', { kind: 'big', amount: 10 })).toBe(true);
    expect(isValidTableBet('taixiu', { kind: 'big', value: 3, amount: 10 })).toBe(false);
    expect(isValidTableBet('taixiu', { kind: 'total', value: 3, amount: 10 })).toBe(false);
    expect(isValidTableBet('taixiu', { kind: 'red', amount: 10 })).toBe(false);
  });
});

describe('table roulette', () => {
  it('lands on a pocket of the European wheel and pays by the standard table', () => {
    const o = spinRouletteNumber(sequenceRng([0]));
    expect(o).toEqual({ number: 0, color: 'green', pocket: 0 });
    const n17 = spinRouletteNumber(sequenceRng([ROULETTE_WHEEL.indexOf(17) / 37 + 0.001]));
    expect(n17.number).toBe(17);
    expect(tableBetReturn('roulette', { kind: 'straight', value: 17, amount: 10 }, n17)).toBe(360);
    expect(tableBetReturn('roulette', { kind: 'black', amount: 10 }, n17)).toBe(20);
    expect(tableBetReturn('roulette', { kind: 'red', amount: 10 }, o)).toBe(0); // zero loses even-money bets
    expect(isValidTableBet('roulette', { kind: 'dozen', value: 4, amount: 10 })).toBe(false);
  });
});
