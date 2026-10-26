import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import { fail } from '../errors';
import { applyDelta } from '../services/wallet';
import { makeGuards } from './guards';

const ACHIEVEMENTS = [
  { id: 'first_game', rounds: 1, silver: 1000 },
  { id: 'ten_games', rounds: 10, silver: 5000 },
  { id: 'hundred_games', rounds: 100, silver: 25000 },
  { id: 'thousand_games', rounds: 1000, silver: 100000 },
] as const;

export function registerAchievementRoutes(app: FastifyInstance, db: Db): void {
  const { authed } = makeGuards(app, db);
  const getRounds = async (userId: string) => {
    const rows = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM game_rounds WHERE user_id = ${userId}::uuid AND status = 'settled'
    `);
    return Number(rows[0]?.count ?? 0);
  };
  app.get('/api/achievements', { preHandler: authed }, async (req) => {
    const user = requireAccount(req);
    const [rounds, claims] = await Promise.all([
      getRounds(user.id),
      db.execute<{ achievement_id: string }>(sql`SELECT achievement_id FROM achievement_claims WHERE user_id = ${user.id}::uuid`),
    ]);
    const claimed = new Set(claims.map(r => r.achievement_id));
    return { rounds, achievements: ACHIEVEMENTS.map(a => ({ ...a, completed: rounds >= a.rounds, claimed: claimed.has(a.id) })) };
  });
  app.post('/api/achievements/:id/claim', { preHandler: authed }, async (req) => {
    const user = requireActive(requireAccount(req));
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const achievement = ACHIEVEMENTS.find(a => a.id === id);
    if (!achievement) throw fail('not_found');
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`);
      const rounds = await tx.execute<{ count: string }>(sql`
        SELECT count(*)::text AS count FROM game_rounds WHERE user_id = ${user.id}::uuid AND status = 'settled'
      `);
      if (Number(rounds[0]?.count ?? 0) < achievement.rounds) throw fail('forbidden');
      const rows = await tx.execute(sql`
        INSERT INTO achievement_claims(user_id, achievement_id)
        VALUES (${user.id}::uuid, ${id}) ON CONFLICT DO NOTHING RETURNING achievement_id
      `);
      if (!rows.length) throw fail('already_owned');
      await applyDelta(tx, user.id, achievement.silver, 'rank_reward', null, 'silver', `achievement:${id}`);
      return { id, silver: achievement.silver };
    });
  });
}
