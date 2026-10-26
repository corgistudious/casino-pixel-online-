import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import type { RealtimeHub } from '../realtime/hub';
import { bankHistory, bankOverview, moveBankFunds } from '../services/bank';
import { getWallet } from '../services/wallet';
import { makeGuards } from './guards';

const transferSchema = z.object({
  idempotencyKey: z.string().uuid(),
  currency: z.enum(['silver', 'gold']),
  direction: z.enum(['deposit', 'withdraw']),
  amount: z.number().int().positive().max(1_000_000_000),
});

export function registerBankRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { authed } = makeGuards(app, db);
  app.get('/api/bank', { preHandler: authed }, async (req) => bankOverview(db, requireAccount(req).id));
  app.get('/api/bank/history', { preHandler: authed }, async (req) => {
    const { before } = z.object({ before: z.string().datetime().optional() }).parse(req.query);
    return bankHistory(db, requireAccount(req).id, before);
  });
  app.post('/api/bank/transfer', { preHandler: authed, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireActive(requireAccount(req));
    const input = transferSchema.parse(req.body);
    const transfer = await moveBankFunds(db, user.id, input.idempotencyKey, input.currency, input.direction, input.amount);
    const wallet = await getWallet(db, user.id);
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: wallet });
    return { transfer, ...await bankOverview(db, user.id) };
  });
}
