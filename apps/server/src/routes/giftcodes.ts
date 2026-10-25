import { giftcodeSchema, MAIL_MAX_ATTACHMENTS, mailAttachmentSchema } from '@casino/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import { giftcodes } from '../db/schema';
import { AppError, fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { audit } from '../services/audit';
import { createGiftcodes, giftcodeStats, listGiftcodes, myRedemptions, redeemGiftcode, redemptionsOf, setGiftcodesEnabled } from '../services/giftcodes';
import { unreadCount } from '../services/mailbox';
import { makeGuards } from './guards';

/** Wrong codes allowed per player per hour (on top of the per-IP request limit). */
const MAX_FAILURES_PER_HOUR = 20;
const failures = new Map<string, number[]>();
function tooManyFailures(userId: string): boolean {
  const since = Date.now() - 3_600_000;
  const list = (failures.get(userId) ?? []).filter((t) => t > since);
  failures.set(userId, list);
  return list.length >= MAX_FAILURES_PER_HOUR;
}

const createSchema = z
  .object({
    campaign: z.string().trim().min(2).max(60),
    attachments: z.array(mailAttachmentSchema).min(1).max(MAIL_MAX_ATTACHMENTS),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    maxUses: z.number().int().min(1).max(10_000_000).nullable().default(null),
    perUserLimit: z.number().int().min(1).max(100).default(1),
    /** Manual code, or `count` random codes (a batch). */
    code: z.string().trim().min(4).max(32).optional(),
    count: z.number().int().min(1).max(5_000).optional(),
  })
  .refine((v) => !(v.code && v.count), { message: 'code or count, not both' });

export function registerGiftcodeRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { authed, can, canReauth } = makeGuards(app, db);

  // ---------------------------------------------------------------- player
  app.post('/api/giftcode/redeem', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, preHandler: authed }, async (req) => {
    const user = requireActive(requireAccount(req));
    if (tooManyFailures(user.id)) throw new AppError('rate_limited', 429);
    const { code } = z.object({ code: giftcodeSchema }).parse(req.body);
    try {
      const res = await redeemGiftcode(db, user.id, code, req.ip);
      const unread = await unreadCount(db, user.id);
      hub.sendToUser(user.id, { type: 'event', event: 'mail', data: { unread } });
      return { ...res, unread };
    } catch (err) {
      if (err instanceof AppError && err.code.startsWith('giftcode_')) failures.get(user.id)!.push(Date.now());
      throw err;
    }
  });

  app.get('/api/giftcode/history', { preHandler: authed }, async (req) => ({ redemptions: await myRedemptions(db, requireAccount(req).id) }));

  // ---------------------------------------------------------------- admin (Owner / Super Admin)
  app.get('/api/admin/giftcodes', { preHandler: can('giftcode.manage') }, async (req) => {
    const { campaign } = z.object({ campaign: z.string().max(60).optional() }).parse(req.query);
    return { giftcodes: await listGiftcodes(db, campaign), stats: await giftcodeStats(db) };
  });

  app.post('/api/admin/giftcodes', { preHandler: canReauth('giftcode.manage') }, async (req) => {
    const input = createSchema.parse(req.body);
    const rows = await createGiftcodes(
      db,
      req.account!.id,
      {
        campaign: input.campaign,
        attachments: input.attachments,
        startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        maxUses: input.maxUses,
        perUserLimit: input.perUserLimit,
      },
      { manual: input.code, count: input.code ? undefined : (input.count ?? 1) },
      req.ip,
    );
    return { created: rows.length, codes: rows.map((r) => r.code) };
  });

  app.patch('/api/admin/giftcodes', { preHandler: canReauth('giftcode.manage') }, async (req) => {
    const { ids, enabled } = z.object({ ids: z.array(z.string().uuid()).min(1).max(5_000), enabled: z.boolean() }).parse(req.body);
    const rows = await db.transaction(async (tx) => {
      const r = await setGiftcodesEnabled(tx, ids, enabled);
      await audit(tx, { actorId: req.account!.id, action: enabled ? 'giftcode.enable' : 'giftcode.disable', targetType: 'giftcode', targetId: ids.length === 1 ? ids[0]! : `${ids.length} codes`, details: { ids }, ip: req.ip });
      return r;
    });
    return { updated: rows.length };
  });

  app.get('/api/admin/giftcodes/:id/redemptions', { preHandler: can('giftcode.manage') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [g] = await db.select().from(giftcodes).where(eq(giftcodes.id, id));
    if (!g) throw fail('not_found');
    return { giftcode: g, redemptions: await redemptionsOf(db, id) };
  });

  /** CSV of a campaign's codes (audited: exported codes are as good as the rewards). */
  app.get('/api/admin/giftcodes/export', { preHandler: canReauth('giftcode.manage') }, async (req) => {
    const { campaign } = z.object({ campaign: z.string().trim().min(1).max(60) }).parse(req.query);
    const rows = await listGiftcodes(db, campaign, 10_000);
    await audit(db, { actorId: req.account!.id, action: 'giftcode.export', targetType: 'giftcode_campaign', targetId: campaign, details: { count: rows.length }, ip: req.ip });
    const csv = ['code,campaign,uses,max_uses,per_user_limit,starts_at,ends_at,enabled', ...rows.map((r) => [r.code, `"${r.campaign.replace(/"/g, '""')}"`, r.uses, r.maxUses ?? '', r.perUserLimit, r.startsAt.toISOString(), r.endsAt?.toISOString() ?? '', r.enabled].join(','))].join('\n');
    // JSON so the admin client keeps its re-auth flow; it saves the CSV locally.
    return { filename: `giftcodes-${campaign.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.csv`, csv };
  });
}
