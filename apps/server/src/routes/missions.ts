import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import type { RealtimeHub } from '../realtime/hub';
import { publishIdentity } from '../services/identity';
import { missionConfigSchema, MISSION_LIMITS, MISSIONS } from '@casino/shared';
import { fail } from '../errors';
import { userRoleIds } from '../services/rbac';
import { claimMission, missionConfig, missionsOverview, saveMissionConfig } from '../services/missions';
import { getWallet } from '../services/wallet';
import { makeGuards } from './guards';

export function registerMissionRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { authed, can, canReauth } = makeGuards(app, db);
  app.get('/api/missions', { preHandler: authed }, async (req) => missionsOverview(db, requireAccount(req).id));
  app.post('/api/missions/claim', { preHandler: authed, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireActive(requireAccount(req));
    const { id } = z.object({ id: z.string().min(1).max(40) }).parse(req.body);
    const result = await claimMission(db, user.id, id);
    if (result.reward.vipExp) void publishIdentity(db, hub, user.id);
    const wallet = await getWallet(db, user.id);
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: wallet });
    return { ...result, wallet };
  });

  // ---------------------------------------------------------------- Owner configuration
  app.get('/api/admin/missions/config', { preHandler: can('progression.read') }, async () => ({
    defaults: MISSIONS,
    limits: MISSION_LIMITS,
    config: await missionConfig(db),
  }));
  /** Only the Owner (UID 1002, built-in owner role) may change mission rewards. */
  app.put('/api/admin/missions/config', { preHandler: canReauth('system.settings') }, async (req) => {
    const actor = requireAccount(req);
    if (!(await userRoleIds(db, actor.id)).includes('owner')) throw fail('forbidden');
    const config = missionConfigSchema.parse(req.body);
    await saveMissionConfig(db, actor.id, config, req.ip);
    return { config };
  });
}
