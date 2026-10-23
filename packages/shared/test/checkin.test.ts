import { describe, expect, it } from 'vitest';
import { CHECKIN_REWARDS, checkinDate, checkinDayEnd, checkinProgress, checkinReward } from '../src';

describe('daily check-in', () => {
  it('rolls over at midnight UTC', () => {
    expect(checkinDate(new Date('2026-10-22T23:59:00Z'))).toBe('2026-10-22');
    expect(checkinDate(new Date('2026-10-23T00:00:00Z'))).toBe('2026-10-23');
    expect(checkinDayEnd(new Date('2026-10-22T10:00:00Z')).toISOString()).toBe('2026-10-23T00:00:00.000Z');
    // Explicit zones still work for other callers.
    expect(checkinDate(new Date('2026-10-22T17:30:00Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-10-23');
  });

  it('starts new players at day 1', () => {
    expect(checkinProgress(0, null, '2026-10-23')).toEqual({ streak: 0, claimedToday: false, nextDay: 1 });
  });

  it('continues after claiming yesterday', () => {
    expect(checkinProgress(3, '2026-10-22', '2026-10-23')).toEqual({ streak: 3, claimedToday: false, nextDay: 4 });
  });

  it('marks today as claimed', () => {
    expect(checkinProgress(4, '2026-10-23', '2026-10-23')).toEqual({ streak: 4, claimedToday: true, nextDay: 5 });
  });

  it('restarts after a missed day', () => {
    expect(checkinProgress(5, '2026-10-20', '2026-10-23')).toEqual({ streak: 0, claimedToday: false, nextDay: 1 });
  });

  it('wraps after day 7, including across months', () => {
    expect(checkinProgress(7, '2026-10-31', '2026-11-01')).toEqual({ streak: 0, claimedToday: false, nextDay: 1 });
    expect(checkinProgress(6, '2026-12-31', '2027-01-01').nextDay).toBe(7);
  });

  it('pays the owner-approved silver streak and no gold', () => {
    expect(CHECKIN_REWARDS.map((r) => r.silver)).toEqual([5_000, 5_000, 6_000, 6_000, 8_000, 10_000, 20_000]);
    expect(CHECKIN_REWARDS.every((r) => r.gold === 0)).toBe(true);
    expect(checkinReward(7).silver).toBe(20_000);
  });
});
