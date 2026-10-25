import { and, desc, eq, gte, like, lte, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { auditLogs, gameRounds, ledgerEntries, userItems, users } from '../db/schema';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { findByUid } from '../services/accounts';
import { activitySeries, dashboardMetrics, recentTransactions, systemAlerts } from '../services/adminStats';
import { userPermissions } from '../services/rbac';
import { makeGuards } from './guards';

const uidParam = z.object({ uid: z.coerce.number().int().positive() });
const paging = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).max(100_000).default(0) });

/** Read-mostly endpoints behind the admin panel: dashboard, player drill-down and the audit log browser. */
export function registerAdminPanelRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub, config: Config): void {
  const { can } = makeGuards(app, db);

  app.get('/api/admin/bank/overview', { preHandler: can('bank.read') }, async () => {
    const totals = await db.execute(sql`
      SELECT count(*)::int AS accounts, coalesce(sum(silver), 0)::text AS silver,
        coalesce(sum(gold), 0)::text AS gold FROM bank_accounts
    `);
    return { totals: totals[0] ?? { accounts: 0, silver: '0', gold: '0' } };
  });

  app.get('/api/admin/market/listings', { preHandler: can('market.manage') }, async () => {
    const listings = await db.execute(sql`
      SELECT id, seller_id, buyer_id, item_id, price_silver, status, created_at, completed_at
      FROM market_listings ORDER BY created_at DESC LIMIT 100
    `);
    return { listings };
  });

  app.get('/api/admin/support/summary', { preHandler: can('support.read') }, async () => {
    const counts = await db.execute(sql`
      SELECT status, count(*)::int AS count FROM support_tickets GROUP BY status
    `);
    return { counts };
  });


  app.get('/api/admin/dashboard', { preHandler: can('dashboard.read') }, async (req) => {
    const perms = await userPermissions(db, req.account!.id);
    const [metrics, series, alerts] = await Promise.all([dashboardMetrics(db), activitySeries(db, 14), systemAlerts(db, { smtpConfigured: !!config.SMTP_URL })]);
    return {
      ...metrics,
      online: hub.online,
      series,
      alerts,
      // Individual transactions are economy data: only for staff allowed to review the economy.
      recentTransactions: perms.includes('economy.read') ? await recentTransactions(db, 20) : null,
    };
  });

  /** Player activity: inventory, recent rounds and, with users.pii, the security history. */
  app.get('/api/admin/users/:uid/activity', { preHandler: can('users.read') }, async (req) => {
    const { uid } = uidParam.parse(req.params);
    const user = await findByUid(db, uid);
    if (!user) throw fail('not_found');
    const perms = await userPermissions(db, req.account!.id);
    const [items, rounds, stats] = await Promise.all([
      db.select({ itemId: userItems.itemId, acquiredAt: userItems.acquiredAt }).from(userItems).where(eq(userItems.userId, user.id)).orderBy(desc(userItems.acquiredAt)),
      db
        .select({ id: gameRounds.id, game: gameRounds.game, bet: gameRounds.bet, payout: gameRounds.payout, status: gameRounds.status, createdAt: gameRounds.createdAt })
        .from(gameRounds)
        .where(eq(gameRounds.userId, user.id))
        .orderBy(desc(gameRounds.createdAt))
        .limit(20),
      db.execute<{ rounds: string; wagered: string; won: string }>(
        sql`SELECT count(*) AS rounds, coalesce(sum(bet), 0) AS wagered, coalesce(sum(payout), 0) AS won FROM game_rounds WHERE user_id = ${user.id} AND status = 'settled'`,
      ),
    ]);
    const security = perms.includes('users.pii')
      ? await db
          .select({ id: auditLogs.id, action: auditLogs.action, ip: auditLogs.ip, createdAt: auditLogs.createdAt })
          .from(auditLogs)
          .where(and(eq(auditLogs.targetType, 'user'), eq(auditLogs.targetId, String(uid)), sql`(${auditLogs.action} LIKE 'account.%' OR ${auditLogs.action} LIKE 'auth.%')`))
          .orderBy(desc(auditLogs.id))
          .limit(30)
      : null;
    const s = stats[0]!;
    return { items, rounds, stats: { rounds: Number(s.rounds), wagered: Number(s.wagered), won: Number(s.won) }, security };
  });

  /** A player's ledger, newest first. */
  app.get('/api/admin/users/:uid/ledger', { preHandler: can('economy.read') }, async (req) => {
    const { uid } = uidParam.parse(req.params);
    const { limit, offset } = paging.parse(req.query);
    const user = await findByUid(db, uid);
    if (!user) throw fail('not_found');
    const rows = await db
      .select({ id: ledgerEntries.id, currency: ledgerEntries.currency, delta: ledgerEntries.delta, balanceAfter: ledgerEntries.balanceAfter, reason: ledgerEntries.reason, roundId: ledgerEntries.roundId, createdAt: ledgerEntries.createdAt })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(desc(ledgerEntries.id))
      .limit(limit)
      .offset(offset);
    return { entries: rows };
  });

  const auditQuery = paging.extend({
    action: z.string().trim().max(60).regex(/^[a-z_.]*$/).optional(),
    actor: z.coerce.number().int().positive().optional(),
    target: z.string().trim().max(64).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  });

  /** Audit browser: filter by action (prefix, e.g. "ban."), actor UID, target id and time range. */
  app.get('/api/admin/audit/search', { preHandler: can('audit.read') }, async (req) => {
    const q = auditQuery.parse(req.query);
    const where: SQL[] = [];
    if (q.action) where.push(like(auditLogs.action, `${q.action.replace(/_/g, '\\_')}%`));
    if (q.actor) {
      const actor = await findByUid(db, q.actor);
      if (!actor) return { entries: [] };
      where.push(eq(auditLogs.actorId, actor.id));
    }
    if (q.target) where.push(eq(auditLogs.targetId, q.target));
    if (q.from) where.push(gte(auditLogs.createdAt, new Date(q.from)));
    if (q.to) where.push(lte(auditLogs.createdAt, new Date(q.to)));
    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        details: auditLogs.details,
        ip: auditLogs.ip,
        createdAt: auditLogs.createdAt,
        actorUid: users.uid,
        actorName: users.username,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLogs.id))
      .limit(q.limit)
      .offset(q.offset);
    return { entries: rows };
  });
}
