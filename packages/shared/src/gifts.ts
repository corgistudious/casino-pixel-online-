import { z } from 'zod';
import type { LocalizedText } from './vip';

/**
 * Gift Shop and Charm Points (Điểm Hấp Dẫn). A gift is bought and delivered in one step: the sender
 * pays (mostly Cxu Bạc, some gifts Cxu Vàng), the receiver gains Charm Points, nothing else. Gifts
 * never become items, cannot be resold, traded or passed on, and there is no exchange rate between
 * currencies. The server is the only enforcer; the client uses these numbers to explain limits.
 */
export const GIFT_CATEGORIES = ['common', 'friendship', 'romantic', 'premium', 'event', 'limited'] as const;
export type GiftCategory = (typeof GIFT_CATEGORIES)[number];
export const GIFT_RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type GiftRarity = (typeof GIFT_RARITIES)[number];
export type GiftCurrency = 'silver' | 'gold';

export const GIFT_RULES = {
  /** Anti-farming: a new or unverified account cannot send charm gifts. */
  minAccountHours: 72,
  requireVerifiedEmail: true,
  /** Per sender, per server day (UTC). */
  dailySilver: 1_000_000,
  dailyGold: 1_000,
  dailyCount: 50,
  /** Charm one sender may give one receiver per day (stops two accounts pumping each other). */
  pairDailyCharm: 10_000,
  maxQuantity: 99,
  messageMax: 140,
} as const;

/** A gift as players see it. `available` = on sale now (inside its sale window). */
export interface GiftItemView {
  id: string;
  category: GiftCategory;
  name: LocalizedText;
  description: LocalizedText;
  icon: string;
  iconUrl: string | null;
  rarity: GiftRarity;
  price: number;
  currency: GiftCurrency;
  charm: number;
  dailyLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  available: boolean;
}

export interface StaffGiftView extends GiftItemView {
  onSale: boolean;
  sort: number;
  sent: number;
  updatedAt: string;
}

export interface GiftShopView {
  gifts: GiftItemView[];
  /** What I have sent today, against GIFT_RULES. */
  today: { silver: number; gold: number; count: number };
  /** Why I cannot send at all right now (account too new, email not verified), or null. */
  blocked: 'account_too_new' | 'email_not_verified' | null;
}

export const giftSendSchema = z.object({
  /** Client idempotency key: retries with the same key never charge twice. */
  id: z.string().uuid(),
  uid: z.number().int().min(1),
  giftId: z.string().regex(/^[a-z0-9_]{2,40}$/),
  quantity: z.number().int().min(1).max(GIFT_RULES.maxQuantity).default(1),
  anonymous: z.boolean().default(false),
  message: z.string().trim().max(GIFT_RULES.messageMax).default(''),
  /** The price the client showed; a different server price is refused (no surprise charges). */
  expectedPrice: z.number().int().min(1),
});
export type GiftSendInput = z.infer<typeof giftSendSchema>;

/** A gift in a history list. `other` is null when an anonymous sender is hidden from me. */
export interface GiftTxView {
  id: string;
  direction: 'sent' | 'received';
  other: { uid: number; displayName: string } | null;
  gift: Pick<GiftItemView, 'id' | 'name' | 'icon' | 'iconUrl' | 'rarity' | 'category'>;
  quantity: number;
  charm: number;
  /** Only shown to the sender. */
  price: { total: number; currency: GiftCurrency } | null;
  anonymous: boolean;
  message: string;
  status: 'completed' | 'reversed';
  createdAt: string;
}

/** A player's public gift showcase (hidden when they turn off "show gifts"). */
export interface GiftShowcaseView {
  charm: number;
  receivedCount: number;
  /** Received gifts grouped by gift, most first. */
  byGift: { gift: GiftTxView['gift']; count: number; charm: number }[];
  recent: GiftTxView[];
}

export interface CharmBoardEntry {
  position: number;
  uid: number;
  displayName: string;
  charm: number;
}

export interface CharmEventView {
  id: number;
  delta: number;
  totalAfter: number;
  reason: 'gift' | 'gift_reversal' | 'admin_adjust';
  giftTxId: string | null;
  note: string | null;
  actor: { uid: number; displayName: string } | null;
  createdAt: string;
}

