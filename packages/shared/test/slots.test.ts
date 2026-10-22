import { describe, expect, it } from 'vitest';
import { evaluateGrid, evaluateLine, seededRng, slotsTheoreticalRtp, spinSlots, type SlotSymbol } from '../src';

describe('slots', () => {
  it('pays left-to-right runs with wild substitution', () => {
    expect(evaluateLine(['cherry', 'cherry', 'cherry', 'lemon', 'bell'])).toEqual({ symbol: 'cherry', count: 3, multiplier: 3 });
    expect(evaluateLine(['wild', 'seven', 'seven', 'wild', 'bell'])).toEqual({ symbol: 'seven', count: 4, multiplier: 350 });
    expect(evaluateLine(['cherry', 'cherry', 'lemon', 'cherry', 'cherry'])).toBeNull();
    expect(evaluateLine(['lemon', 'cherry', 'cherry', 'cherry', 'cherry'])).toBeNull();
  });

  it('prefers the better of a wild run and a symbol run', () => {
    // 3 wilds (150x) beats 4 cherries (12x)
    expect(evaluateLine(['wild', 'wild', 'wild', 'cherry', 'lemon'])?.symbol).toBe('wild');
    expect(evaluateLine(['wild', 'wild', 'wild', 'wild', 'wild'])).toEqual({ symbol: 'wild', count: 5, multiplier: 5000 });
  });

  it('computes payout from all ten lines', () => {
    const row = (s: SlotSymbol): SlotSymbol[] => [s, s, s];
    const grid = [row('bell'), row('bell'), row('bell'), row('bell'), row('bell')];
    const result = evaluateGrid(grid, 100);
    expect(result.wins).toHaveLength(10);
    expect(result.payout).toBe(100 * 150); // 10 lines × 150x line bet of 10
  });

  it('has an RTP between 95% and 97%', () => {
    const rtp = slotsTheoreticalRtp();
    expect(rtp).toBeGreaterThan(0.95);
    expect(rtp).toBeLessThan(0.97);
  });

  it('simulated RTP roughly matches theory', () => {
    const rng = seededRng(42);
    let bet = 0;
    let paid = 0;
    for (let i = 0; i < 200_000; i++) {
      const r = spinSlots(rng, 100);
      bet += 100;
      paid += r.payout;
    }
    expect(Math.abs(paid / bet - slotsTheoreticalRtp())).toBeLessThan(0.05);
  });
});
