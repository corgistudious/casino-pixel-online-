import type { Badge } from './contracts/api';
import type { RankBadge } from './social';

/**
 * How a player is shown everywhere (tables, chat, lists, profile): the round avatar (uploaded photo
 * or equipped avatar) inside the equipped frame, the VIP badge on the avatar's bottom corner, the
 * rank next to the name and the badges after it.
 */

/** Profile photo uploads. The client crops to a square and re-encodes; the server re-checks all of it. */
export const AVATAR_RULES = {
  /** Largest file a player may pick (before the in-browser crop and re-encode). */
  maxPickBytes: 5 * 1024 * 1024,
  /** Largest upload the server accepts. */
  maxUploadBytes: 5 * 1024 * 1024,
  /** Uploads are normalised to exactly this many pixels per side. */
  side: 512,
  mime: ['image/jpeg', 'image/png', 'image/webp'] as const,
  /** Per player. */
  perHour: 5,
  perDay: 20,
} as const;

export type PresenceStatus = 'online' | 'offline' | 'in_game';

/** Public identity fields carried by every player card. */
export interface IdentityFields {
  /** Uploaded profile photo URL, or null to show the equipped avatar. */
  customAvatar: string | null;
  /** Effective VIP level (1 = base). */
  vipLevel: number;
}

/**
 * The public part of a player shown at game tables, rosters and spectator lists. Never balances,
 * email or anything private.
 */
export interface PublicIdentity extends IdentityFields {
  uid: number;
  displayName: string;
  avatar: number;
  avatarItem: string | null;
  frame: string;
  badges: Badge[];
  rank?: RankBadge | null;
}
