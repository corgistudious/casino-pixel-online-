import { giftSchema, guildCreateSchema, guildUpdateSchema, privacySchema, REPORT_STATUSES, reportSchema, reportUpdateSchema, uidSchema } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import type { RealtimeHub } from '../realtime/hub';
import {
  createGuild,
  disbandGuild,
  dropInvite,
  inviteToGuild,
  joinGuild,
  kickMember,
  leaveGuild,
  listGuilds,
  myGuild,
  myInvites,
  setMemberRole,
  transferGuild,
  updateGuild,
} from '../services/guilds';
import {
  acceptFriendRequest,
  dropFriendRequest,
  friendsOverview,
  giftsOverview,
  removeFriend,
  searchPlayers,
  sendFriendRequest,
  sendGift,
} from '../services/social';
import { block, blockedList, follow, followList, like, playerProfile, unblock, unfollow, unlike, updatePrivacy } from '../services/profile';
import { createReport, myReports, staffReports, updateReport } from '../services/reports';
import { getWallet } from '../services/wallet';
import { makeGuards } from './guards';

const uidBody = z.object({ uid: z.number().int().min(1) });
const password = z.string().min(1).max(128);
const sqlUserByUid = (uid: number) => sql`SELECT id FROM users WHERE uid = ${uid}`;

