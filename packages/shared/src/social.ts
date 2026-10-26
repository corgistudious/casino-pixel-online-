import { z } from 'zod';
import type { Badge } from './contracts/api';

/**
 * Social rules shared by server and client. The server is the only enforcer; the client uses the
 * same numbers to disable buttons and explain limits.
 */
export const SOCIAL_RULES = {
  maxFriends: 200,
  maxPendingRequests: 50,
  chat: { maxLength: 500, cooldownMs: 2_000, history: 100 },
  gift: {
    /** Cxu Bạc per gift. Cxu Vàng cannot be gifted (premium currency, Owner decision). */
    minSilver: 100,
    maxSilver: 100_000,
    /** Per sender, per server day (UTC). */
    dailySilver: 200_000,
    dailyCount: 20,
    /** Players must have been friends this long before gifting (blocks throwaway-account farming). */
    friendForHours: 24,
    messageMax: 140,
  },
  guild: {
    createCostGold: 300,
    nameMin: 3,
    nameMax: 24,
    descriptionMax: 200,
    defaultMaxMembers: 50,
    maxOfficers: 5,
    maxPendingInvites: 30,
  },
} as const;

export const GUILD_EMBLEMS = ['crown', 'dragon', 'phoenix', 'lion', 'sword', 'shield', 'star', 'diamond'] as const;
export const GUILD_COLORS = ['gold', 'ruby', 'emerald', 'sapphire', 'amethyst', 'onyx'] as const;
export type GuildEmblem = (typeof GUILD_EMBLEMS)[number];
export type GuildColor = (typeof GUILD_COLORS)[number];
export type GuildRole = 'owner' | 'officer' | 'member';
export type GuildJoinPolicy = 'open' | 'invite';

/** Guild tier from activity points (earned from real winnings, see migration 0019). */
export function guildTier(points: number): 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS' | 'Supreme' {
  if (points >= 100_000) return 'Supreme';
  if (points >= 50_000) return 'SSS';
  if (points >= 25_000) return 'SS';
  if (points >= 10_000) return 'S';
  if (points >= 5_000) return 'A';
  if (points >= 2_000) return 'B';
  if (points >= 500) return 'C';
  return 'D';
}

/** How another player looks in social lists and chat (avatar, frame, badges, cosmetics). */
export interface PlayerCard {
  uid: number;
  displayName: string;
  avatar: number;
  avatarItem: string | null;
  frame: string;
  title: string | null;
  bubble: string | null;
  badges: Badge[];
  level: number;
}

export interface FriendView extends PlayerCard {
  online: boolean;
  since: string;
  /** May receive gifts from me now (friends long enough). */
  giftable: boolean;
}

export interface FriendRequestView extends PlayerCard {
  createdAt: string;
}

