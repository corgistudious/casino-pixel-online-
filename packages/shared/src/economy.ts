/**
 * Virtual economy. Two currencies, neither has cash value or can ever be bought or withdrawn:
 * - Cxu Bạc (silver): the betting currency of every game.
 * - Cxu Vàng (gold): rare, earned only from the welcome pack, daily check-in and events.
 */
export const CURRENCIES = ['silver', 'gold'] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Reward {
  silver: number;
  gold: number;
}

/** 7-day check-in cycle. Missing a day restarts at day 1; after day 7 the cycle repeats. */
export const CHECKIN_REWARDS: readonly Reward[] = [
  { silver: 1_000, gold: 0 },
  { silver: 1_500, gold: 0 },
  { silver: 2_000, gold: 0 },
  { silver: 2_500, gold: 1 },
  { silver: 3_000, gold: 0 },
  { silver: 4_000, gold: 0 },
  { silver: 5_000, gold: 5 },
];

export const ECONOMY = {
  /** Welcome pack granted once at registration. */
  welcome: { silver: 10_000, gold: 10 } satisfies Reward,
  /** Check-in days roll over at midnight in this time zone. */
  checkinTimeZone: 'Asia/Ho_Chi_Minh',
  /** Free top-up when a player is (almost) broke. */
  rescueAmount: 1_000,
  rescueThreshold: 100,
  rescueCooldownMs: 60 * 60 * 1000,
  minBet: 10,
  maxBet: 100_000,
  /** A win is broadcast to everyone if payout >= bet * multiplier and >= minPayout. */
  bigWin: { multiplier: 10, minPayout: 5_000 },
} as const;

export const GAME_KEYS = ['slots', 'roulette', 'sicbo', 'blackjack'] as const;
export type GameKey = (typeof GAME_KEYS)[number];

export const ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'banned',
  'rate_limited',
  'internal',
  'username_taken',
  'invalid_credentials',
  'insufficient_funds',
  'invalid_bet',
  'bet_too_low',
  'bet_too_high',
  'round_not_found',
  'round_active',
  'round_finished',
  'checkin_done',
  'item_not_found',
  'already_owned',
  'not_owned',
  'insufficient_gold',
  'rescue_not_available',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
