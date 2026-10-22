import { z } from 'zod';
import { ECONOMY, GAME_KEYS, type ErrorCode, type GameKey } from '../economy';
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

export const registerSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(24).optional(),
  locale: z.enum(LOCALES).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

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

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  locale: Locale;
  avatar: number;
  role: 'player' | 'admin';
  balance: number;
  createdAt: string;
  nextDailyBonusAt: string | null;
}

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
  username: string;
  displayName: string;
  avatar: number;
  balance: number;
}

export interface BigWinEvent {
  displayName: string;
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
  | { event: 'wallet'; data: { balance: number } }
  | { event: 'presence'; data: { online: number } }
  | { event: 'bigwin'; data: BigWinEvent };

export type ServerMessage =
  | { type: 'res'; id: string; ok: true; data: unknown }
  | { type: 'res'; id: string; ok: false; error: { code: ErrorCode; message?: string } }
  | ({ type: 'event' } & ServerEvent);

export const GAME_KEY_SCHEMA = z.enum(GAME_KEYS);
