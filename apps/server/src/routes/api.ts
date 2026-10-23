import { clientSeedSchema, shopItemSchema, updateProfileSchema, type CheckinResult, type FairnessInfo } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAccount, requireActive } from '../auth/session';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { getActiveSeed, rotateSeed } from '../services/fair';
import { buyFrame, equipFrame } from '../services/shop';
import { playerStats, roundHistory } from '../services/stats';
import { claimCheckin, claimRescue, leaderboard, toPublicUser, updateProfile } from '../services/users';
import { makeGuards } from './guards';

export function registerApiRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub, _config: Config): void {
  const { authed } = makeGuards(app, db);

  app.get('/api/health', async () => {
    await db.execute(sql`SELECT 1`);
    return { ok: true, online: hub.online };
  });

  app.get('/api/me', { preHandler: authed }, async (req) => ({ user: await toPublicUser(db, requireAccount(req)) }));

  app.patch('/api/me', { preHandler: authed }, async (req) => {
    const input = updateProfileSchema.parse(req.body);
    const user = await updateProfile(db, requireAccount(req).id, input);
    return { user: await toPublicUser(db, user) };
  });

  app.post('/api/me/checkin', { preHandler: authed }, async (req): Promise<CheckinResult> => {
    const { day, reward, user } = await claimCheckin(db, requireActive(requireAccount(req)).id);
    const fresh = await toPublicUser(db, user);
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: { balance: fresh.balance, gold: fresh.gold } });
    return { day, reward, user: fresh };
  });

  app.post('/api/shop/buy', { preHandler: authed }, async (req) => {
    const { itemId } = shopItemSchema.parse(req.body);
    const user = requireActive(requireAccount(req));
    await buyFrame(db, user.id, itemId);
    const fresh = await toPublicUser(db, user);
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: { balance: fresh.balance, gold: fresh.gold } });
    return { user: fresh };
  });

  app.post('/api/me/frame', { preHandler: authed }, async (req) => {
    const { itemId } = shopItemSchema.parse(req.body);
    const user = await equipFrame(db, requireAccount(req).id, itemId);
    return { user: await toPublicUser(db, user) };
  });

  app.post('/api/me/rescue', { preHandler: authed }, async (req) => {
    const user = requireActive(requireAccount(req));
    const balance = await claimRescue(db, user.id);
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: { balance } });
    return { balance };
  });

  app.get('/api/me/stats', { preHandler: authed }, async (req) => ({ stats: await playerStats(db, requireAccount(req).id) }));

  app.get('/api/me/history', { preHandler: authed }, async (req) => ({ rounds: await roundHistory(db, requireAccount(req).id) }));

  app.get('/api/me/fairness', { preHandler: authed }, async (req): Promise<FairnessInfo> => {
    const seed = await getActiveSeed(db, requireAccount(req).id);
    return { serverSeedHash: seed.serverSeedHash, clientSeed: seed.clientSeed, nonce: seed.nonce };
  });

  app.post('/api/me/fairness/rotate', { preHandler: authed }, async (req) => {
    const body = req.body ? clientSeedSchema.partial().parse(req.body) : {};
    const user = requireAccount(req);
    const result = await db.transaction(async (tx) => {
      // Rotating mid-hand would reveal the seed of a running blackjack round.
      const active = await tx.execute(sql`SELECT 1 FROM game_rounds WHERE user_id = ${user.id} AND status = 'active' LIMIT 1`);
      if (active.length > 0) throw fail('round_active');
      return rotateSeed(tx, user.id, body.clientSeed);
    });
    const next: FairnessInfo = { serverSeedHash: result.next.serverSeedHash, clientSeed: result.next.clientSeed, nonce: 0 };
    return { revealed: result.revealed, next };
  });

  app.get('/api/leaderboard', async () => ({ entries: await leaderboard(db) }));

  app.get('/api/bigwins', async () => ({ wins: await hub.recentBigWins() }));
}
