import { describe, expect, it } from 'vitest';
import { CHECKIN_REWARDS, checkinDate, checkinDayEnd, checkinProgress, checkinReward } from '../src';

describe('daily check-in', () => {
  it('uses the Vietnam calendar day', () => {
    // 2026-10-22 17:30 UTC is already 00:30 on the 23rd in Ho Chi Minh City (UTC+7).
    expect(checkinDate(new Date('2026-10-22T17:30:00Z'))).toBe('2026-10-23');
    expect(checkinDate(new Date('2026-10-22T16:59:00Z'))).toBe('2026-10-22');
    expect(checkinDayEnd(new Date('2026-10-22T10:00:00Z')).toISOString()).toBe('2026-10-22T17:00:00.000Z');
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

  it('day 7 gives the biggest reward including gold', () => {
    expect(CHECKIN_REWARDS).toHaveLength(7);
    expect(checkinReward(7).gold).toBeGreaterThan(0);
    expect(checkinReward(7).silver).toBe(Math.max(...CHECKIN_REWARDS.map((r) => r.silver)));
  });
});
