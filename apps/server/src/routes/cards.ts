import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/client';
import { audit } from '../services/audit';
import type { CardTableEngine } from '../services/cardTables';
import { makeGuards } from './guards';

/** Card table lobby and public state over HTTP (play goes over the WebSocket), and staff controls. */
export function registerCardRoutes(app: FastifyInstance, db: Db, cards: CardTableEngine): void {
  const { can } = makeGuards(app, db);
  const idParam = z.object({ id: z.string().min(1).max(40) });

  app.get('/api/cards/tables', async () => ({ tables: await cards.lobby() }));

  /** Public view: no hidden cards. */
  app.get('/api/cards/tables/:id', async (req) => cards.view(idParam.parse(req.params).id, null));

  app.patch('/api/admin/cards/tables/:id', { preHandler: can('rooms.manage') }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { status } = z.object({ status: z.enum(['open', 'paused', 'closed']) }).parse(req.body);
    const table = await cards.setStatus(id, status);
    await audit(db, { actorId: req.account!.id, action: 'card_table.status', targetType: 'card_table', targetId: id, details: { status }, ip: req.ip });
    return { table };
  });
}