const text = (max: number, min = 0) => z.string().trim().min(min).max(max);
export const giftUpsertSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]{2,40}$/),
    category: z.enum(GIFT_CATEGORIES),
    name: z.object({ vi: text(40, 1), en: text(40, 1) }),
    description: z.object({ vi: text(300), en: text(300) }).default({ vi: '', en: '' }),
    icon: text(40, 1),
    iconAsset: z.string().max(80).nullable().default(null),
    rarity: z.enum(GIFT_RARITIES),
    price: z.number().int().min(1).max(100_000_000),
    currency: z.enum(['silver', 'gold']),
    charm: z.number().int().min(1).max(10_000_000),
    onSale: z.boolean(),
    dailyLimit: z.number().int().min(1).max(1000).nullable().default(null),
    startsAt: z.string().datetime({ offset: true }).nullable().default(null),
    endsAt: z.string().datetime({ offset: true }).nullable().default(null),
    sort: z.number().int().min(-1000).max(1000).default(0),
  })
  .refine((g) => !g.startsAt || !g.endsAt || new Date(g.endsAt) > new Date(g.startsAt), { message: 'endsAt must be after startsAt', path: ['endsAt'] })
  .refine((g) => g.category !== 'event' && g.category !== 'limited' ? true : !!g.endsAt || !g.onSale, { message: 'event and limited gifts need an end date before going on sale', path: ['endsAt'] });
export type GiftUpsertInput = z.infer<typeof giftUpsertSchema>;

export const giftReverseSchema = z.object({
  reason: text(500, 3),
  /** Give the sender back what they paid (fraud by the receiver) or not (fraud by the sender). */
  refund: z.boolean(),
  idempotencyKey: z.string().uuid(),
});

export const charmAdjustSchema = z.object({
  delta: z
    .number()
    .int()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((n) => n !== 0, 'delta must not be 0'),
  reason: text(500, 3),
  idempotencyKey: z.string().uuid(),
});

/** A gift transaction in the staff view: always shows the real sender, anonymous or not. */
export interface StaffGiftTxView {
  id: string;
  sender: { uid: number; displayName: string };
  receiver: { uid: number; displayName: string };
  gift: GiftTxView['gift'];
  quantity: number;
  unitPrice: number;
  total: number;
  currency: GiftCurrency;
  charm: number;
  anonymous: boolean;
  message: string;
  status: 'completed' | 'reversed';
  createdAt: string;
  reversedAt: string | null;
  reverseReason: string | null;
  refunded: boolean;
}

/**
 * Suggested starting catalogue — NOT approved and NOT on sale. Staff can load it as drafts from the
 * admin panel and must review prices before switching any gift on. Charm is 1 per 100 Cxu Bạc for
 * every silver gift (no "best value" gift to farm with); Cxu Vàng gifts are few and premium.
 * Reference income (from the code): a free player earns about 37,000 Cxu Bạc/day (30,000 daily
 * login + VIP 1 daily 5,000 + daily missions ~2,600), VIP 15 about 113,000/day; frames cost
 * 5,000–60,000. So: common gifts are a few hundred to 2,000 (pocket change), friendship/romantic a
 * day's income or less, premium several days to a month (a deliberate sink for rich accounts).
 */
