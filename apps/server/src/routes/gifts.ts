import { AVATAR_RULES, charmAdjustSchema, GIFT_CATEGORIES, giftReverseSchema, giftSendSchema, giftUpsertSchema, uidSchema } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { rejectAvatar, removeAvatar, uploadAvatar } from '../services/avatars';
import {
  adjustCharm,
  charmBoard,
  giftShop,
  giftShowcase,
  importGiftProposal,
  myGiftHistory,
  publishCounts,
  reverseGift,
  saveGift,
  sendCharmGift,
  staffCharm,
  staffGifts,
  staffGiftTransactions,
} from '../services/gifts';
import { publishIdentity } from '../services/identity';
import { visiblePlayer } from '../services/social';
import { assertStaffTarget } from '../services/vip';
import { getWallet } from '../services/wallet';
import { makeGuards } from './guards';

const uidParam = z.object({ uid: z.coerce.number().int().min(1) });

/** Profile photos, the Gift Shop, Charm Points and their staff tools. Rules live in the services. */
export function registerGiftRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { authed, can, canReauth } = makeGuards(app, db);
  const me = (req: Parameters<typeof requireAccount>[0]) => requireActive(requireAccount(req));
  const limited = (max: number) => ({ preHandler: authed, config: { rateLimit: { max, timeWindow: '1 minute' } } });

  // ---------------------------------------------------------------- profile photo
  // Body: the cropped 512×512 image itself (image/jpeg, image/png or image/webp). Everything is re-checked from the bytes.
  app.post('/api/me/avatar', { ...limited(10), bodyLimit: AVATAR_RULES.maxUploadBytes + 1024 }, async (req) => {
    const user = me(req);
    if (!Buffer.isBuffer(req.body)) throw fail('invalid_asset');
    const result = await uploadAvatar(db, user.id, req.body);
    void publishIdentity(db, hub, user.id);
    return result;
  });
  app.delete('/api/me/avatar', limited(10), async (req) => {
    const user = me(req);
    const removed = await removeAvatar(db, user.id);
    if (removed) void publishIdentity(db, hub, user.id);
    return { removed };
  });
  app.post('/api/admin/users/:uid/avatar/reject', { preHandler: can('avatars.moderate') }, async (req) => {
    const { uid } = uidParam.parse(req.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const target = await assertStaffTarget(db, req.account!.id, uid);
    const removed = await rejectAvatar(db, req.account!.id, { id: target.id, uid }, reason, req.ip);
    if (removed) {
      void publishIdentity(db, hub, target.id);
      hub.sendToUser(target.id, { type: 'event', event: 'social', data: { kind: 'avatar_rejected' } });
    }
    return { removed };
  });

  // ---------------------------------------------------------------- gift shop
  app.get('/api/gifts/shop', { preHandler: authed }, async (req) => giftShop(db, requireAccount(req).id));
  app.post('/api/gifts/send', limited(20), async (req) => {
    const user = me(req);
    const r = await sendCharmGift(db, user, giftSendSchema.parse(req.body));
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: r.senderWallet });
    if (!r.replayed && r.receiverId) {
      // After commit and best effort: a lost notification never touches the stored gift. The
      // receiver's history and counters are refetched on their next load or reconnect.
      hub.sendToUser(r.receiverId, {
        type: 'event',
        event: 'social',
        data: { kind: 'gift_received', ...(r.tx.anonymous ? {} : { uid: user.uid }) },
      });
      void publishCounts(db, hub, r.receiverId);
    }
    return { gift: r.tx, replayed: r.replayed, wallet: r.senderWallet };
  });
  app.get('/api/gifts/history', { preHandler: authed }, async (req) => {
    const q = z.object({ direction: z.enum(['sent', 'received']).default('received'), before: z.string().datetime().optional() }).parse(req.query);
    return { gifts: await myGiftHistory(db, requireAccount(req).id, q.direction, q.before) };
  });
  app.get('/api/players/:uid/gifts', limited(60), async (req) => {
    const { uid } = uidSchema.parse(req.params);
    const q = z.object({ sort: z.enum(['recent', 'value']).default('recent'), category: z.enum(GIFT_CATEGORIES).optional() }).parse(req.query);
    const p = await visiblePlayer(db, uid);
    const viewer = requireAccount(req).id;
    if (p.user_id !== viewer) {
      const [s] = await db.execute<{ show_gifts: boolean }>(sql`SELECT show_gifts FROM profile_settings WHERE user_id = ${p.user_id}::uuid`);
      if (s && !s.show_gifts) return { gifts: null };
    }
    return { gifts: await giftShowcase(db, p.user_id, q.sort, q.category) };
  });
  app.get('/api/charm/leaderboard', { preHandler: authed }, async () => ({ entries: await charmBoard(db) }));

  // ---------------------------------------------------------------- staff: gifts
  app.get('/api/admin/gifts', { preHandler: can('gifts.read') }, async () => ({ gifts: await staffGifts(db) }));
  app.put('/api/admin/gifts/:id', { preHandler: can('gifts.manage') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const input = giftUpsertSchema.parse(req.body);
    if (input.id !== id) throw fail('bad_request');
    return { gifts: await saveGift(db, req.account!.id, input, req.ip) };
  });
  app.post('/api/admin/gifts/import-proposal', { preHandler: can('gifts.manage') }, async (req) => importGiftProposal(db, req.account!.id, req.ip));
  app.get('/api/admin/gifts/transactions', { preHandler: can('gifts.read') }, async (req) => {
    const q = z
      .object({ uid: z.coerce.number().int().min(1).optional(), giftId: z.string().max(40).optional(), abnormal: z.enum(['1', 'true']).optional(), before: z.string().datetime().optional() })
      .parse(req.query);
    return { transactions: await staffGiftTransactions(db, { uid: q.uid, giftId: q.giftId, abnormal: !!q.abnormal, before: q.before }) };
  });
  app.post('/api/admin/gifts/transactions/:id/reverse', { preHandler: canReauth('gifts.manage') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await reverseGift(db, req.account!.id, id, giftReverseSchema.parse(req.body), req.ip);
    if (!r.replayed) {
      if (r.refunded) hub.sendToUser(r.senderId, { type: 'event', event: 'wallet', data: await getWallet(db, r.senderId) });
      void publishCounts(db, hub, r.receiverId);
    }
    return { ok: true, replayed: r.replayed, receiverCharm: r.receiverCharm };
  });

  // ---------------------------------------------------------------- staff: charm
  app.get('/api/admin/charm/:uid', { preHandler: can('charm.read') }, async (req) => staffCharm(db, uidParam.parse(req.params).uid));
  app.post('/api/admin/charm/:uid', { preHandler: canReauth('charm.manage') }, async (req) => {
    const { uid } = uidParam.parse(req.params);
    const r = await adjustCharm(db, req.account!.id, uid, charmAdjustSchema.parse(req.body), req.ip);
    if (!r.replayed) void publishCounts(db, hub, r.userId);
    return { charm: r.charm, replayed: r.replayed };
  });
}
