import { adminBadgesSchema, adminGrantSchema, PERMISSIONS, SPECIAL_UID_MAX, usernameSchema, emailSchema } from '@casino/shared';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/client';
import { auditLogs, bans, emailOutbox, rolePermissions, roles, userRoles, users } from '../db/schema';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import {
  banUser,
  createCustomUidAccount,
  decideDeletion,
  findByUid,
  listDeletionRequests,
  revokeBan,
  updateBanEnd,
} from '../services/accounts';
import { audit } from '../services/audit';
import { grantRole, userRoleIds } from '../services/rbac';
import { badgesOf } from '../services/users';
import { applyDelta, getWallet } from '../services/wallet';
import type { Config } from '../config';
import { makeGuards } from './guards';

const uidParam = z.object({ uid: z.coerce.number().int().positive() });
const page = z.object({ q: z.string().trim().max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0) });

export function registerAdminRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub, config: Config): void {
  const { can } = makeGuards(app, db);

  app.get('/api/admin/overview', { preHandler: can('admin.access') }, async () => {
    const [row] = await db.execute<Record<string, string>>(sql`
      SELECT
        (SELECT count(*) FROM users WHERE account_type = 'player') AS users,
        (SELECT count(*) FROM users WHERE is_test) AS test_users,
        (SELECT mode FROM environment_state WHERE id = 1) AS data_mode,
        (SELECT count(*) FROM users WHERE status = 'pending_verification') AS pending,
        (SELECT count(*) FROM bans WHERE revoked_at IS NULL AND (ends_at IS NULL OR ends_at > now())) AS banned,
        (SELECT count(*) FROM game_rounds WHERE created_at > now() - interval '24 hours' AND status = 'settled') AS rounds24h,
        (SELECT coalesce(sum(bet), 0) FROM game_rounds WHERE created_at > now() - interval '24 hours' AND status = 'settled') AS wagered24h,
        (SELECT coalesce(sum(payout), 0) FROM game_rounds WHERE created_at > now() - interval '24 hours' AND status = 'settled') AS paid24h,
        (SELECT coalesce(sum(balance), 0) FROM wallets) AS chips,
        (SELECT coalesce(sum(gold), 0) FROM wallets) AS gold,
        (SELECT count(*) FROM email_outbox WHERE status = 'pending') AS mail_pending,
        (SELECT count(*) FROM account_deletion_requests WHERE status = 'pending') AS deletion_pending
    `);
    const n = (k: string) => Number(row![k]);
    return {
      users: n('users'),
      testUsers: n('test_users'),
      dataMode: row!.data_mode,
      pendingVerification: n('pending'),
      activeBans: n('banned'),
      online: hub.online,
      rounds24h: n('rounds24h'),
      wagered24h: n('wagered24h'),
      paid24h: n('paid24h'),
      chipsInCirculation: n('chips'),
      goldInCirculation: n('gold'),
      mailPending: n('mail_pending'),
      deletionPending: n('deletion_pending'),
    };
  });

  // ---------------------------------------------------------------- players
  app.get('/api/admin/users', { preHandler: can('users.read') }, async (req) => {
    const { q, limit, offset } = page.parse(req.query);
    const where = q
      ? /^\d+$/.test(q)
        ? eq(users.uid, Number(q))
        : or(ilike(users.usernameLower, `%${q.toLowerCase()}%`), ilike(users.emailLower, `%${q.toLowerCase()}%`), ilike(users.displayName, `%${q}%`))
      : undefined;
    const rows = await db
      .select({ uid: users.uid, username: users.username, displayName: users.displayName, email: users.email, status: users.status, accountType: users.accountType, isTest: users.isTest, createdAt: users.createdAt })
      .from(users)
      .where(where)
      .orderBy(users.uid)
      .limit(limit)
      .offset(offset);
    return { users: rows };
  });

  app.get('/api/admin/users/:uid', { preHandler: can('users.read') }, async (req) => {
    const { uid } = uidParam.parse(req.params);
    const user = await findByUid(db, uid);
    if (!user) throw fail('not_found');
    const userBans = await db.select().from(bans).where(eq(bans.userId, user.id)).orderBy(desc(bans.createdAt));
    return {
      user: {
        uid: user.uid,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        emailVerified: !!user.emailVerifiedAt,
        status: user.status,
        accountType: user.accountType,
        isTest: user.isTest,
        badges: badgesOf(user),
        createdAt: user.createdAt,
        roles: await userRoleIds(db, user.id),
        wallet: await getWallet(db, user.id),
      },
      bans: userBans,
    };
  });

  const banSchema = z.object({
    duration: z.union([z.literal('permanent'), z.object({ unit: z.enum(['day', 'month', 'year']), amount: z.number().int().min(1).max(100) })]),
    reason: z.string().trim().min(3).max(500),
    evidence: z.string().trim().max(2000).optional(),
  });

  app.post('/api/admin/users/:uid/bans', { preHandler: can('users.ban') }, async (req) => {
    const { uid } = uidParam.parse(req.params);
    const { ban, userId } = await banUser(db, req.account!.id, uid, banSchema.parse(req.body), req.ip);
    hub.kick(userId);
    return { ban };
  });

  app.post('/api/admin/bans/:id/revoke', { preHandler: can('users.ban') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    return { ban: await revokeBan(db, req.account!.id, id, reason, req.ip) };
  });

  app.patch('/api/admin/bans/:id', { preHandler: can('users.ban') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { endsAt } = z.object({ endsAt: z.string().datetime().nullable() }).parse(req.body);
    return { ban: await updateBanEnd(db, req.account!.id, id, endsAt ? new Date(endsAt) : null, req.ip) };
  });

  // ---------------------------------------------------------------- UID registry
  app.get('/api/admin/uids/special', { preHandler: can('uid.assign') }, async () => {
    const rows = await db
      .select({ uid: users.uid, username: users.username, displayName: users.displayName, status: users.status, accountType: users.accountType, isTest: users.isTest })
      .from(users)
      .where(sql`${users.uid} <= ${SPECIAL_UID_MAX}`)
      .orderBy(users.uid);
    const [{ next }] = (await db.execute<{ next: string }>(sql`SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END AS next FROM player_uid_seq`)) as unknown as [{ next: string }];
    return { special: rows, nextPlayerUid: Number(next) };
  });

  app.post('/api/admin/accounts', { preHandler: can('uid.assign') }, async (req) => {
    const input = z
      .object({
        uid: z.number().int().min(1).max(SPECIAL_UID_MAX),
        username: usernameSchema,
        displayName: z.string().trim().min(1).max(24),
        email: emailSchema,
        isTest: z.boolean().optional(),
      })
      .parse(req.body);
    const user = await createCustomUidAccount(db, req.account!.id, input, { appUrl: config.APP_URL, admins: config.adminUsernames, ip: req.ip });
    return { uid: user.uid, status: user.status };
  });

  // ---------------------------------------------------------------- roles
  app.get('/api/admin/roles', { preHandler: can('roles.manage') }, async () => {
    const rows = await db.select().from(roles).orderBy(roles.id);
    const perms = await db.select().from(rolePermissions);
    return { roles: rows.map((r) => ({ ...r, permissions: perms.filter((p) => p.roleId === r.id).map((p) => p.permission) })), catalogue: PERMISSIONS };
  });

  app.post('/api/admin/users/:uid/roles', { preHandler: can('roles.manage') }, async (req) => {
    const { uid } = uidParam.parse(req.params);
    const { roleId } = z.object({ roleId: z.string().min(1).max(40) }).parse(req.body);
    const user = await findByUid(db, uid);
    if (!user) throw fail('not_found');
    if (user.accountType !== 'player') throw fail('system_account');
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId));
    if (!role) throw fail('not_found');
    await db.transaction(async (tx) => {
      await grantRole(tx, user.id, roleId, req.account!.id);
      await audit(tx, { actorId: req.account!.id, action: 'role.grant', targetType: 'user', targetId: uid, details: { roleId }, ip: req.ip });
    });
    return { roles: await userRoleIds(db, user.id) };
  });

  app.delete('/api/admin/users/:uid/roles/:roleId', { preHandler: can('roles.manage') }, async (req) => {
    const { uid, roleId } = z.object({ uid: z.coerce.number().int().positive(), roleId: z.string().min(1).max(40) }).parse(req.params);
    const user = await findByUid(db, uid);
    if (!user) throw fail('not_found');
    if (user.id === req.account!.id && roleId === 'super_admin') throw fail('forbidden');
    await db.transaction(async (tx) => {
      await tx.delete(userRoles).where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, roleId)));
      await audit(tx, { actorId: req.account!.id, action: 'role.revoke', targetType: 'user', targetId: uid, details: { roleId }, ip: req.ip });
    });
    return { roles: await userRoleIds(db, user.id) };
  });

  // ---------------------------------------------------------------- deletion requests
  app.get('/api/admin/deletion-requests', { preHandler: can('deletion.manage') }, async (req) => {
    const { status } = z.object({ status: z.enum(['pending', 'completed', 'rejected', 'cancelled']).default('pending') }).parse(req.query);
    return { requests: await listDeletionRequests(db, status) };
  });

  app.post('/api/admin/deletion-requests/:id/decide', { preHandler: can('deletion.manage') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { approve, note } = z.object({ approve: z.boolean(), note: z.string().trim().min(3).max(500) }).parse(req.body);
    const result = await decideDeletion(db, req.account!.id, id, approve, note, req.ip);
    if (result.approved) hub.kick(result.userId);
    return result;
  });

  // ---------------------------------------------------------------- badges & grants (grants go through the ledger)
  app.post('/api/admin/users/:uid/badges', { preHandler: can('badges.manage') }, async (req) => {
    const { uid } = uidParam.parse(req.params);
    const input = adminBadgesSchema.parse(req.body);
    const patch: Partial<typeof users.$inferInsert> = {};
    if (input.verified !== undefined) patch.isVerified = input.verified;
    if (input.partner !== undefined) patch.isPartner = input.partner;
    if (Object.keys(patch).length === 0) throw fail('bad_request');
    const row = await db.transaction(async (tx) => {
      const [r] = await tx.update(users).set(patch).where(eq(users.uid, uid)).returning();
      if (!r) throw fail('not_found');
      await audit(tx, { actorId: req.account!.id, action: 'badge.update', targetType: 'user', targetId: uid, details: input, ip: req.ip });
      return r;
    });
    return { badges: badgesOf(row) };
  });

  app.post('/api/admin/users/:uid/grant', { preHandler: can('economy.grant') }, async (req) => {
    const { uid } = uidParam.parse(req.params);
    const { amount, currency } = adminGrantSchema.parse(req.body);
    const target = await findByUid(db, uid);
    if (!target) throw fail('not_found');
    await db.transaction(async (tx) => {
      await applyDelta(tx, target.id, amount, 'admin_adjust', null, currency);
      await audit(tx, { actorId: req.account!.id, action: 'economy.grant', targetType: 'user', targetId: uid, details: { amount, currency }, ip: req.ip });
    });
    const wallet = await getWallet(db, target.id);
    hub.sendToUser(target.id, { type: 'event', event: 'wallet', data: wallet });
    return wallet;
  });

  // ---------------------------------------------------------------- audit & mail
  app.get('/api/admin/audit', { preHandler: can('audit.read') }, async (req) => {
    const { limit, offset, q } = page.parse(req.query);
    const rows = await db
      .select()
      .from(auditLogs)
      .where(q ? or(eq(auditLogs.action, q), eq(auditLogs.targetId, q)) : undefined)
      .orderBy(desc(auditLogs.id))
      .limit(limit)
      .offset(offset);
    return { entries: rows };
  });

  app.get('/api/admin/outbox', { preHandler: can('mail.read') }, async (req) => {
    const { limit, offset } = page.parse(req.query);
    const rows = await db
      .select({ id: emailOutbox.id, to: emailOutbox.toAddress, subject: emailOutbox.subject, template: emailOutbox.template, status: emailOutbox.status, attempts: emailOutbox.attempts, createdAt: emailOutbox.createdAt, sentAt: emailOutbox.sentAt })
      .from(emailOutbox)
      .orderBy(desc(emailOutbox.id))
      .limit(limit)
      .offset(offset);
    return { mail: rows };
  });
}
