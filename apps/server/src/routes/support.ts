import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import { fail } from '../errors';
import { userPermissions } from '../services/rbac';
import { makeGuards } from './guards';

const idParam = z.object({ id: z.string().uuid() });
const createInput = z.object({
  category: z.enum(['account', 'game', 'payment', 'report', 'other']),
  subject: z.string().trim().min(4).max(140),
  message: z.string().trim().min(1).max(4000),
});
const replyInput = z.object({ message: z.string().trim().min(1).max(4000) });
const statusInput = z.object({ status: z.enum(['open', 'in_progress', 'closed']) });

/** Private, persistent support tickets. Ticket access is enforced server-side. */
export function registerSupportRoutes(app: FastifyInstance, db: Db): void {
  const { authed } = makeGuards(app, db);
  const staff = async (userId: string) => {
    const permissions = await userPermissions(db, userId);
    return permissions.includes('admin.access') && (permissions.includes('ticket.manage') || permissions.includes('support.manage'));
  };
  const access = async (userId: string, ticketId: string) => {
    const rows = await db.execute<{ user_id: string; status: string }>(sql`
      SELECT user_id, status FROM support_tickets WHERE id = ${ticketId}::uuid
    `);
    if (!rows.length) throw fail('not_found');
    if (rows[0]!.user_id !== userId && !(await staff(userId))) throw fail('forbidden');
    return rows[0]!;
  };

  app.post('/api/support/tickets', { preHandler: authed, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req) => {
    const user = requireActive(requireAccount(req));
    const input = createInput.parse(req.body);
    return db.transaction(async (tx) => {
      const tickets = await tx.execute<{ id: string }>(sql`
        INSERT INTO support_tickets(user_id, category, subject)
        VALUES (${user.id}::uuid, ${input.category}, ${input.subject}) RETURNING id
      `);
      const id = tickets[0]!.id;
      await tx.execute(sql`
        INSERT INTO support_ticket_messages(ticket_id, author_id, body)
        VALUES (${id}::uuid, ${user.id}::uuid, ${input.message})
      `);
      return { id, status: 'open' };
    });
  });

  app.get('/api/support/tickets', { preHandler: authed }, async (req) => {
    const user = requireAccount(req);
    const query = z.object({ scope: z.enum(['mine', 'staff']).default('mine') }).parse(req.query);
    if (query.scope === 'staff' && !(await staff(user.id))) throw fail('forbidden');
    const tickets = query.scope === 'staff'
      ? await db.execute(sql`SELECT id, user_id, category, subject, status, assigned_to, created_at, updated_at FROM support_tickets ORDER BY updated_at DESC LIMIT 100`)
      : await db.execute(sql`SELECT id, category, subject, status, created_at, updated_at FROM support_tickets WHERE user_id = ${user.id}::uuid ORDER BY updated_at DESC LIMIT 100`);
    return { tickets };
  });

  app.get('/api/support/tickets/:id', { preHandler: authed }, async (req) => {
    const user = requireAccount(req);
    const { id } = idParam.parse(req.params);
    await access(user.id, id);
    const messages = await db.execute(sql`
      SELECT id, author_id, body, created_at FROM support_ticket_messages
      WHERE ticket_id = ${id}::uuid ORDER BY created_at, id LIMIT 500
    `);
    return { messages };
  });

  app.post('/api/support/tickets/:id/replies', { preHandler: authed, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireActive(requireAccount(req));
    const { id } = idParam.parse(req.params);
    const { message } = replyInput.parse(req.body);
    return db.transaction(async (tx) => {
      const locked = await tx.execute<{ user_id: string; status: string }>(sql`SELECT user_id, status FROM support_tickets WHERE id = ${id}::uuid FOR UPDATE`);
      if (!locked.length) throw fail('not_found');
      if (locked[0]!.user_id !== user.id && !(await staff(user.id))) throw fail('forbidden');
      if (locked[0]!.status === 'closed') throw fail('forbidden');
      const rows = await tx.execute<{ id: string }>(sql`
        INSERT INTO support_ticket_messages(ticket_id, author_id, body)
        VALUES (${id}::uuid, ${user.id}::uuid, ${message}) RETURNING id
      `);
      await tx.execute(sql`UPDATE support_tickets SET updated_at = now() WHERE id = ${id}::uuid`);
      return { id: rows[0]!.id };
    });
  });

  app.patch('/api/support/tickets/:id', { preHandler: authed }, async (req) => {
    const user = requireAccount(req);
    if (!(await staff(user.id))) throw fail('forbidden');
    const { id } = idParam.parse(req.params);
    const { status } = statusInput.parse(req.body);
    const rows = await db.execute<{ id: string }>(sql`
      UPDATE support_tickets SET status = ${status}, updated_at = now(),
        closed_at = CASE WHEN ${status} = 'closed' THEN now() ELSE NULL END
      WHERE id = ${id}::uuid RETURNING id
    `);
    if (!rows.length) throw fail('not_found');
    return { id, status };
  });
}
