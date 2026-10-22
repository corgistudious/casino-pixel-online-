/** Virtual-chip economy rules. Chips have no cash value and can never be withdrawn. */
export const ECONOMY = {
  startingBalance: 10_000,
  dailyBonus: 2_000,
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
  'bonus_not_ready',
  'rescue_not_available',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
