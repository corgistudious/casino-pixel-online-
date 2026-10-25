import { VIP_LEVELS, vipProgress } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import { fail } from '../errors';
import { applyDelta, getWallet } from '../services/wallet';
import { makeGuards } from './guards';

export function registerVipRoutes(app: FastifyInstance, db: Db): void {
  const { authed } = makeGuards(app, db);
  app.get('/api/vip', { preHandler: authed }, async (req) => {
    const user = requireAccount(req);
    const rows = await db.execute<{ exp: string; last_claim_date: string | null }>(sql`
      SELECT exp, last_claim_date FROM vip_progress WHERE user_id = ${user.id}::uuid
    `);
    const exp = Number(rows[0]?.exp ?? 0);
    return { ...vipProgress(exp), exp, lastClaimDate: rows[0]?.last_claim_date ?? null };
  });
  app.post('/api/vip/daily', { preHandler: authed }, async (req) => {
    const user = requireActive(requireAccount(req));
    return db.transaction(async (tx) => {
      // Lock the user row first to serialize claims even if progress is not yet created.
      await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`);
      await tx.execute(sql`INSERT INTO vip_progress(user_id) VALUES (${user.id}::uuid) ON CONFLICT DO NOTHING`);
      const rows = await tx.execute<{ exp: string; last_claim_date: string | null }>(sql`
        SELECT exp, last_claim_date FROM vip_progress WHERE user_id = ${user.id}::uuid FOR UPDATE
      `);
      const today = new Date().toISOString().slice(0, 10);
      if (rows[0]?.last_claim_date === today) throw fail('checkin_done');
      const level = vipProgress(Number(rows[0]?.exp ?? 0)).level;
      const reward = VIP_LEVELS[level - 1]!.daily;
      await tx.execute(sql`UPDATE vip_progress SET last_claim_date = ${today}::date, updated_at = now() WHERE user_id = ${user.id}::uuid`);
      if (reward.silver) await applyDelta(tx, user.id, reward.silver, 'daily_bonus', null, 'silver', `vip:${today}`);
      if (reward.gold) await applyDelta(tx, user.id, reward.gold, 'daily_bonus', null, 'gold', `vip:${today}`);
      return { level, reward, wallet: await getWallet(tx, user.id) };
    });
  });
}
