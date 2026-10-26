import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/client';
import { audit } from '../services/audit';
import type { BlackjackTableEngine } from '../services/blackjackTables';
import { makeGuards } from './guards';

/** Shared Blackjack lobby and public state over HTTP (play goes over the WebSocket), and staff controls. */
export function registerBlackjackTableRoutes(app: FastifyInstance, db: Db, bjt: BlackjackTableEngine): void {
  const { can } = makeGuards(app, db);
  const idParam = z.object({ id: z.string().min(1).max(40) });
  app.get('/api/bjt/tables', async () => ({ tables: await bjt.lobby() }));
  app.get('/api/bjt/tables/:id', async (req) => bjt.view(idParam.parse(req.params).id, null));
  app.patch('/api/admin/bjt/tables/:id', { preHandler: can('rooms.manage') }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { status } = z.object({ status: z.enum(['open', 'paused', 'closed']) }).parse(req.body);
    await bjt.setStatus(id, status);
    await audit(db, { actorId: req.account!.id, action: 'bjt_table.status', targetType: 'bjt_table', targetId: id, details: { status }, ip: req.ip });
    return { ok: true };
  });
}
