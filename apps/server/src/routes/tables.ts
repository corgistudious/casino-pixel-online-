import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { gameTables } from '../db/schema';
import { fail } from '../errors';
import { audit } from '../services/audit';
import type { RoundTableEngine } from '../services/roundTables';
import { makeGuards } from './guards';

/** Table list/state over HTTP (live play goes over the WebSocket) and staff controls. */
export function registerTableRoutes(app: FastifyInstance, db: Db, tables: RoundTableEngine): void {
  const { can, canReauth } = makeGuards(app, db);

  app.get('/api/tables', async () => ({ tables: await tables.listTables() }));

  /** Public state of a table (no personal bets). */
  app.get('/api/tables/:id', async (req) => {
    const { id } = z.object({ id: z.string().min(1).max(40) }).parse(req.params);
    const { myBets: _mine, ...view } = await tables.view(id);
    return view;
  });

  /** Pause (finish the current round, open no new one) or reopen a table. */
  app.patch('/api/admin/tables/:id', { preHandler: can('rooms.manage') }, async (req) => {
    const { id } = z.object({ id: z.string().min(1).max(40) }).parse(req.params);
    const { status } = z.object({ status: z.enum(['open', 'paused']) }).parse(req.body);
    const [row] = await db.update(gameTables).set({ status }).where(eq(gameTables.id, id)).returning();
    if (!row) throw fail('table_not_found');
    await audit(db, { actorId: req.account!.id, action: 'table.status', targetType: 'table', targetId: id, details: { status }, ip: req.ip });
    return { table: row };
  });

  /** Cancel an unsettled round and refund every stake (incident handling). */
  app.post('/api/admin/tables/rounds/:roundId/void', { preHandler: canReauth('rooms.manage') }, async (req) => {
    const { roundId } = z.object({ roundId: z.string().uuid() }).parse(req.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const refunded = await tables.voidRound(roundId, reason);
    await audit(db, { actorId: req.account!.id, action: 'table.round_void', targetType: 'table_round', targetId: roundId, details: { reason, refundedPlayers: refunded }, ip: req.ip });
    return { refundedPlayers: refunded };
  });
}
