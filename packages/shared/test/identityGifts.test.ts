import { describe, expect, it } from 'vitest';
import { GIFT_PRICE_PROPOSAL, GIFT_RULES, giftSendSchema, giftUpsertSchema } from '../src/gifts';
import { VIP_LEVELS, vipAdjustSchema, vipLevelSchema, vipProgress, vipTierOf } from '../src/vip';

describe('VIP tiers and configurable levels', () => {
  it('badge tiers: 1–3 silver, 4–6 gold, 7–9 platinum, 10–12 diamond, 13+ royal', () => {
    expect([1, 3, 4, 6, 7, 9, 10, 12, 13, 15, 20].map(vipTierOf)).toEqual(['silver', 'silver', 'gold', 'gold', 'platinum', 'platinum', 'diamond', 'diamond', 'royal', 'royal', 'royal']);
  });
  it('progress works on any level table (a 16th level, a skipped inactive level)', () => {
    const table = [...VIP_LEVELS, { level: 16, exp: 300_000, daily: { silver: 1, gold: 1 } }];
    expect(vipProgress(250_000, table)).toMatchObject({ level: 15, next: { level: 16 }, toNext: 50_000 });
    expect(vipProgress(300_000, table)).toMatchObject({ level: 16, next: null, ratio: 1 });
    const withoutFive = VIP_LEVELS.filter((l) => l.level !== 5);
    expect(vipProgress(6_000, withoutFive)).toMatchObject({ level: 4, next: { level: 6 } });
  });
  it('level and adjust schemas validate input', () => {
    expect(vipLevelSchema.safeParse({ level: 16, name: { vi: 'VIP 16', en: 'VIP 16' }, color: '#aabbcc', exp: 1, daily: { silver: 0, gold: 0 } }).success).toBe(true);
    expect(vipLevelSchema.safeParse({ level: 16, name: { vi: '', en: 'x' }, color: 'red', exp: -1, daily: { silver: 0, gold: 0 } }).success).toBe(false);
    expect(vipAdjustSchema.safeParse({ action: 'grant', level: 5, reason: 'ok', idempotencyKey: crypto.randomUUID() }).success).toBe(false); // reason too short
    expect(vipAdjustSchema.safeParse({ action: 'revoke', reason: 'Ended event', idempotencyKey: crypto.randomUUID() }).success).toBe(true);
  });
});

describe('gift shop contracts', () => {
  it('a send must confirm the price and stays within the quantity limit', () => {
    const base = { id: crypto.randomUUID(), uid: 100_001, giftId: 'rose' };
    expect(giftSendSchema.safeParse(base).success).toBe(false);
    expect(giftSendSchema.safeParse({ ...base, expectedPrice: 500, quantity: GIFT_RULES.maxQuantity + 1 }).success).toBe(false);
    expect(giftSendSchema.parse({ ...base, expectedPrice: 500 })).toMatchObject({ quantity: 1, anonymous: false, message: '' });
  });
  it('event/limited gifts need an end date to be on sale; end after start', () => {
    const g = { ...GIFT_PRICE_PROPOSAL.find((x) => x.id === 'crown')!, iconAsset: null, startsAt: null, endsAt: null };
    expect(giftUpsertSchema.safeParse({ ...g, onSale: true }).success).toBe(false);
    expect(giftUpsertSchema.safeParse({ ...g, onSale: false }).success).toBe(true);
    expect(giftUpsertSchema.safeParse({ ...g, onSale: true, endsAt: '2030-01-01T00:00:00Z' }).success).toBe(true);
    expect(giftUpsertSchema.safeParse({ ...g, onSale: true, startsAt: '2030-02-01T00:00:00Z', endsAt: '2030-01-01T00:00:00Z' }).success).toBe(false);
  });
  it('the suggested list is valid, unique, linear for silver (1 charm per 100) and fits the daily limits', () => {
    const ids = new Set(GIFT_PRICE_PROPOSAL.map((g) => g.id));
    expect(ids.size).toBe(GIFT_PRICE_PROPOSAL.length);
    for (const g of GIFT_PRICE_PROPOSAL) {
      expect(giftUpsertSchema.safeParse({ ...g, iconAsset: null, startsAt: null, endsAt: '2030-01-01T00:00:00Z', onSale: false }).success).toBe(true);
      if (g.currency === 'silver') {
        expect(g.charm * 100).toBe(g.price);
        expect(g.price).toBeLessThanOrEqual(GIFT_RULES.dailySilver);
      } else expect(g.price).toBeLessThanOrEqual(GIFT_RULES.dailyGold);
      expect(g.charm).toBeLessThanOrEqual(GIFT_RULES.pairDailyCharm);
    }
  });
});
