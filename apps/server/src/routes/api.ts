import { clientSeedSchema, loginSchema, registerSchema, updateProfileSchema, type FairnessInfo } from '@casino/shared';
import { sql, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { accountFromToken, bearer, requireAccount, signToken } from '../auth/session';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { getActiveSeed, rotateSeed } from '../services/fair';
import { playerStats, roundHistory } from '../services/stats';
import {
  authenticate,
  claimDailyBonus,
  claimRescue,
  leaderboard,
  registerUser,
  toPublicUser,
  updateProfile,
} from '../services/users';
import { applyDelta } from '../services/wallet';

export function registerApiRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub, config: Config): void {
  const authed = async (req: FastifyRequest) => {
    const token = bearer(req);
    if (!token) throw fail('unauthorized');
    req.account = await accountFromToken(app, db, token);
  };
  const adminOnly = async (req: FastifyRequest) => {
    await authed(req);
    if (req.account?.role !== 'admin') throw fail('unauthorized');
  };
  const authRate = { rateLimit: { max: 10, timeWindow: '1 minute' } };

  app.get('/api/health', async () => {
    await db.execute(sql`SELECT 1`);
    return { ok: true, online: hub.online };
  });

  app.post('/api/auth/register', { config: authRate }, async (req) => {
    const input = registerSchema.parse(req.body);
    const user = await registerUser(db, input, config.adminUsernames);
    return { token: signToken(app, user), user: await toPublicUser(db, user) };
  });

  app.post('/api/auth/login', { config: authRate }, async (req) => {
    const input = loginSchema.parse(req.body);
    const user = await authenticate(db, input.username, input.password, config.adminUsernames);
    return { token: signToken(app, user), user: await toPublicUser(db, user) };
  });

  /** Invalidates every token issued to this account (all devices). */
  app.post('/api/auth/logout-all', { preHandler: authed }, async (req) => {
    const user = requireAccount(req);
    await db.update(users).set({ tokenVersion: user.tokenVersion + 1 }).where(eq(users.id, user.id));
    return { ok: true };
  });

  app.get('/api/me', { preHandler: authed }, async (req) => ({ user: await toPublicUser(db, requireAccount(req)) }));

  app.patch('/api/me', { preHandler: authed }, async (req) => {
    const input = updateProfileSchema.parse(req.body);
    const user = await updateProfile(db, requireAccount(req).id, input);
    return { user: await toPublicUser(db, user) };
  });

  app.post('/api/me/daily-bonus', { preHandler: authed }, async (req) => {
    const user = requireAccount(req);
    const balance = await claimDailyBonus(db, user.id);
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: { balance } });
    const fresh = await toPublicUser(db, (await db.select().from(users).where(eq(users.id, user.id)))[0]!);
    return { user: fresh };
  });

  app.post('/api/me/rescue', { preHandler: authed }, async (req) => {
    const user = requireAccount(req);
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

  // --- Admin ---------------------------------------------------------------

  app.get('/api/admin/overview', { preHandler: adminOnly }, async () => {
    const [row] = await db.execute<{
      users: string;
      rounds24h: string;
      wagered24h: string;
      paid24h: string;
      chips: string;
    }>(sql`
      SELECT
        (SELECT count(*) FROM users) AS users,
        (SELECT count(*) FROM game_rounds WHERE created_at > now() - interval '24 hours' AND status = 'settled') AS rounds24h,
        (SELECT coalesce(sum(bet), 0) FROM game_rounds WHERE created_at > now() - interval '24 hours' AND status = 'settled') AS wagered24h,
        (SELECT coalesce(sum(payout), 0) FROM game_rounds WHERE created_at > now() - interval '24 hours' AND status = 'settled') AS paid24h,
        (SELECT coalesce(sum(balance), 0) FROM wallets) AS chips
    `);
    return {
      users: Number(row!.users),
      online: hub.online,
      rounds24h: Number(row!.rounds24h),
      wagered24h: Number(row!.wagered24h),
      paid24h: Number(row!.paid24h),
      chipsInCirculation: Number(row!.chips),
    };
  });

  const usernameParam = z.object({ username: z.string().min(1).max(20) });

  app.post('/api/admin/users/:username/ban', { preHandler: adminOnly }, async (req) => {
    const { username } = usernameParam.parse(req.params);
    const { banned } = z.object({ banned: z.boolean() }).parse(req.body);
    const [row] = await db
      .update(users)
      .set({ banned, tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.usernameLower, username.toLowerCase()))
      .returning({ id: users.id });
    if (!row) throw fail('bad_request', 'user not found');
    req.log.info({ admin: req.account?.username, username, banned }, 'admin ban change');
    return { ok: true };
  });

  app.post('/api/admin/users/:username/grant', { preHandler: adminOnly }, async (req) => {
    const { username } = usernameParam.parse(req.params);
    const { amount } = z.object({ amount: z.number().int().min(-10_000_000).max(10_000_000) }).parse(req.body);
    const [target] = await db.select().from(users).where(eq(users.usernameLower, username.toLowerCase()));
    if (!target) throw fail('bad_request', 'user not found');
    const balance = await db.transaction((tx) => applyDelta(tx, target.id, amount, 'admin_adjust'));
    hub.sendToUser(target.id, { type: 'event', event: 'wallet', data: { balance } });
    req.log.info({ admin: req.account?.username, username, amount }, 'admin balance adjust');
    return { balance };
  });
}
