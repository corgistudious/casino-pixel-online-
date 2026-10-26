import { z } from 'zod';
import { CURRENCIES, ECONOMY, GAME_KEYS, type ErrorCode, type GameKey, type Reward } from '../economy';
import type { BlackjackView } from '../games/blackjack';
import type { BjtTableView } from '../games/blackjackTable';
import type { ChatChannel, ChatMessageView } from '../social';
import type { RoomSummary } from '../rooms';
import type { RouletteResult } from '../games/roulette';
import type { SicBoResult } from '../games/sicbo';
import type { SlotsResult } from '../games/slots';
import type { ProgressEvent } from '../progression';
import { CARD_GAMES, type CardGame, type CardTableView } from '../games/seated';
import { tableBetSchema, type MyTableBet, type TableRoundView } from '../games/tables';

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
    displayName: z.string().trim().min(1).max(24),
    email: emailSchema.optional(),
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
  age: z.number().int().min(18).max(120).optional(),
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
    action: z.enum(['hit', 'stand', 'double', 'split', 'insurance']),
    /** Insurance stake (0 = no insurance); only for action 'insurance'. */
    amount: z.number().int().min(0).max(1_000_000_000).optional(),
  }),
  z.object({ type: z.literal('blackjack.resume'), id: requestId }),
  z.object({ type: z.literal('table.join'), id: requestId, tableId: z.string().min(1).max(40) }),
  z.object({ type: z.literal('table.leave'), id: requestId, tableId: z.string().min(1).max(40) }),
  z.object({ type: z.literal('card.join'), id: requestId, tableId: z.string().min(1).max(40) }),
  z.object({ type: z.literal('card.leave'), id: requestId, tableId: z.string().min(1).max(40) }),
  z.object({ type: z.literal('card.sit'), id: requestId, tableId: z.string().min(1).max(40), seat: z.number().int().min(0).max(9), buyIn: z.number().int().positive().max(100_000_000) }),
  z.object({ type: z.literal('card.stand'), id: requestId, tableId: z.string().min(1).max(40) }),
  z.object({ type: z.literal('card.back'), id: requestId, tableId: z.string().min(1).max(40) }),
  z.object({
    type: z.literal('card.act'),
    id: requestId,
    tableId: z.string().min(1).max(40),
    handId: z.string().uuid(),
    action: z.enum(['fold', 'check', 'call', 'bet', 'raise', 'allin']),
    amount: z.number().int().positive().max(1_000_000_000).optional(),
  }),
  z.object({ type: z.literal('card.queue'), id: requestId, game: z.enum(CARD_GAMES) }),
  z.object({ type: z.literal('card.unqueue'), id: requestId }),
  z.object({ type: z.literal('bjt.join'), id: requestId, tableId: z.string().min(1).max(40) }),
  z.object({ type: z.literal('bjt.leave'), id: requestId, tableId: z.string().min(1).max(40) }),
  z.object({ type: z.literal('bjt.sit'), id: requestId, tableId: z.string().min(1).max(40), seat: z.number().int().min(0).max(4) }),
  z.object({ type: z.literal('bjt.stand'), id: requestId, tableId: z.string().min(1).max(40) }),
  z.object({ type: z.literal('bjt.bet'), id: requestId, tableId: z.string().min(1).max(40), amount: z.number().int().positive().max(1_000_000_000) }),
  z.object({
    type: z.literal('bjt.act'),
    id: requestId,
    tableId: z.string().min(1).max(40),
    roundId: z.string().uuid(),
    action: z.enum(['hit', 'stand', 'double', 'split', 'insurance']),
    amount: z.number().int().min(0).max(1_000_000_000).optional(),
  }),
  z.object({
    type: z.literal('table.bet'),
    id: requestId,
    tableId: z.string().min(1).max(40),
    roundId: z.string().uuid(),
    bets: z.array(tableBetSchema).min(1).max(40),
  }),
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
  age: number | null;
  renameFreeAvailable: boolean;
  renameAvailableAt: string | null;
  renameCards: number;
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
  /** Equipped avatar frame id ('none' = no frame) and every frame the player owns. */
  frame: string;
  ownedFrames: string[];
  /** Equipped special avatar (catalog item id); null = the default avatar `avatar`. */
  avatarItem: string | null;
  /** Unread mail count (for the mailbox badge). */
  unreadMail: number;
  /** Account level (1–999). */
  level: number;
  /** Equipped title, chat bubble and card back (catalog item ids; expired items are never returned). */
  title: string | null;
  chatBubble: string | null;
  cardBack: string | null;
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
  avatarItem: string | null;
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
  'table.join': TableRoundView;
  'table.leave': { ok: true };
  'table.bet': { myBets: MyTableBet[]; balance: number };
  'card.join': CardTableView;
  'card.leave': { ok: true };
  'card.sit': CardTableView;
  'card.stand': { cashedOut: number | null; leaving: boolean };
  'card.back': CardTableView;
  'card.act': { ok: true };
  'card.queue': { queued: true; game: CardGame };
  'card.unqueue': { ok: true };
  'bjt.join': BjtTableView;
  'bjt.leave': { ok: true };
  'bjt.sit': BjtTableView;
  'bjt.stand': { leaving: boolean };
  'bjt.bet': { ok: true };
  'bjt.act': { ok: true };
}

export type ServerEvent =
  | { event: 'chatMessage'; data: ChatMessageView & { peerUid?: number } }
  | { event: 'chatRemoved'; data: { id: number; channel: ChatChannel } }
  /** A support reply or status change on one of my tickets. */
  | { event: 'support'; data: { ticketId: string } }
  /** Friends, gifts and guild changes; the client refetches what it shows. */
  | { event: 'social'; data: { kind: string; uid?: number; guildId?: string } }
  | { event: 'wallet'; data: { balance: number; gold?: number } }
  | { event: 'presence'; data: { online: number } }
  | { event: 'bigwin'; data: BigWinEvent }
  /** New mail arrived (or a broadcast was sent): the client refreshes its unread count. */
  | { event: 'mail'; data: { unread?: number } }
  /** EXP gained after a settled round, with any levels reached. */
  | { event: 'progress'; data: ProgressEvent }
  /** Card table update; private views (with own hole cards) go to each seated player only. */
  | { event: 'card'; data: CardTableView }
  /** Ranked matchmaking found an opponent. */
  | { event: 'cardMatch'; data: { tableId: string; game: CardGame } }
  /** Shared Blackjack table state (public: the dealer's hole card stays hidden until settlement). */
  | { event: 'bjt'; data: BjtTableView }
  /** A room's settings or host changed (sent to everyone watching its table). */
  | { event: 'room'; data: RoomSummary & { closed?: boolean } }
  /** A friend invited me to their room (access already granted, no password needed). */
  | { event: 'roomInvite'; data: { room: RoomSummary; from: { uid: number; displayName: string } } }
  /** The host removed me from a room. */
  | { event: 'roomKicked'; data: { roomId: string; tableId: string } }
  /** The player's profile changed on the server (e.g. a timed item expired): refetch /api/me. */
  | { event: 'profile'; data: { reason: 'equipment' } }
  /** Shared-round table update (phase change, result, live totals). `myBets` is omitted in broadcasts. */
  | { event: 'table'; data: Omit<TableRoundView, 'myBets'> & { myBets?: MyTableBet[] } };

export type ServerMessage =
  | { type: 'res'; id: string; ok: true; data: unknown }
  | { type: 'res'; id: string; ok: false; error: { code: ErrorCode; message?: string } }
  | ({ type: 'event' } & ServerEvent);

export const GAME_KEY_SCHEMA = z.enum(GAME_KEYS);
