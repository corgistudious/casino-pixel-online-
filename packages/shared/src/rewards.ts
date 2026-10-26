import { z } from 'zod';
import { mailAttachmentSchema, MAIL_MAX_ATTACHMENTS, type MailAttachment } from './cosmetics';

// ---------------------------------------------------------------- official season rewards

/** A season lasts 2 months; when it ends the next one opens automatically. */
export const SEASON_LENGTH_MONTHS = 2;

/**
 * Reward brackets by final standing. Top 1–50 are the Top-title holders (full Chiến Thần I, see
 * TOP_TITLES); every other eligible player (at least one valid ranked match) is in "rest".
 */
export const SEASON_BRACKETS = [
  { id: 'top1', from: 1, to: 1 },
  { id: 'top2', from: 2, to: 2 },
  { id: 'top3', from: 3, to: 3 },
  { id: 'top4_10', from: 4, to: 10 },
  { id: 'top11_50', from: 11, to: 50 },
  { id: 'rest', from: 51, to: null },
] as const;
export type SeasonBracket = (typeof SEASON_BRACKETS)[number]['id'];

export function bracketFor(topPosition: number | null): SeasonBracket {
  if (!topPosition) return 'rest';
  return SEASON_BRACKETS.find((b) => topPosition >= b.from && (b.to === null || topPosition <= b.to))!.id;
}

/** The exclusive 60-day Vương Giả set (catalog item ids). */
export const VUONG_GIA_ITEMS = ['vuong_gia_card_back', 'vuong_gia_frame', 'vuong_gia_bubble', 'vuong_gia_avatar'] as const;
export const VUONG_GIA_DAYS = 60;

const vuongGiaSet: MailAttachment[] = VUONG_GIA_ITEMS.map((itemId) => ({ type: 'item', itemId, durationDays: VUONG_GIA_DAYS }));

/** Official end-of-season rewards (Owner-approved). The 60 days run from the next season's start. */
export const OFFICIAL_SEASON_REWARDS: Record<SeasonBracket, MailAttachment[]> = {
  top1: [{ type: 'silver', amount: 3_000_000 }, { type: 'gold', amount: 3_000 }, ...vuongGiaSet],
  top2: [{ type: 'silver', amount: 2_000_000 }, { type: 'gold', amount: 2_000 }, ...vuongGiaSet],
  top3: [{ type: 'silver', amount: 1_000_000 }, { type: 'gold', amount: 1_000 }, ...vuongGiaSet],
  top4_10: [{ type: 'silver', amount: 500_000 }, { type: 'gold', amount: 500 }],
  top11_50: [{ type: 'silver', amount: 300_000 }],
  rest: [{ type: 'silver', amount: 200_000 }],
};

export const seasonRewardsSchema = z.object({
  brackets: z.partialRecord(z.enum(SEASON_BRACKETS.map((b) => b.id) as [SeasonBracket, ...SeasonBracket[]]), z.array(mailAttachmentSchema).max(MAIL_MAX_ATTACHMENTS)),
});
export type SeasonRewards = z.infer<typeof seasonRewardsSchema>;

/** Total Cxu a bundle pays. */
export function bundleCurrency(list: readonly MailAttachment[]): { silver: number; gold: number } {
  let silver = 0;
  let gold = 0;
  for (const a of list) {
    if (a.type === 'silver') silver += a.amount;
    if (a.type === 'gold') gold += a.amount;
  }
  return { silver, gold };
}

/** Turns `durationDays` into an absolute `expiresAt` counted from `from`. */
export function resolveDurations(list: readonly MailAttachment[], from: Date): MailAttachment[] {
  return list.map((a) => {
    if (a.type !== 'item' || !a.durationDays) return a;
    const { durationDays, ...rest } = a;
    return { ...rest, expiresAt: new Date(from.getTime() + durationDays * 86_400_000).toISOString() };
  });
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

// ---------------------------------------------------------------- ranked participation rewards

/**
 * Cxu Bạc for playing valid ranked matches. Off (0) until the Owner sets amounts in the admin
 * panel. Caps stop farming: rewarded matches per player per day, and matches against the same
 * opponent per day. Matches with a flag (AFK, shared registration IP) pay nothing.
 */
export const participationSchema = z.object({
  playSilver: z.number().int().min(0).max(100_000),
  winSilver: z.number().int().min(0).max(100_000),
  dailyMatchCap: z.number().int().min(0).max(500),
  samePairDailyCap: z.number().int().min(0).max(50),
});
export type ParticipationRules = z.infer<typeof participationSchema>;
export const DEFAULT_PARTICIPATION: ParticipationRules = { playSilver: 0, winSilver: 0, dailyMatchCap: 20, samePairDailyCap: 3 };

// ---------------------------------------------------------------- giftcodes

/** Codes are case-insensitive: stored upper-case, spaces and dashes ignored. */
export const normalizeGiftcode = (code: string) => code.toUpperCase().replace(/[\s-]/g, '');
export const giftcodeSchema = z.string().trim().min(4).max(32).transform(normalizeGiftcode).pipe(z.string().regex(/^[A-Z0-9]{4,24}$/));

export interface GiftcodeRedemption {
  code: string;
  campaign: string;
  attachments: MailAttachment[];
  mailId: string | null;
  createdAt: string;
}
