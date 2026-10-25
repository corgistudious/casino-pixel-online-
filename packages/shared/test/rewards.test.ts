import { describe, expect, it } from 'vitest';
import { addMonths, bracketFor, bundleCurrency, giftcodeSchema, normalizeGiftcode, OFFICIAL_SEASON_REWARDS, resolveDurations, VUONG_GIA_ITEMS } from '../src/rewards';

describe('season reward brackets', () => {
  it('maps final Top positions to brackets; everyone else is "rest"', () => {
    expect([1, 2, 3, 4, 10, 11, 50, null].map(bracketFor)).toEqual(['top1', 'top2', 'top3', 'top4_10', 'top4_10', 'top11_50', 'top11_50', 'rest']);
  });
  it('matches the official table', () => {
    const c = (b: keyof typeof OFFICIAL_SEASON_REWARDS) => bundleCurrency(OFFICIAL_SEASON_REWARDS[b]);
    expect(c('top1')).toEqual({ silver: 3_000_000, gold: 3_000 });
    expect(c('top2')).toEqual({ silver: 2_000_000, gold: 2_000 });
    expect(c('top3')).toEqual({ silver: 1_000_000, gold: 1_000 });
    expect(c('top4_10')).toEqual({ silver: 500_000, gold: 500 });
    expect(c('top11_50')).toEqual({ silver: 300_000, gold: 0 });
    expect(c('rest')).toEqual({ silver: 200_000, gold: 0 });
    for (const b of ['top1', 'top2', 'top3'] as const) {
      expect(OFFICIAL_SEASON_REWARDS[b].filter((a) => a.type === 'item').map((a) => a.type === 'item' && a.itemId)).toEqual([...VUONG_GIA_ITEMS]);
    }
    for (const b of ['top4_10', 'top11_50', 'rest'] as const) expect(OFFICIAL_SEASON_REWARDS[b].some((a) => a.type === 'item')).toBe(false);
  });
  it('turns 60 days into an absolute expiry from the given start', () => {
    const start = new Date('2026-12-01T00:00:00.000Z');
    const [item] = resolveDurations([{ type: 'item', itemId: 'vuong_gia_frame', durationDays: 60 }], start);
    expect(item).toEqual({ type: 'item', itemId: 'vuong_gia_frame', expiresAt: '2027-01-30T00:00:00.000Z' });
    expect(addMonths(start, 2).toISOString()).toBe('2027-02-01T00:00:00.000Z');
  });
});

describe('giftcodes', () => {
  it('normalises case, spaces and dashes', () => {
    expect(normalizeGiftcode('keyo-launch 2026')).toBe('KEYOLAUNCH2026');
    expect(giftcodeSchema.parse(' ab-cd-12 ')).toBe('ABCD12');
    expect(() => giftcodeSchema.parse('bad$$code')).toThrow();
  });
});
