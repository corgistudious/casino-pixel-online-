import { chatBodySchema, uidSchema } from '@casino/shared';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { conversations, dmHistory, guildHistory, removeServerMessage, sendDm, sendGuild, sendServer, serverHistory, unreadCounts } from '../services/chat';
import { audit } from '../services/audit';
import { assertOutranks } from '../services/rbac';
import { makeGuards } from './guards';

const before = z.object({ before: z.coerce.number().int().positive().optional() });
const idInput = z.object({ id: z.coerce.number().int().positive() });
const muteInput = z.object({ uid: z.number().int().positive(), minutes: z.number().int().min(1).max(43200), reason: z.string().trim().min(3).max(500) });

/** The three chat channels (server, guild, private) and chat moderation. */
export function registerChatRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { authed, can } = makeGuards(app, db);
  const send = { preHandler: authed, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.get('/api/chat/server', { preHandler: authed }, async (req) => ({ messages: await serverHistory(db, before.parse(req.query).before) }));
  app.post('/api/chat/server', send, async (req) => ({
    message: await sendServer(db, hub, requireActive(requireAccount(req)).id, chatBodySchema.parse(req.body).body),
  }));

  app.get('/api/chat/guild', { preHandler: authed }, async (req) => ({ messages: await guildHistory(db, requireAccount(req).id, before.parse(req.query).before) }));
  app.post('/api/chat/guild', send, async (req) => ({
    message: await sendGuild(db, hub, requireActive(requireAccount(req)).id, chatBodySchema.parse(req.body).body),
  }));

  app.get('/api/chat/dm', { preHandler: authed }, async (req) => ({ conversations: await conversations(db, hub, requireAccount(req).id) }));
  app.get('/api/chat/dm/:uid', { preHandler: authed }, async (req) => ({
    messages: await dmHistory(db, hub, requireAccount(req).id, uidSchema.parse(req.params).uid, before.parse(req.query).before),
  }));
  app.post('/api/chat/dm/:uid', send, async (req) => ({
    message: await sendDm(db, hub, requireActive(requireAccount(req)), uidSchema.parse(req.params).uid, chatBodySchema.parse(req.body).body),
  }));
  app.get('/api/chat/unread', { preHandler: authed }, async (req) => unreadCounts(db, requireAccount(req).id));

  // ---------------------------------------------------------------- moderation (Moderator and above)
  app.delete('/api/admin/chat/:id', { preHandler: can('chat.moderate') }, async (req) => {
    const { id } = idInput.parse(req.params);
    const actor = requireAccount(req);
    await removeServerMessage(db, hub, actor.id, id);
    await audit(db, { actorId: actor.id, action: 'chat.remove', targetType: 'chat_message', targetId: id, ip: req.ip });
    return { id };
  });
  app.post('/api/admin/chat/mute', { preHandler: can('chat.moderate') }, async (req) => {
    const actor = requireAccount(req);
    const { uid, minutes, reason } = muteInput.parse(req.body);
    const [target] = await db.select().from(users).where(eq(users.uid, uid));
    if (!target) throw fail('not_found');
    await assertOutranks(db, actor.id, target);
    await db.execute(sql`
      INSERT INTO public_chat_mutes(user_id, until_at, reason, issued_by)
      VALUES (${target.id}::uuid, now() + (${minutes} * interval '1 minute'), ${reason}, ${actor.id}::uuid)
      ON CONFLICT (user_id) DO UPDATE SET until_at = excluded.until_at, reason = excluded.reason, issued_by = excluded.issued_by
    `);
    await audit(db, { actorId: actor.id, action: 'chat.mute', targetType: 'user', targetId: uid, details: { minutes, reason }, ip: req.ip });
    return { uid, minutes };
  });
  app.post('/api/admin/chat/unmute', { preHandler: can('chat.moderate') }, async (req) => {
    const actor = requireAccount(req);
    const { uid } = z.object({ uid: z.number().int().positive() }).parse(req.body);
    const [target] = await db.select().from(users).where(eq(users.uid, uid));
    if (!target) throw fail('not_found');
    await assertOutranks(db, actor.id, target);
    await db.execute(sql`DELETE FROM public_chat_mutes WHERE user_id = ${target.id}::uuid`);
    await audit(db, { actorId: actor.id, action: 'chat.unmute', targetType: 'user', targetId: uid, ip: req.ip });
    return { uid };
  });
}
