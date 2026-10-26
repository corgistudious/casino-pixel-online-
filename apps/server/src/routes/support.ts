import { supportCreateSchema, supportReplySchema } from '@casino/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import type { RealtimeHub } from '../realtime/hub';
import { assignTicket, createTicket, myTickets, replyTicket, setTicketOpen, staffTickets, ticketDetail, unreadTickets } from '../services/support';
import { makeGuards } from './guards';

const idParam = z.object({ id: z.string().uuid() });

/** Support Center: players' tickets and the staff queue. Access is enforced in the service. */
export function registerSupportRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { authed, can } = makeGuards(app, db);

  app.post('/api/support/tickets', { preHandler: authed, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req) =>
    createTicket(db, requireActive(requireAccount(req)).id, supportCreateSchema.parse(req.body)),
  );
  app.get('/api/support/tickets', { preHandler: authed }, async (req) => ({ tickets: await myTickets(db, requireAccount(req).id) }));
  app.get('/api/support/unread', { preHandler: authed }, async (req) => ({ count: await unreadTickets(db, requireAccount(req).id) }));
  app.get('/api/support/tickets/:id', { preHandler: authed }, async (req) => ticketDetail(db, requireAccount(req).id, idParam.parse(req.params).id));
  app.post('/api/support/tickets/:id/replies', { preHandler: authed, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    await replyTicket(db, hub, requireAccount(req).id, idParam.parse(req.params).id, supportReplySchema.parse(req.body).message);
    return { ok: true };
  });
  app.post('/api/support/tickets/:id/close', { preHandler: authed }, async (req) => {
    await setTicketOpen(db, hub, requireAccount(req).id, idParam.parse(req.params).id, false, req.ip);
    return { ok: true };
  });
  app.post('/api/support/tickets/:id/reopen', { preHandler: authed }, async (req) => {
    await setTicketOpen(db, hub, requireAccount(req).id, idParam.parse(req.params).id, true, req.ip);
    return { ok: true };
  });

  // ---------------------------------------------------------------- staff queue
  app.get('/api/admin/support/tickets', { preHandler: can('support.read') }, async (req) => {
    const q = z.object({ status: z.enum(['open', 'in_progress', 'closed']).optional(), mine: z.coerce.boolean().optional(), q: z.string().max(60).optional() }).parse(req.query);
    return { tickets: await staffTickets(db, { status: q.status, mine: q.mine ? requireAccount(req).id : undefined, q: q.q }) };
  });
  app.post('/api/admin/support/tickets/:id/assign', { preHandler: can('support.reply') }, async (req) => {
    await assignTicket(db, requireAccount(req).id, idParam.parse(req.params).id, req.ip);
    return { ok: true };
  });
}