export interface FriendsOverview {
  friends: FriendView[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
}

export type RelationStatus = 'self' | 'friend' | 'outgoing' | 'incoming' | 'none';
export interface PlayerSearchResult extends PlayerCard {
  relation: RelationStatus;
  online: boolean;
}

/** What anyone may see about another player (no balances, email or history details). */
export interface PlayerProfileView extends PlayerCard {
  online: boolean;
  relation: RelationStatus;
  createdAt: string;
  rank: { division: number; rp: number } | null;
  guild: Pick<GuildSummary, 'id' | 'name' | 'emblem' | 'color'> | null;
  stats: { rounds: number; biggestWin: number };
}

export interface GiftView {
  id: string;
  direction: 'sent' | 'received';
  other: Pick<PlayerCard, 'uid' | 'displayName'>;
  kind: 'silver' | 'item';
  amount: number;
  itemId: string | null;
  message: string;
  createdAt: string;
}

export interface GiftableItem {
  instanceId: string;
  itemId: string;
  acquiredAt: string;
}

export interface GiftsOverview {
  history: GiftView[];
  items: GiftableItem[];
  today: { silver: number; count: number };
}

export interface GuildSummary {
  id: string;
  name: string;
  description: string;
  emblem: GuildEmblem;
  color: GuildColor;
  points: number;
  tier: ReturnType<typeof guildTier>;
  members: number;
  maxMembers: number;
  joinPolicy: GuildJoinPolicy;
  owner: Pick<PlayerCard, 'uid' | 'displayName'>;
  rank: number;
}

export interface GuildMemberView extends PlayerCard {
  role: GuildRole;
  joinedAt: string;
  online: boolean;
}

export interface GuildLogEntry {
  id: number;
  action: string;
  actor: Pick<PlayerCard, 'uid' | 'displayName'> | null;
  target: Pick<PlayerCard, 'uid' | 'displayName'> | null;
  createdAt: string;
}

export interface GuildInviteView {
  guild: Pick<GuildSummary, 'id' | 'name' | 'emblem' | 'color' | 'tier' | 'members' | 'maxMembers'>;
  invitedBy: Pick<PlayerCard, 'uid' | 'displayName'>;
  createdAt: string;
}

export interface MyGuild extends GuildSummary {
  myRole: GuildRole;
  memberList: GuildMemberView[];
  log: GuildLogEntry[];
  pendingInvites: { uid: number; displayName: string; createdAt: string }[];
}

export type ChatChannel = 'server' | 'guild' | 'dm';

export interface ChatMessageView {
  id: number;
  channel: ChatChannel;
  sender: PlayerCard;
  body: string;
  createdAt: string;
}

export interface ConversationView {
  peer: PlayerCard;
  online: boolean;
  /** Still friends (only friends can send; history stays readable). */
  friend: boolean;
  lastBody: string | null;
  lastAt: string | null;
  lastFromMe: boolean;
  unread: number;
}

export const chatBodySchema = z.object({ body: z.string().trim().min(1).max(SOCIAL_RULES.chat.maxLength) });
export const uidSchema = z.object({ uid: z.coerce.number().int().min(1) });
export const giftSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().uuid(),
    kind: z.literal('silver'),
    uid: z.number().int().min(1),
    amount: z.number().int().min(SOCIAL_RULES.gift.minSilver).max(SOCIAL_RULES.gift.maxSilver),
    message: z.string().trim().max(SOCIAL_RULES.gift.messageMax).default(''),
  }),
  z.object({
    id: z.string().uuid(),
    kind: z.literal('item'),
    uid: z.number().int().min(1),
    instanceId: z.string().uuid(),
    message: z.string().trim().max(SOCIAL_RULES.gift.messageMax).default(''),
  }),
]);
export type GiftInput = z.infer<typeof giftSchema>;

const guildText = {
  description: z.string().trim().max(SOCIAL_RULES.guild.descriptionMax),
  emblem: z.enum(GUILD_EMBLEMS),
  color: z.enum(GUILD_COLORS),
  joinPolicy: z.enum(['open', 'invite']),
};
export const guildCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(SOCIAL_RULES.guild.nameMin)
    .max(SOCIAL_RULES.guild.nameMax)
    .regex(/^[\p{L}\p{N} _.-]+$/u),
  description: guildText.description.default(''),
  emblem: guildText.emblem.default('crown'),
  color: guildText.color.default('gold'),
  joinPolicy: guildText.joinPolicy.default('open'),
});
export const guildUpdateSchema = z.object({
  description: guildText.description.optional(),
  emblem: guildText.emblem.optional(),
  color: guildText.color.optional(),
  joinPolicy: guildText.joinPolicy.optional(),
});

// ---------------------------------------------------------------- support center

export const SUPPORT_CATEGORIES = ['account', 'game', 'payment', 'report', 'other'] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];
export type SupportStatus = 'open' | 'in_progress' | 'closed';
/** A player may reopen a closed ticket for this long; after that they open a new one. */
export const SUPPORT_REOPEN_DAYS = 14;

export interface SupportTicketView {
  id: string;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  /** A support reply the player has not opened yet. */
  unread: boolean;
  lastMessage: string | null;
}

export interface SupportMessageView {
  id: string;
  fromStaff: boolean;
  /** Players see "Keyo Support" for every staff reply; staff see who wrote it. */
  author: string;
  body: string;
  createdAt: string;
}

export interface StaffTicketView extends SupportTicketView {
  player: { uid: number; displayName: string };
  assignee: { uid: number; displayName: string } | null;
  /** A player message staff have not opened yet. */
  awaitingStaff: boolean;
}

export const supportCreateSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z.string().trim().min(4).max(140),
  message: z.string().trim().min(10).max(4000),
});
export const supportReplySchema = z.object({ message: z.string().trim().min(1).max(4000) });
