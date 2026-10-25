import { normalizeGiftcode, type GiftcodeRedemption, type MailAttachment } from '@casino/shared';
import { randomInt } from 'node:crypto';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '../db/client';
import { giftcodeRedemptions, giftcodes, users } from '../db/schema';
import { fail } from '../errors';
import { audit } from './audit';
import { itemsExist } from './catalog';
import { deliverReward } from './rewards';

/** No 0/O, 1/I/L: codes are typed by hand. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomCode(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export interface GiftcodeInput {
  campaign: string;
  attachments: MailAttachment[];
  startsAt: Date;
  endsAt: Date | null;
  maxUses: number | null;
  perUserLimit: number;
}

/**
 * Creates one code (manual or random) or a batch of random codes sharing the same settings,
 * in one transaction, audited. Manual codes must be unique (case-insensitive).
 */
export async function createGiftcodes(db: Db, actorId: string, input: GiftcodeInput, codes: { manual?: string; count?: number }, ip?: string) {
  const itemIds = [...new Set(input.attachments.flatMap((a) => (a.type === 'item' ? [a.itemId] : [])))];
  const known = await itemsExist(db, itemIds);
  const missing = itemIds.filter((id) => !known.has(id));
  if (missing.length) throw fail('item_not_found', missing.join(', '));
  const list = codes.manual ? [normalizeGiftcode(codes.manual)] : Array.from({ length: codes.count ?? 1 }, () => randomCode());
  return db.transaction(async (tx) => {
    if (codes.manual) {
      const [taken] = await tx.select({ id: giftcodes.id }).from(giftcodes).where(eq(giftcodes.code, list[0]!));
      if (taken) throw fail('bad_request', 'code already exists');
    }
    const rows = await tx
      .insert(giftcodes)
      .values(list.map((code) => ({ code, campaign: input.campaign, attachments: input.attachments, startsAt: input.startsAt, endsAt: input.endsAt, maxUses: input.maxUses, perUserLimit: input.perUserLimit, createdBy: actorId })))
      .onConflictDoNothing()
      .returning();
    await audit(tx, { actorId, action: 'giftcode.create', targetType: 'giftcode_campaign', targetId: input.campaign, details: { count: rows.length, manual: !!codes.manual, attachments: input.attachments, maxUses: input.maxUses, perUserLimit: input.perUserLimit, endsAt: input.endsAt }, ip });
    return rows;
  });
}

/**
 * Redeems a code. Everything happens in one transaction with the code row locked: validity and
 * dates, the total limit, the per-player limit (unique (code, player, n) row) and the reward mail
 * (keyed `giftcode:<id>:<n>`). Concurrent redemptions cannot exceed the limits or pay twice; the
 * reward is claimed from the mailbox through the ledger.
 */
export async function redeemGiftcode(db: Db, userId: string, rawCode: string, ip?: string): Promise<{ mailId: string; campaign: string }> {
  const code = normalizeGiftcode(rawCode);
  return db.transaction(async (tx) => {
    const [g] = await tx.select().from(giftcodes).where(eq(giftcodes.code, code)).for('update');
    const now = Date.now();
    if (!g || !g.enabled || g.startsAt.getTime() > now) throw fail('giftcode_invalid');
    if (g.endsAt && g.endsAt.getTime() <= now) throw fail('giftcode_expired');
    if (g.maxUses !== null && g.uses >= g.maxUses) throw fail('giftcode_used_up');
    const mine = (await tx.select({ n: count() }).from(giftcodeRedemptions).where(and(eq(giftcodeRedemptions.giftcodeId, g.id), eq(giftcodeRedemptions.userId, userId))))[0]!.n;
    if (mine >= g.perUserLimit) throw fail('giftcode_already_redeemed');
    const seq = mine + 1;
    const mailId = await deliverReward(tx, {
      userId,
      key: `giftcode:${g.id}:${seq}`,
      kind: 'event',
      text: {
        vi: { subject: `Quà Giftcode: ${g.campaign}`, body: `Bạn đã đổi mã ${g.code} thành công. Nhận phần thưởng đính kèm bên dưới.` },
        en: { subject: `Gift code reward: ${g.campaign}`, body: `You redeemed code ${g.code}. Claim the attached reward below.` },
      },
      attachments: g.attachments as MailAttachment[],
    });
    if (!mailId) throw fail('giftcode_already_redeemed');
    await tx.insert(giftcodeRedemptions).values({ giftcodeId: g.id, userId, seq, mailId, ip });
    await tx.update(giftcodes).set({ uses: g.uses + 1 }).where(eq(giftcodes.id, g.id));
    return { mailId, campaign: g.campaign };
  });
}

export async function myRedemptions(db: DbOrTx, userId: string): Promise<GiftcodeRedemption[]> {
  const rows = await db
    .select({ code: giftcodes.code, campaign: giftcodes.campaign, attachments: giftcodes.attachments, mailId: giftcodeRedemptions.mailId, createdAt: giftcodeRedemptions.createdAt })
    .from(giftcodeRedemptions)
    .innerJoin(giftcodes, eq(giftcodes.id, giftcodeRedemptions.giftcodeId))
    .where(eq(giftcodeRedemptions.userId, userId))
    .orderBy(desc(giftcodeRedemptions.createdAt))
    .limit(100);
  return rows.map((r) => ({ ...r, attachments: r.attachments as MailAttachment[], createdAt: r.createdAt.toISOString() }));
}

/** Staff list with usage stats (newest first). */
export async function listGiftcodes(db: DbOrTx, campaign?: string, limit = 200) {
  return db
    .select()
    .from(giftcodes)
    .where(campaign ? eq(giftcodes.campaign, campaign) : undefined)
    .orderBy(desc(giftcodes.createdAt))
    .limit(limit);
}

export async function giftcodeStats(db: DbOrTx) {
  const [r] = (await db.execute(sql`
    SELECT count(*)::int AS codes, count(*) FILTER (WHERE enabled AND (ends_at IS NULL OR ends_at > now()))::int AS active,
      coalesce(sum(uses), 0)::int AS uses FROM giftcodes`)) as unknown as { codes: number; active: number; uses: number }[];
  return r!;
}

export async function redemptionsOf(db: DbOrTx, giftcodeId: string) {
  return db
    .select({ uid: users.uid, displayName: users.displayName, seq: giftcodeRedemptions.seq, ip: giftcodeRedemptions.ip, createdAt: giftcodeRedemptions.createdAt })
    .from(giftcodeRedemptions)
    .innerJoin(users, eq(users.id, giftcodeRedemptions.userId))
    .where(eq(giftcodeRedemptions.giftcodeId, giftcodeId))
    .orderBy(desc(giftcodeRedemptions.createdAt))
    .limit(500);
}

export async function setGiftcodesEnabled(tx: Tx, ids: string[], enabled: boolean) {
  return tx.update(giftcodes).set({ enabled }).where(inArray(giftcodes.id, ids)).returning({ id: giftcodes.id });
}
