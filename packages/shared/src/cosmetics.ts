import { z } from 'zod';

/**
 * Kinds of owned things. Everything equippable is unique per player (one row, which also keeps the
 * ownership history); collectibles may be held several times.
 */
export const ITEM_KINDS = ['frame', 'avatar', 'title', 'chat_bubble', 'card_back', 'table_skin', 'victory_effect', 'collectible'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const EQUIP_SLOTS = ['frame', 'avatar', 'title', 'chat_bubble', 'card_back', 'table_skin', 'victory_effect'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];
export const UNIQUE_ITEM_KINDS: readonly ItemKind[] = EQUIP_SLOTS;

export const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

/** draft: only staff see it · released: obtainable and listed · hidden: no longer issued, still owned and shown. */
export const ITEM_STATUSES = ['draft', 'released', 'hidden'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ITEM_SOURCES = ['shop', 'event', 'mail', 'vip', 'achievement', 'tournament', 'admin', 'legacy', 'season', 'giftcode', 'leaderboard', 'role'] as const;
export type ItemSource = (typeof ITEM_SOURCES)[number];
/** Sources staff may pick for catalog items: 'role' frames are reserved (granted by real roles, never owned), 'leaderboard' by ranking rewards. */
export const STAFF_ITEM_SOURCES = ['shop', 'event', 'mail', 'vip', 'achievement', 'tournament', 'admin', 'legacy', 'season', 'giftcode', 'leaderboard'] as const satisfies readonly ItemSource[];

/** Where an uploaded frame image sits relative to the avatar circle (1 = same size as the avatar). */
export const frameRenderSchema = z.object({
  scale: z.number().min(1).max(1.8).default(1.25),
  offsetX: z.number().min(-0.25).max(0.25).default(0),
  offsetY: z.number().min(-0.25).max(0.25).default(0),
});
export type FrameRender = z.infer<typeof frameRenderSchema>;

/**
 * Look of items drawn by the client (no uploaded image): colour stops, animation, and optionally a
 * built-in artwork key (e.g. the Vương Giả set). Used by frames, titles, chat bubbles and card backs.
 */
export const legacyFrameStyleSchema = z.object({
  colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).min(2).max(8),
  animated: z.boolean(),
  art: z.string().regex(/^[a-z0-9_]{2,30}$/).optional(),
});
export const itemStyleSchema = legacyFrameStyleSchema;
export type ItemStyle = z.infer<typeof itemStyleSchema>;

export interface CatalogItem {
  id: string;
  kind: ItemKind;
  name: { vi: string; en: string };
  description: { vi: string; en: string } | null;
  rarity: Rarity;
  source: ItemSource;
  tradable: boolean;
  status: ItemStatus;
  /** URL of the uploaded image (frames/avatars/collectibles), or null for built-in drawn frames. */
  assetUrl: string | null;
  animated: boolean;
  render: FrameRender | null;
  style: z.infer<typeof legacyFrameStyleSchema> | null;
  /** Shop price in Cxu Bạc; null = not sold in the shop. */
  priceSilver: number | null;
  /** Shop price in Cxu Vàng instead (at most one of the two is set). */
  priceGold: number | null;
}

export interface InventoryEntry {
  instanceId: string;
  itemId: string;
  kind: ItemKind;
  source: ItemSource;
  acquiredAt: string;
  /** Timed items (e.g. season rewards): usable until this instant; null = permanent. */
  expiresAt: string | null;
  /** False once a timed item has expired (kept for the ownership history, cannot be equipped). */
  active: boolean;
}

export const itemIdSchema = z.string().regex(/^[a-z0-9_]{2,40}$/);

export const equipSchema = z.object({ slot: z.enum(EQUIP_SLOTS), itemId: itemIdSchema.nullable() });
/** Buy one item; `expectedPrice`/`expectedCurrency` guard against a price change while the page was open (the server always charges its own price). */
export const buyItemSchema = z.object({ itemId: itemIdSchema, expectedPrice: z.number().int().min(0).optional(), expectedCurrency: z.enum(['silver', 'gold']).optional() });
export const equipSetSchema = z.object({ collectionId: z.string().regex(/^[a-z0-9_]{2,40}$/), replaceRoleFrame: z.boolean().optional() });

export const ASSET_MIME = ['image/png', 'image/webp', 'image/gif'] as const;
export const ASSET_MAX_BYTES = 1_048_576;
export const ASSET_MIN_SIDE = 64;
export const ASSET_MAX_SIDE = 1024;

// ---------------------------------------------------------------- mailbox

export const MAIL_KINDS = ['system', 'reward', 'event', 'compensation', 'admin'] as const;
export type MailKind = (typeof MAIL_KINDS)[number];

export const mailAttachmentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('silver'), amount: z.number().int().min(1).max(10_000_000) }),
  z.object({ type: z.literal('gold'), amount: z.number().int().min(1).max(100_000) }),
  z.object({
    type: z.literal('item'),
    itemId: itemIdSchema,
    /** Timed item: usable until this instant, whenever the mail is claimed (a late claim never extends it). */
    expiresAt: z.string().datetime().optional(),
    /**
     * Template only (level rewards, season rewards, giftcodes): turned into `expiresAt` when the reward
     * is delivered — from the delivery time, or from the next season's start for season rewards.
     */
    durationDays: z.number().int().min(1).max(3650).optional(),
  }),
]);
export type MailAttachment = z.infer<typeof mailAttachmentSchema>;

export const MAIL_MAX_ATTACHMENTS = 10;
export const MAIL_MAX_UIDS = 500;

export type MailState = 'unread' | 'read' | 'claimable' | 'claimed' | 'expired';

export interface MailMessage {
  id: string;
  kind: MailKind;
  subject: string;
  body: string;
  attachments: MailAttachment[];
  createdAt: string;
  expiresAt: string | null;
  readAt: string | null;
  claimedAt: string | null;
  /** Per attachment after claiming: granted, or skipped because a unique item was already owned. */
  claimResult: { index: number; outcome: 'granted' | 'already_owned' | 'extended' | 'expired' }[] | null;
}
