import type { Permission } from '@casino/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { accountFromToken, bearer } from '../auth/session';
import type { Db } from '../db/client';
import { fail } from '../errors';
import { requirePermission } from '../services/rbac';

export function makeGuards(app: FastifyInstance, db: Db) {
  const authed = async (req: FastifyRequest) => {
    const token = bearer(req);
    if (!token) throw fail('unauthorized');
    req.account = await accountFromToken(app, db, token);
  };
  const can = (permission: Permission) => async (req: FastifyRequest) => {
    await authed(req);
    await requirePermission(db, req.account!.id, 'admin.access');
    await requirePermission(db, req.account!.id, permission);
  };
  return { authed, can };
}
