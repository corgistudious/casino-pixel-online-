import { describe, expect, it } from 'vitest';
import { VIP_LEVELS, vipProgress } from '../src';

describe('vip table', () => {
  it('has 15 strictly increasing levels', () => {
    expect(VIP_LEVELS).toHaveLength(15);
    for (let i = 1; i < VIP_LEVELS.length; i++) {
      expect(VIP_LEVELS[i]!.exp).toBeGreaterThan(VIP_LEVELS[i - 1]!.exp);
      expect(VIP_LEVELS[i]!.daily.silver).toBeGreaterThan(VIP_LEVELS[i - 1]!.daily.silver);
    }
  });

  it('computes level and progress', () => {
    expect(vipProgress(0)).toMatchObject({ level: 1, toNext: 500 });
    expect(vipProgress(1_000)).toMatchObject({ level: 2, ratio: 0.5, toNext: 500 });
    expect(vipProgress(220_000)).toMatchObject({ level: 15, next: null, ratio: 1 });
    expect(vipProgress(999_999).level).toBe(15);
  });
});
