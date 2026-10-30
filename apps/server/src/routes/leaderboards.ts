import { LB_BOARDS, LB_GAMES, LB_PERIODS } from '@casino/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount } from '../auth/session';
import type { Db } from '../db/client';
import { boardView, periodBounds } from '../services/leaderboards';
import { makeGuards } from './guards';

const boardQuery = z.object({
  period: z.enum(LB_PERIODS).optional(),
  game: z.enum(LB_GAMES).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export function registerLeaderboardRoutes(app: FastifyInstance, db: Db): void {
  const { authed } = makeGuards(app, db);

  /** Every board with the periods it can show right now (season only while a season runs). */
  app.get('/api/leaderboards', { preHandler: authed }, async () => {
    const season = await periodBounds(db, 'season');
    return {
      boards: LB_BOARDS.map((b) => ({ id: b.id, group: b.group, metric: b.metric, game: b.game ?? null, subject: b.subject, reward: b.reward ?? null, active: b.active, periods: b.periods.filter((p) => p !== 'season' || !!season) })),
    };
  });

  app.get('/api/leaderboards/:board', { preHandler: authed, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const { board } = z.object({ board: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/) }).parse(req.params);
    const q = boardQuery.parse(req.query);
    return boardView(db, requireAccount(req).id, { board, ...q });
  });
}
