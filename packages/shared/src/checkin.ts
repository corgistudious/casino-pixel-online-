import { CHECKIN_REWARDS, ECONOMY, type Reward } from './economy';

/** Calendar date (YYYY-MM-DD) of an instant in the check-in time zone. */
export function checkinDate(at: Date, timeZone: string = ECONOMY.checkinTimeZone): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First instant of the day after `at` in the check-in time zone. */
export function checkinDayEnd(at: Date, timeZone: string = ECONOMY.checkinTimeZone): Date {
  const tomorrow = addDays(checkinDate(at, timeZone), 1);
  // Find the UTC instant whose local date flips to `tomorrow` (handles any fixed offset).
  let guess = new Date(`${tomorrow}T00:00:00Z`).getTime();
  for (let i = 0; i < 3; i++) {
    const local = new Date(new Date(guess).toLocaleString('en-US', { timeZone })).getTime();
    const utc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
    guess = new Date(`${tomorrow}T00:00:00Z`).getTime() - (local - utc);
  }
  return new Date(guess);
}

export interface CheckinProgress {
  streak: number;
  claimedToday: boolean;
  nextDay: number;
}

/**
 * Where a player stands in the 7-day cycle. `lastDate` is the local date of the
 * previous claim. Claiming yesterday continues the cycle; any gap restarts it.
 */
export function checkinProgress(streak: number, lastDate: string | null, today: string): CheckinProgress {
  if (lastDate === today) return { streak, claimedToday: true, nextDay: (streak % CHECKIN_REWARDS.length) + 1 };
  const continues = lastDate !== null && addDays(lastDate, 1) === today && streak > 0;
  const current = continues ? streak % CHECKIN_REWARDS.length : 0;
  return { streak: current, claimedToday: false, nextDay: current + 1 };
}

export function checkinReward(day: number): Reward {
  return CHECKIN_REWARDS[(day - 1) % CHECKIN_REWARDS.length]!;
}
