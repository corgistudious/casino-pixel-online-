import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { buyRenameCard, renameInfo, renamePlayer, RENAME_CARD_PRICE_GOLD, RENAME_CARD_ID } from '../services/rename';
import { buyItemSchema, clientSeedSchema, shopItemSchema, updateProfileSchema, type CheckinResult, type FairnessInfo } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAccount, requireActive } from '../auth/session';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { publishIdentity } from '../services/identity';
import { getActiveSeed, rotateSeed } from '../services/fair';
import { buyItem, equip } from '../services/catalog';
import { playerStats, roundHistory } from '../services/stats';
import { claimCheckin, claimRescue, leaderboard, toPublicUser, updateProfile } from '../services/users';
import { makeGuards } from './guards';

export function registerApiRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub, config: Config): void {
  const { authed } = makeGuards(app, db);

  app.get('/api/health', async () => {
    await db.execute(sql`SELECT 1`);
    // dataMode lets clients label test deployments; it is verified against the database at startup.
    return { ok: true, online: hub.online, dataMode: config.KEYO_DATA_MODE };
  });

  app.get('/api/me', { preHandler: authed }, async (req) => ({ user: await toPublicUser(db, requireAccount(req)) }));

  app.patch('/api/me', { preHandler: authed }, async (req) => {
    const input = updateProfileSchema.parse(req.body);
    const user = await updateProfile(db, requireAccount(req).id, input);
    return { user: await toPublicUser(db, user) };
  });

  app.get('/api/me/rename', { preHandler: authed }, async req => ({ ...(await renameInfo(db, requireAccount(req).id)), cardPriceGold: RENAME_CARD_PRICE_GOLD, cardId: RENAME_CARD_ID }));

  app.post('/api/shop/rename-card', { preHandler: authed }, async req => {
    const user=requireActive(requireAccount(req));
    await buyRenameCard(db,user.id);
    return { user: await toPublicUser(db,user) };
  });

  app.post('/api/me/rename', { preHandler: authed }, async req => {
    const input=z.object({ displayName:z.string().trim().min(1).max(24), useCard:z.boolean().default(false) }).parse(req.body);
    await renamePlayer(db,requireAccount(req).id,input.displayName,input.useCard);
    void publishIdentity(db, hub, requireAccount(req).id);
    const [fresh]=await db.select().from(users).where(eq(users.id,requireAccount(req).id));
    return { user: await toPublicUser(db,fresh!) };
  });

  app.post('/api/me/checkin', { preHandler: authed }, async (req): Promise<CheckinResult> => {
    const { day, reward, user } = await claimCheckin(db, requireActive(requireAccount(req)).id);
    const fresh = await toPublicUser(db, user);
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: { balance: fresh.balance, gold: fresh.gold } });
    return { day, reward, user: fresh };
  });

  app.post('/api/shop/buy', { preHandler: authed }, async (req) => {
    const { itemId, expectedPrice, expectedCurrency } = buyItemSchema.parse(req.body);
    const user = requireActive(requireAccount(req));
    await buyItem(db, user.id, itemId, { price: expectedPrice, currency: expectedCurrency });
    const fresh = await toPublicUser(db, user);
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: { balance: fresh.balance, gold: fresh.gold } });
    return { user: fresh };
  });

  /** Kept for older clients; same as POST /api/me/equip with slot "frame". */
  app.post('/api/me/frame', { preHandler: authed }, async (req) => {
    const { itemId } = shopItemSchema.parse(req.body);
    const user = await equip(db, requireAccount(req).id, 'frame', itemId);
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
