import { z } from 'zod';

/** Kinds of owned things. Frames and avatars are unique per player; collectibles may be held several times. */
export const ITEM_KINDS = ['frame', 'avatar', 'collectible'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const UNIQUE_ITEM_KINDS: readonly ItemKind[] = ['frame', 'avatar'];

export const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

/** draft: only staff see it · released: obtainable and listed · hidden: no longer issued, still owned and shown. */
export const ITEM_STATUSES = ['draft', 'released', 'hidden'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ITEM_SOURCES = ['shop', 'event', 'mail', 'vip', 'achievement', 'tournament', 'admin', 'legacy'] as const;
export type ItemSource = (typeof ITEM_SOURCES)[number];

/** Where an uploaded frame image sits relative to the avatar circle (1 = same size as the avatar). */
export const frameRenderSchema = z.object({
  scale: z.number().min(1).max(1.8).default(1.25),
  offsetX: z.number().min(-0.25).max(0.25).default(0),
  offsetY: z.number().min(-0.25).max(0.25).default(0),
});
export type FrameRender = z.infer<typeof frameRenderSchema>;

/** Built-in frames drawn by the client (no image): conic gradient stops. */
export const legacyFrameStyleSchema = z.object({ colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).min(2).max(8), animated: z.boolean() });

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
}

export interface InventoryEntry {
  instanceId: string;
  itemId: string;
  kind: ItemKind;
  source: ItemSource;
  acquiredAt: string;
}

export const itemIdSchema = z.string().regex(/^[a-z0-9_]{2,40}$/);

export const equipSchema = z.object({ slot: z.enum(['frame', 'avatar']), itemId: itemIdSchema.nullable() });

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
  z.object({ type: z.literal('item'), itemId: itemIdSchema }),
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
  claimResult: { index: number; outcome: 'granted' | 'already_owned' }[] | null;
}
