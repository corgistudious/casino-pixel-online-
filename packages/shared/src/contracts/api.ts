import { z } from 'zod';
import { CURRENCIES, ECONOMY, GAME_KEYS, type ErrorCode, type GameKey, type Reward } from '../economy';
import type { BlackjackView } from '../games/blackjack';
import type { RouletteResult } from '../games/roulette';
import type { SicBoResult } from '../games/sicbo';
import type { SlotsResult } from '../games/slots';

export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[a-zA-Z0-9_]+$/);

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/** At least 8 characters with a letter and a digit. */
export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Za-z]/)
  .regex(/[0-9]/);

export const registerSchema = z
  .object({
    username: usernameSchema,
    displayName: z.string().trim().min(1).max(24),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true),
    locale: z.enum(LOCALES).optional(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'password_mismatch' });
export type RegisterInput = z.infer<typeof registerSchema>;

/** Log in with username or email. */
export const loginSchema = z.object({
  login: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.union([
  z.object({ token: z.string().min(16).max(128) }),
  z.object({ code: z.string().regex(/^\d{6}$/) }),
]);

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(16).max(128).optional(),
    email: emailSchema.optional(),
    code: z.string().regex(/^\d{6}$/).optional(),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.token || (v.email && v.code), { message: 'invalid_token' })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'password_mismatch' });

/** Legacy accounts without an email can link one (it must then be verified). */
export const linkEmailSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

export const deletionRequestSchema = z.object({
  password: z.string().min(1).max(128),
  reason: z.string().trim().max(500).optional(),
  confirm: z.literal(true),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(24).optional(),
  locale: z.enum(LOCALES).optional(),
  avatar: z.number().int().min(0).max(15).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const clientSeedSchema = z.object({
  clientSeed: z.string().trim().min(1).max(64),
});

export const betAmountSchema = z.number().int().min(ECONOMY.minBet).max(ECONOMY.maxBet);

const rouletteBetSchema = z.object({
  kind: z.enum(['straight', 'red', 'black', 'odd', 'even', 'low', 'high', 'dozen', 'column']),
  value: z.number().int().min(0).max(36).optional(),
  amount: z.number().int().positive(),
});

const sicBoBetSchema = z.object({
  kind: z.enum(['small', 'big', 'odd', 'even', 'total', 'single', 'anyTriple']),
  value: z.number().int().min(1).max(17).optional(),
  amount: z.number().int().positive(),
});

const requestId = z.string().min(8).max(64);

/** Messages a client may send over the WebSocket. `id` doubles as idempotency key. */
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), id: requestId, token: z.string().min(1).max(2048) }),
  z.object({ type: z.literal('ping'), id: requestId }),
  z.object({ type: z.literal('slots.spin'), id: requestId, bet: betAmountSchema }),
  z.object({ type: z.literal('roulette.spin'), id: requestId, bets: z.array(rouletteBetSchema).min(1).max(40) }),
  z.object({ type: z.literal('sicbo.roll'), id: requestId, bets: z.array(sicBoBetSchema).min(1).max(40) }),
  z.object({ type: z.literal('blackjack.start'), id: requestId, bet: betAmountSchema }),
  z.object({
    type: z.literal('blackjack.action'),
    id: requestId,
    roundId: z.string().uuid(),
    action: z.enum(['hit', 'stand', 'double']),
  }),
  z.object({ type: z.literal('blackjack.resume'), id: requestId }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage['type'];

export const BADGES = ['verified', 'partner'] as const;
export type Badge = (typeof BADGES)[number];

export interface CheckinState {
  /** Days completed in the current cycle (0-7). */
  streak: number;
  claimedToday: boolean;
  /** Cycle day (1-7) the next claim will grant. */
  nextDay: number;
  /** When the current check-in day ends (ISO). */
  dayEndsAt: string;
}

export type AccountStatus = 'pending_verification' | 'pending_activation' | 'active' | 'restricted' | 'deleted';

export interface PublicUser {
  id: string;
  /** Public UID shown to players. */
  uid: number;
  username: string;
  /** Own account only: the linked email and whether it is verified. */
  email: string | null;
  emailVerified: boolean;
  status: AccountStatus;
  accountType: 'player' | 'system_support';
  /** Effective permissions (empty for regular players). */
  permissions: string[];
  displayName: string;
  locale: Locale;
  avatar: number;
  /** 'admin' when the account can open the admin panel (derived from permissions on the server). */
  role: 'player' | 'admin';
  /** Staff roles held (owner, super_admin, admin, moderator, support), highest first. */
  roles: string[];
  badges: Badge[];
  /** Cxu Bạc — betting currency. */
  balance: number;
  /** Cxu Vàng — rare currency. */
  gold: number;
  /** Equipped avatar frame id and every frame the player owns. */
  frame: string;
  ownedFrames: string[];
  createdAt: string;
  checkin: CheckinState;
}

export interface CheckinResult {
  day: number;
  reward: Reward;
  user: PublicUser;
}

export const shopItemSchema = z.object({ itemId: z.string().min(1).max(32) });

export const adminBadgesSchema = z.object({
  verified: z.boolean().optional(),
  partner: z.boolean().optional(),
});

/** A fresh UUID per intended admin action; retries with the same key are applied only once. */
export const idempotencyKeySchema = z.string().uuid();

export const adminGrantSchema = z.object({
  amount: z
    .number()
    .int()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((n) => n !== 0, 'amount must not be 0'),
  currency: z.enum(CURRENCIES).default('silver'),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: idempotencyKeySchema,
});

export interface FairnessInfo {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface RevealedSeed {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  finalNonce: number;
}

export interface RoundSummary {
  id: string;
  game: GameKey;
  bet: number;
  payout: number;
  createdAt: string;
  nonce: number | null;
}

export interface PlayerStats {
  rounds: number;
  wagered: number;
  won: number;
  biggestWin: number;
  byGame: Record<GameKey, { rounds: number; wagered: number; won: number }>;
}

export interface LeaderboardEntry {
  rank: number;
  uid: number;
  username: string;
  displayName: string;
  avatar: number;
  frame: string;
  badges: Badge[];
  balance: number;
}

export interface BigWinEvent {
  displayName: string;
  badges: Badge[];
  game: GameKey;
  bet: number;
  payout: number;
  at: string;
}

export interface RoundEnvelope<T> {
  roundId: string;
  balance: number;
  nonce: number;
  result: T;
}

/** Response payloads keyed by client message type. */
export interface ResponseMap {
  auth: { user: PublicUser };
  ping: { now: number };
  'slots.spin': RoundEnvelope<SlotsResult>;
  'roulette.spin': RoundEnvelope<RouletteResult>;
  'sicbo.roll': RoundEnvelope<SicBoResult>;
  'blackjack.start': RoundEnvelope<BlackjackView>;
  'blackjack.action': RoundEnvelope<BlackjackView>;
  'blackjack.resume': RoundEnvelope<BlackjackView> | null;
}

export type ServerEvent =
  | { event: 'wallet'; data: { balance: number; gold?: number } }
  | { event: 'presence'; data: { online: number } }
  | { event: 'bigwin'; data: BigWinEvent };

export type ServerMessage =
  | { type: 'res'; id: string; ok: true; data: unknown }
  | { type: 'res'; id: string; ok: false; error: { code: ErrorCode; message?: string } }
  | ({ type: 'event' } & ServerEvent);

export const GAME_KEY_SCHEMA = z.enum(GAME_KEYS);
