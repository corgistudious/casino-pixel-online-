import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { userPermissions } from '../services/rbac';
import { makeGuards } from './guards';

const sendInput = z.object({ body: z.string().trim().min(1).max(500) });
const idInput = z.object({ id: z.coerce.number().int().positive() });
const muteInput = z.object({ uid: z.number().int().positive(), minutes: z.number().int().min(1).max(43200), reason: z.string().trim().min(3).max(500) });

export function registerChatRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { authed, can } = makeGuards(app, db);
  app.get('/api/chat', { preHandler: authed }, async () => {
    const messages = await db.execute(sql`
      SELECT m.id, u.uid, u.display_name, u.equipped_bubble AS bubble, u.equipped_title AS title, m.body, m.created_at
      FROM public_chat_messages m JOIN users u ON u.id = m.user_id
      WHERE m.deleted_at IS NULL ORDER BY m.id DESC LIMIT 100
    `);
    return { messages: [...messages].reverse() };
  });
  app.post('/api/chat', { preHandler: authed, config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireActive(requireAccount(req));
    const { body } = sendInput.parse(req.body);
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`);
      const muted = await tx.execute(sql`SELECT 1 FROM public_chat_mutes WHERE user_id = ${user.id}::uuid AND until_at > now()`);
      if (muted.length) throw fail('forbidden');
      const recent = await tx.execute(sql`SELECT 1 FROM public_chat_messages WHERE user_id = ${user.id}::uuid AND created_at > now() - interval '2 seconds' LIMIT 1`);
      if (recent.length) throw fail('too_soon');
      return tx.execute<{ id: string }>(sql`INSERT INTO public_chat_messages(user_id, body) VALUES (${user.id}::uuid, ${body}) RETURNING id`);
    });
    const payload = { id: Number(rows[0]!.id), uid: user.uid, body };
    hub.broadcast({ type: 'event', event: 'chat', data: payload });
    return payload;
  });
  app.delete('/api/admin/chat/:id', { preHandler: can('chat.moderate') }, async (req) => {
    const { id } = idInput.parse(req.params);
    const actor = requireAccount(req);
    const rows = await db.execute(sql`
      UPDATE public_chat_messages SET deleted_at = now(), deleted_by = ${actor.id}::uuid
      WHERE id = ${id} AND deleted_at IS NULL RETURNING id
    `);
    if (!rows.length) throw fail('not_found');
    hub.broadcast({ type: 'event', event: 'chatRemoved', data: { id } });
    return { id };
  });
  app.post('/api/admin/chat/mute', { preHandler: can('chat.moderate') }, async (req) => {
    const actor = requireAccount(req);
    const { uid, minutes, reason } = muteInput.parse(req.body);
    const target = await db.execute<{ id: string }>(sql`SELECT id FROM users WHERE uid = ${uid} AND uid NOT IN (1000,1002)`);
    if (!target.length) throw fail('protected_account');
    await db.execute(sql`
      INSERT INTO public_chat_mutes(user_id, until_at, reason, issued_by)
      VALUES (${target[0]!.id}::uuid, now() + (${minutes} * interval '1 minute'), ${reason}, ${actor.id}::uuid)
      ON CONFLICT (user_id) DO UPDATE SET until_at = excluded.until_at, reason = excluded.reason, issued_by = excluded.issued_by
    `);
    return { uid, minutes };
  });
}
