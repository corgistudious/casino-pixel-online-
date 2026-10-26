import { z } from 'zod';
import { DEFAULT_CARD_CONFIG, type CardGame, type CardTableConfig } from './games/seated';
import type { PlayerCard } from './social';

/**
 * Player-created rooms for Poker, Xì Tố, Liêng and Blackjack. A room is an ordinary table of the
 * existing engines (same rules, wallet and settlement) with an owner, a visibility and an optional
 * password. Official tables are untouched.
 */
export const ROOM_GAMES = ['poker', 'xito', 'lieng', 'blackjack'] as const;
export type RoomGame = (typeof ROOM_GAMES)[number];
export type RoomEngine = 'card' | 'bj';
export const engineOf = (game: RoomGame): RoomEngine => (game === 'blackjack' ? 'bj' : 'card');

/** Stake presets: the big blind for card games, the minimum bet for Blackjack. */
export const ROOM_STAKES: Record<RoomGame, readonly number[]> = {
  poker: [100, 500, 1_000, 5_000],
  xito: [100, 500, 1_000, 5_000],
  lieng: [100, 500, 1_000, 5_000],
  blackjack: [100, 1_000, 5_000, 10_000],
};
export const ROOM_MAX_SEATS: Record<RoomGame, number> = { poker: 6, xito: 5, lieng: 6, blackjack: 5 };

export const ROOM_RULES = {
  nameMin: 3,
  nameMax: 24,
  passwordMin: 4,
  passwordMax: 32,
  /** Wrong passwords per room and player before a cool-down, and across all rooms. */
  maxAttempts: 5,
  maxAttemptsAllRooms: 20,
  attemptWindowMinutes: 15,
  /** A removed player cannot come back for this long. */
  kickMinutes: 30,
  /** An empty room closes after this long. */
  idleCloseMinutes: 10,
  /** The host must be seated; away longer than this while others play, the room passes on. */
  ownerAwaySeconds: 60,
} as const;

/** Card table settings for a stake: the official defaults scaled to the chosen big blind. */
export function roomCardConfig(game: CardGame, bigBlind: number, seats: number): CardTableConfig {
  const base = DEFAULT_CARD_CONFIG[game];
  const k = bigBlind / base.bigBlind;
  return { ...base, smallBlind: base.smallBlind * k, bigBlind, ante: base.ante * k, minBuyIn: base.minBuyIn * k, maxBuyIn: base.maxBuyIn * k, seats };
}
/** Blackjack limits for a stake. */
export const roomBlackjackLimits = (minBet: number) => ({ minBet, maxBet: minBet * 100 });

const name = z.string().trim().min(ROOM_RULES.nameMin).max(ROOM_RULES.nameMax);
const password = z.string().min(ROOM_RULES.passwordMin).max(ROOM_RULES.passwordMax);

export const roomCreateSchema = z
  .object({
    game: z.enum(ROOM_GAMES),
    name,
    visibility: z.enum(['public', 'private']),
    password: password.optional(),
    stake: z.number().int().positive(),
    seats: z.number().int().min(2).max(6).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.visibility === 'private' && !v.password) ctx.addIssue({ code: 'custom', path: ['password'], message: 'password required' });
    if (!ROOM_STAKES[v.game].includes(v.stake)) ctx.addIssue({ code: 'custom', path: ['stake'], message: 'not an allowed stake' });
    if (v.seats && v.seats > ROOM_MAX_SEATS[v.game]) ctx.addIssue({ code: 'custom', path: ['seats'], message: 'too many seats' });
  });
export type RoomCreateInput = z.infer<typeof roomCreateSchema>;

export const roomUpdateSchema = z.object({
  name: name.optional(),
  visibility: z.enum(['public', 'private']).optional(),
  password: password.optional(),
  stake: z.number().int().positive().optional(),
  seats: z.number().int().min(2).max(6).optional(),
});
export type RoomUpdateInput = z.infer<typeof roomUpdateSchema>;

export const roomJoinSchema = z.object({ password: z.string().max(ROOM_RULES.passwordMax).optional() });
export const roomIdSchema = z.object({ id: z.string().regex(/^(card|bj):r-[0-9a-f]{8}$/) });

export interface RoomSummary {
  /** "card:r-1a2b3c4d" / "bj:r-1a2b3c4d". */
  id: string;
  engine: RoomEngine;
  /** Table id for the game page (/cards/:tableId, /bjt/:tableId). */
  tableId: string;
  game: RoomGame;
  name: string;
  owner: Pick<PlayerCard, 'uid' | 'displayName'>;
  visibility: 'public' | 'private';
  /** A password is needed to join (private room). The password itself is never sent. */
  locked: boolean;
  seated: number;
  seats: number;
  /** Big blind (card games) or minimum bet (Blackjack). */
  stake: number;
  /** Buy-in range (card games) or bet range (Blackjack). */
  range: [number, number];
  status: 'waiting' | 'playing';
  createdAt: string;
}

export interface RoomView extends RoomSummary {
  isOwner: boolean;
  /** The viewer may watch and sit (owner, public room, invited or password entered). */
  access: boolean;
}

export type RoomFilter = 'all' | 'public' | 'private' | 'available';
