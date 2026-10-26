import { ROOM_GAMES, roomCreateSchema, roomIdSchema, roomJoinSchema, roomUpdateSchema } from '@casino/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import type { RoomService } from '../services/rooms';
import { makeGuards } from './guards';

const uidBody = z.object({ uid: z.number().int().min(1) });

/** Player rooms. Every rule lives in RoomService and the table engines; routes parse and route. */
export function registerRoomRoutes(app: FastifyInstance, db: Db, rooms: RoomService): void {
  const { authed } = makeGuards(app, db);
  const me = (req: Parameters<typeof requireAccount>[0]) => requireActive(requireAccount(req));
  const limited = (max: number) => ({ preHandler: authed, config: { rateLimit: { max, timeWindow: '1 minute' } } });
  const idOf = (params: unknown) => roomIdSchema.parse(params).id;

  app.get('/api/rooms', limited(120), async (req) => {
    const q = z.object({ game: z.enum(ROOM_GAMES).optional(), filter: z.enum(['all', 'public', 'private', 'available']).default('all') }).parse(req.query);
    return { rooms: await rooms.list(requireAccount(req).id, q) };
  });
  app.post('/api/rooms', limited(5), async (req) => ({ room: await rooms.create(me(req), roomCreateSchema.parse(req.body)) }));
  app.get('/api/rooms/by-table/:engine/:tableId', limited(120), async (req) => {
    const p = z.object({ engine: z.enum(['card', 'bj']), tableId: z.string().min(1).max(40) }).parse(req.params);
    return { room: await rooms.byTable(requireAccount(req).id, p.engine, p.tableId) };
  });
  app.get('/api/rooms/:id', limited(120), async (req) => ({ room: await rooms.view(requireAccount(req).id, idOf(req.params)) }));
  app.post('/api/rooms/:id/join', limited(10), async (req) => ({ room: await rooms.join(me(req), idOf(req.params), roomJoinSchema.parse(req.body ?? {}).password) }));
  app.patch('/api/rooms/:id', limited(20), async (req) => ({ room: await rooms.update(me(req), idOf(req.params), roomUpdateSchema.parse(req.body)) }));
  app.post('/api/rooms/:id/invite', limited(30), async (req) => rooms.invite(me(req), idOf(req.params), uidBody.parse(req.body).uid));
  app.post('/api/rooms/:id/kick', limited(30), async (req) => rooms.kick(me(req), idOf(req.params), uidBody.parse(req.body).uid));
  app.post('/api/rooms/:id/close', limited(10), async (req) => rooms.close(me(req), idOf(req.params)));
}
