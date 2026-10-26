import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import type { RealtimeHub } from '../realtime/hub';
import { claimMission, missionsOverview } from '../services/missions';
import { getWallet } from '../services/wallet';
import { makeGuards } from './guards';

export function registerMissionRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { authed } = makeGuards(app, db);
  app.get('/api/missions', { preHandler: authed }, async (req) => missionsOverview(db, requireAccount(req).id));
  app.post('/api/missions/claim', { preHandler: authed, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireActive(requireAccount(req));
    const { id } = z.object({ id: z.string().min(1).max(40) }).parse(req.body);
    const result = await claimMission(db, user.id, id);
    const wallet = await getWallet(db, user.id);
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: wallet });
    return { ...result, wallet };
  });
}
