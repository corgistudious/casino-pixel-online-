import type { Permission } from '@casino/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { accountFromToken, bearer, requireReauth } from '../auth/session';
import type { Db } from '../db/client';
import { fail } from '../errors';
import { userPermissions } from '../services/rbac';

export function makeGuards(app: FastifyInstance, db: Db) {
  const authed = async (req: FastifyRequest) => {
    const token = bearer(req);
    if (!token) throw fail('unauthorized');
    req.account = await accountFromToken(app, db, token);
  };
  /** Staff route: admin.access plus every listed permission, checked against the database on each request. */
  const can =
    (...required: Permission[]) =>
    async (req: FastifyRequest) => {
      await authed(req);
      const perms = await userPermissions(db, req.account!.id);
      if (!perms.includes('admin.access') || required.some((p) => !perms.includes(p))) throw fail('forbidden');
    };
  /** Sensitive staff route: as `can`, and the password must have been re-confirmed in the last 10 minutes. */
  const canReauth =
    (...required: Permission[]) =>
    async (req: FastifyRequest) => {
      await can(...required)(req);
      requireReauth(app, req);
    };
  return { authed, can, canReauth };
}
