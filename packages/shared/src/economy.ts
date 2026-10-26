/**
 * Virtual economy (Keyo Game policy). No currency can be bought with real money,
 * cashed out, traded for crypto or exchanged for real-world rewards.
 * - Cxu Bạc (silver): everyday currency for gameplay and the Frame Marketplace.
 * - Cxu Vàng (gold): extremely rare, mainly from special events. Silver never converts to gold.
 */
export const CURRENCIES = ['silver', 'gold'] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Reward {
  silver: number;
  gold: number;
}

/** 7-day streak (UTC days). Missing a day restarts at day 1; after day 7 the cycle repeats. */
export const CHECKIN_REWARDS: readonly Reward[] = [
  { silver: 5_000, gold: 0 },
  { silver: 5_000, gold: 0 },
  { silver: 6_000, gold: 0 },
  { silver: 6_000, gold: 0 },
  { silver: 8_000, gold: 0 },
  { silver: 10_000, gold: 0 },
  { silver: 20_000, gold: 0 },
];

export const ECONOMY = {
  /** Starter reward, granted once when the account's email is verified. */
  welcome: { silver: 50_000, gold: 0 } satisfies Reward,
  /** Streak days roll over at midnight UTC. */
  checkinTimeZone: 'UTC',
  /** Low-balance relief: once per 12 h, only if available + held silver is below the threshold. */
  rescueAmount: 2_000,
  rescueThreshold: 1_000,
  rescueCooldownMs: 12 * 60 * 60 * 1000,
  minBet: 10,
  maxBet: 100_000,
  /** A win is broadcast to everyone if payout >= bet * multiplier and >= minPayout. */
  bigWin: { multiplier: 10, minPayout: 5_000 },
} as const;

export const GAME_KEYS = ['slots', 'roulette', 'sicbo', 'blackjack', 'taixiu', 'poker', 'lieng', 'xito'] as const;
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
  'forbidden',
  'not_found',
  'email_taken',
  'email_not_verified',
  'invalid_token',
  'too_many_attempts',
  'too_soon',
  'password_mismatch',
  'uid_taken',
  'uid_reserved',
  'system_account',
  'deletion_pending',
  'protected_account',
  'reauth_required',
  'idempotency_conflict',
  'last_super_admin',
  'mail_claimed',
  'mail_expired',
  'invalid_asset',
  'not_tradable',
  'table_not_found',
  'betting_closed',
  'table_unavailable',
  'season_inactive',
  'season_active',
  'giftcode_invalid',
  'giftcode_expired',
  'giftcode_used_up',
  'giftcode_already_redeemed',
  'item_expired',
  'seat_taken',
  'already_seated',
  'not_seated',
  'buyin_range',
  'hand_not_found',
  'illegal_action',
  'queue_unavailable',
  'item_not_found',
  'already_owned',
  'not_owned',
  'insufficient_gold',
  'rescue_not_available',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