/** Friends, gifts and guilds. Every rule is enforced in the services; routes only parse and route. */
export function registerSocialRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { authed, can } = makeGuards(app, db);
  const me = (req: Parameters<typeof requireAccount>[0]) => requireActive(requireAccount(req));
  const limited = (max: number) => ({ preHandler: authed, config: { rateLimit: { max, timeWindow: '1 minute' } } });

  // ---------------------------------------------------------------- friends
  app.get('/api/friends', { preHandler: authed }, async (req) => friendsOverview(db, hub, requireAccount(req).id));
  app.get('/api/friends/search', limited(30), async (req) => {
    const { q } = z.object({ q: z.string().trim().max(32).default('') }).parse(req.query);
    return { players: await searchPlayers(db, hub, requireAccount(req).id, q) };
  });
  app.post('/api/friends/request', limited(15), async (req) => sendFriendRequest(db, hub, me(req), uidBody.parse(req.body).uid));
  app.post('/api/friends/accept', limited(30), async (req) => {
    await acceptFriendRequest(db, hub, me(req), uidBody.parse(req.body).uid);
    return { ok: true };
  });
  app.post('/api/friends/decline', limited(30), async (req) => {
    await dropFriendRequest(db, me(req).id, uidBody.parse(req.body).uid, 'incoming');
    return { ok: true };
  });
  app.post('/api/friends/cancel', limited(30), async (req) => {
    await dropFriendRequest(db, me(req).id, uidBody.parse(req.body).uid, 'outgoing');
    return { ok: true };
  });
  app.post('/api/friends/remove', limited(30), async (req) => {
    await removeFriend(db, hub, me(req), uidBody.parse(req.body).uid);
    return { ok: true };
  });

  // ---------------------------------------------------------------- public profile, follows, likes, blocks
  app.get('/api/players/:uid', { preHandler: authed, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => ({
    player: await playerProfile(db, hub, requireAccount(req).id, uidSchema.parse(req.params).uid),
  }));
  const listQuery = z.object({ before: z.string().datetime().optional() });
  app.get('/api/players/:uid/followers', limited(60), async (req) => ({
    players: await followList(db, hub, uidSchema.parse(req.params).uid, 'followers', listQuery.parse(req.query).before),
  }));
  app.get('/api/players/:uid/following', limited(60), async (req) => ({
    players: await followList(db, hub, uidSchema.parse(req.params).uid, 'following', listQuery.parse(req.query).before),
  }));
  app.post('/api/players/follow', limited(30), async (req) => follow(db, hub, me(req), uidBody.parse(req.body).uid));
  app.post('/api/players/unfollow', limited(30), async (req) => unfollow(db, me(req), uidBody.parse(req.body).uid));
  app.post('/api/players/like', limited(30), async (req) => like(db, hub, me(req), uidBody.parse(req.body).uid));
  app.post('/api/players/unlike', limited(30), async (req) => unlike(db, me(req), uidBody.parse(req.body).uid));
  app.post('/api/players/block', limited(20), async (req) => block(db, hub, me(req), uidBody.parse(req.body).uid));
  app.post('/api/players/unblock', limited(20), async (req) => unblock(db, me(req), uidBody.parse(req.body).uid));
  app.get('/api/me/blocks', { preHandler: authed }, async (req) => ({ players: await blockedList(db, requireAccount(req).id) }));
  app.put('/api/me/privacy', limited(20), async (req) => ({ privacy: await updatePrivacy(db, me(req).id, privacySchema.parse(req.body)) }));

  // ---------------------------------------------------------------- reports
  app.post('/api/reports', limited(10), async (req) => createReport(db, me(req), reportSchema.parse(req.body)));
  app.get('/api/reports/mine', { preHandler: authed }, async (req) => ({ reports: await myReports(db, requireAccount(req).id) }));
  app.get('/api/admin/reports', { preHandler: can('reports.manage') }, async (req) => {
    const q = z.object({ status: z.enum(REPORT_STATUSES).optional(), uid: z.coerce.number().int().min(1).optional(), before: z.string().datetime().optional() }).parse(req.query);
    return { reports: await staffReports(db, { status: q.status, targetUid: q.uid, before: q.before }) };
  });
  app.post('/api/admin/reports/:id', { preHandler: can('reports.manage'), config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await updateReport(db, requireAccount(req).id, id, reportUpdateSchema.parse(req.body), req.ip);
    return { ok: true };
  });

  // ---------------------------------------------------------------- gifts
  app.get('/api/gifts', { preHandler: authed }, async (req) => giftsOverview(db, requireAccount(req).id));
  app.post('/api/gifts', limited(20), async (req) => {
    const user = me(req);
    const input = giftSchema.parse(req.body);
    const result = await sendGift(db, hub, user, input);
    const wallet = await getWallet(db, user.id);
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: wallet });
    if (!result.replayed && input.kind === 'silver') {
      const [receiver] = await db.execute<{ id: string }>(sqlUserByUid(input.uid));
      if (receiver) hub.sendToUser(receiver.id, { type: 'event', event: 'wallet', data: await getWallet(db, receiver.id) });
    }
    return { ...result, wallet };
  });

  // ---------------------------------------------------------------- guilds
  app.get('/api/guilds', { preHandler: authed }, async (req) => {
    const { q } = z.object({ q: z.string().trim().max(24).default('') }).parse(req.query);
    return { guilds: await listGuilds(db, q) };
  });
  app.get('/api/guild', { preHandler: authed }, async (req) => {
    const id = requireAccount(req).id;
    return { guild: await myGuild(db, hub, id), invites: await myInvites(db, id) };
  });
  app.post('/api/guild', limited(3), async (req) => {
    const user = me(req);
    const id = await createGuild(db, user.id, guildCreateSchema.parse(req.body));
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: await getWallet(db, user.id) });
    return { id };
  });
  app.patch('/api/guild', limited(20), async (req) => {
    await updateGuild(db, me(req).id, guildUpdateSchema.parse(req.body));
    return { ok: true };
  });
  app.post('/api/guild/join', limited(10), async (req) => {
    await joinGuild(db, hub, me(req).id, z.object({ id: z.string().uuid() }).parse(req.body).id);
    return { ok: true };
  });
  app.post('/api/guild/leave', limited(10), async (req) => {
    await leaveGuild(db, hub, me(req).id);
    return { ok: true };
  });
  app.post('/api/guild/invite', limited(30), async (req) => {
    await inviteToGuild(db, hub, me(req).id, uidBody.parse(req.body).uid);
    return { ok: true };
  });
  app.post('/api/guild/invites/drop', limited(30), async (req) => {
    const input = z.union([z.object({ guildId: z.string().uuid() }), uidSchema]).parse(req.body);
    await dropInvite(db, me(req).id, input);
    return { ok: true };
  });
  app.post('/api/guild/kick', limited(30), async (req) => {
    await kickMember(db, hub, me(req).id, uidBody.parse(req.body).uid);
    return { ok: true };
  });
  app.post('/api/guild/role', limited(30), async (req) => {
    const { uid, role } = uidBody.extend({ role: z.enum(['officer', 'member']) }).parse(req.body);
    await setMemberRole(db, hub, me(req).id, uid, role);
    return { ok: true };
  });
  app.post('/api/guild/transfer', limited(5), async (req) => {
    const input = uidBody.extend({ password }).parse(req.body);
    await transferGuild(db, hub, me(req).id, input.uid, input.password);
    return { ok: true };
  });
  app.post('/api/guild/disband', limited(5), async (req) => {
    const input = z.object({ password, name: z.string().min(1).max(40) }).parse(req.body);
    await disbandGuild(db, hub, me(req).id, input.password, input.name);
    return { ok: true };
  });
}
