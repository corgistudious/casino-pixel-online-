import { vipAdjustSchema, vipLevelSchema } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { publishIdentity } from '../services/identity';
import { adjustVip, deleteVipLevel, saveVipLevel, staffVipView, vipLevels, vipStatus } from '../services/vip';
import { applyDelta, getWallet } from '../services/wallet';
import { makeGuards } from './guards';

const levelParam = z.object({ level: z.coerce.number().int().min(1).max(999) });
const uidParam = z.object({ uid: z.coerce.number().int().min(1) });

export function registerVipRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { authed, can, canReauth } = makeGuards(app, db);

  /** The level table everyone sees (active levels only). */
  app.get('/api/vip/levels', async () => ({ levels: await vipLevels(db) }));

  app.get('/api/vip', { preHandler: authed }, async (req) => vipStatus(db, requireAccount(req).id));

  /** Daily VIP reward of the player's effective level, once per day (Asia/Ho_Chi_Minh). */
  app.post('/api/vip/daily', { preHandler: authed }, async (req) => {
    const user = requireActive(requireAccount(req));
    const result = await db.transaction(async (tx) => {
      // Lock the user row first to serialize claims even if progress is not yet created.
      await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`);
      await tx.execute(sql`INSERT INTO vip_progress(user_id) VALUES (${user.id}::uuid) ON CONFLICT DO NOTHING`);
      const rows = await tx.execute<{ last_claim_date: string | null }>(sql`SELECT last_claim_date FROM vip_progress WHERE user_id = ${user.id}::uuid FOR UPDATE`);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      if (rows[0]?.last_claim_date && String(rows[0].last_claim_date).slice(0, 10) === today) throw fail('checkin_done');
      const status = await vipStatus(tx, user.id);
      const reward = status.current.daily;
      await tx.execute(sql`UPDATE vip_progress SET last_claim_date = ${today}::date, updated_at = now() WHERE user_id = ${user.id}::uuid`);
      if (reward.silver) await applyDelta(tx, user.id, reward.silver, 'daily_bonus', null, 'silver', `vip:${today}`);
      if (reward.gold) await applyDelta(tx, user.id, reward.gold, 'daily_bonus', null, 'gold', `vip:${today}`);
      return { level: status.level, reward, wallet: await getWallet(tx, user.id) };
    });
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: result.wallet });
    return result;
  });

  // ---------------------------------------------------------------- staff: level table
  app.get('/api/admin/vip/levels', { preHandler: can('vip.read') }, async () => ({ levels: await vipLevels(db, false) }));
  app.put('/api/admin/vip/levels/:level', { preHandler: canReauth('vip.levels') }, async (req) => {
    const { level } = levelParam.parse(req.params);
    const input = vipLevelSchema.parse(req.body);
    if (input.level !== level) throw fail('bad_request');
    return { levels: await saveVipLevel(db, req.account!.id, input, req.ip) };
  });
  app.delete('/api/admin/vip/levels/:level', { preHandler: canReauth('vip.levels') }, async (req) => ({
    levels: await deleteVipLevel(db, req.account!.id, levelParam.parse(req.params).level, req.ip),
  }));

  // ---------------------------------------------------------------- staff: one player
  app.get('/api/admin/vip/players/:uid', { preHandler: can('vip.read') }, async (req) => staffVipView(db, uidParam.parse(req.params).uid));
  app.post('/api/admin/vip/players/:uid', { preHandler: canReauth('vip.manage') }, async (req) => {
    const { uid } = uidParam.parse(req.params);
    const r = await adjustVip(db, req.account!.id, uid, vipAdjustSchema.parse(req.body), req.ip);
    if (!r.replayed) void publishIdentity(db, hub, r.userId);
    return { status: r.status, replayed: r.replayed };
  });
}