export const GIFT_PRICE_PROPOSAL: readonly Omit<GiftUpsertInput, 'onSale' | 'iconAsset' | 'startsAt' | 'endsAt'>[] = [
  { id: 'rose', category: 'common', name: { vi: 'Hoa hồng', en: 'Rose' }, description: { vi: 'Một bông hồng nhỏ.', en: 'A little rose.' }, icon: '🌹', rarity: 'common', price: 500, currency: 'silver', charm: 5, dailyLimit: null, sort: 10 },
  { id: 'candy', category: 'common', name: { vi: 'Kẹo ngọt', en: 'Candy' }, description: { vi: 'Ngọt ngào mỗi ngày.', en: 'Something sweet.' }, icon: '🍬', rarity: 'common', price: 1_000, currency: 'silver', charm: 10, dailyLimit: null, sort: 20 },
  { id: 'coffee', category: 'common', name: { vi: 'Ly cà phê', en: 'Coffee' }, description: { vi: 'Mời bạn một ly cà phê.', en: 'A coffee on me.' }, icon: '☕', rarity: 'common', price: 2_000, currency: 'silver', charm: 20, dailyLimit: null, sort: 30 },
  { id: 'clover', category: 'friendship', name: { vi: 'Cỏ bốn lá', en: 'Four-leaf clover' }, description: { vi: 'Chúc bạn may mắn.', en: 'Good luck!' }, icon: '🍀', rarity: 'rare', price: 5_000, currency: 'silver', charm: 50, dailyLimit: null, sort: 40 },
  { id: 'teddy', category: 'friendship', name: { vi: 'Gấu bông', en: 'Teddy bear' }, description: { vi: 'Ôm một cái thật chặt.', en: 'A big hug.' }, icon: '🧸', rarity: 'rare', price: 10_000, currency: 'silver', charm: 100, dailyLimit: null, sort: 50 },
  { id: 'chocolate', category: 'romantic', name: { vi: 'Hộp socola', en: 'Chocolates' }, description: { vi: 'Ngọt như lời chúc.', en: 'Sweet as can be.' }, icon: '🍫', rarity: 'rare', price: 8_000, currency: 'silver', charm: 80, dailyLimit: null, sort: 60 },
  { id: 'bouquet', category: 'romantic', name: { vi: 'Bó hoa', en: 'Bouquet' }, description: { vi: 'Một bó hoa rực rỡ.', en: 'A bright bouquet.' }, icon: '💐', rarity: 'epic', price: 20_000, currency: 'silver', charm: 200, dailyLimit: null, sort: 70 },
  { id: 'silver_ring', category: 'romantic', name: { vi: 'Nhẫn bạc', en: 'Silver ring' }, description: { vi: 'Lời hứa lấp lánh.', en: 'A shining promise.' }, icon: '💍', rarity: 'epic', price: 50_000, currency: 'silver', charm: 500, dailyLimit: 5, sort: 80 },
  { id: 'gold_watch', category: 'premium', name: { vi: 'Đồng hồ vàng', en: 'Gold watch' }, description: { vi: 'Đẳng cấp từng giây.', en: 'Class, every second.' }, icon: '⌚', rarity: 'legendary', price: 100_000, currency: 'silver', charm: 1_000, dailyLimit: 5, sort: 90 },
  { id: 'sports_car', category: 'premium', name: { vi: 'Siêu xe', en: 'Sports car' }, description: { vi: 'Tốc độ và phong cách.', en: 'Speed and style.' }, icon: '🏎️', rarity: 'legendary', price: 300_000, currency: 'silver', charm: 3_000, dailyLimit: 3, sort: 100 },
  { id: 'yacht', category: 'premium', name: { vi: 'Du thuyền', en: 'Yacht' }, description: { vi: 'Món quà của giới thượng lưu.', en: 'For the very top.' }, icon: '🛥️', rarity: 'mythic', price: 1_000_000, currency: 'silver', charm: 10_000, dailyLimit: 1, sort: 110 },
  { id: 'fireworks', category: 'event', name: { vi: 'Pháo hoa', en: 'Fireworks' }, description: { vi: 'Quà sự kiện.', en: 'Event gift.' }, icon: '🎆', rarity: 'epic', price: 15_000, currency: 'silver', charm: 150, dailyLimit: null, sort: 120 },
  { id: 'crown', category: 'limited', name: { vi: 'Vương miện', en: 'Crown' }, description: { vi: 'Quà giới hạn, trả bằng Cxu Vàng.', en: 'Limited, paid in Cxu Vàng.' }, icon: '👑', rarity: 'legendary', price: 100, currency: 'gold', charm: 1_500, dailyLimit: 3, sort: 130 },
  { id: 'diamond', category: 'limited', name: { vi: 'Kim cương', en: 'Diamond' }, description: { vi: 'Quà giới hạn, trả bằng Cxu Vàng.', en: 'Limited, paid in Cxu Vàng.' }, icon: '💎', rarity: 'mythic', price: 300, currency: 'gold', charm: 5_000, dailyLimit: 1, sort: 140 },
];
