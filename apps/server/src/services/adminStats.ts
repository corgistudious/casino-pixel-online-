import { KEYO_OWNER_UID, MAX_DIVISION, RP_PER_DIVISION } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';

const num = (v: unknown) => Number(v ?? 0);

async function one(db: DbOrTx, q: ReturnType<typeof sql>): Promise<Record<string, unknown>> {
  const rows = (await db.execute(q)) as unknown as Record<string, unknown>[];
  return rows[0] ?? {};
}

export interface DashboardAlert {
  level: 'info' | 'warning' | 'critical';
  code: string;
  count?: number;
}

/** Headline numbers for the admin dashboard, all computed from live tables (no estimates). */
export async function dashboardMetrics(db: DbOrTx) {
  const r = await one(
    db,
    sql`SELECT
      (SELECT count(*) FROM users WHERE account_type = 'player' AND status <> 'deleted') AS players,
      (SELECT count(*) FROM users WHERE account_type = 'player' AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS new_today,
      (SELECT count(*) FROM users WHERE account_type = 'player' AND created_at > now() - interval '7 days') AS new_7d,
      (SELECT count(*) FROM users WHERE status = 'pending_verification') AS pending_verification,
      (SELECT count(*) FROM users WHERE is_test AND status <> 'deleted') AS test_players,
      (SELECT count(DISTINCT user_id) FROM bans WHERE revoked_at IS NULL AND (ends_at IS NULL OR ends_at > now())) AS banned,
      (SELECT count(*) FROM game_rounds WHERE status = 'settled') AS rounds_total,
      (SELECT count(*) FROM game_rounds WHERE status = 'settled' AND settled_at > now() - interval '24 hours') AS rounds_24h,
      (SELECT count(*) FROM game_rounds WHERE status = 'active') AS rounds_open,
      (SELECT coalesce(sum(bet), 0) FROM game_rounds WHERE status = 'settled' AND settled_at > now() - interval '24 hours') AS wagered_24h,
      (SELECT coalesce(sum(payout), 0) FROM game_rounds WHERE status = 'settled' AND settled_at > now() - interval '24 hours') AS paid_24h,
      (SELECT coalesce(sum(balance), 0) FROM wallets) AS silver,
      (SELECT coalesce(sum(gold), 0) FROM wallets) AS gold,
      (SELECT coalesce(max(level), 1) FROM player_progress) AS max_level,
      (SELECT count(*) FROM player_progress WHERE level >= 10) AS level10,
      (SELECT name FROM rank_seasons WHERE status = 'active') AS season,
      (SELECT count(*) FROM player_ranks pr JOIN rank_seasons s ON s.id = pr.season_id AND s.status = 'active' WHERE pr.wins + pr.losses > 0) AS ranked_played,
      (SELECT count(*) FROM player_ranks pr JOIN rank_seasons s ON s.id = pr.season_id AND s.status = 'active' WHERE pr.division = ${MAX_DIVISION} AND pr.rp >= ${RP_PER_DIVISION}) AS top_eligible`,
  );
  return {
    players: { total: num(r.players), newToday: num(r.new_today), new7d: num(r.new_7d), pendingVerification: num(r.pending_verification), test: num(r.test_players), banned: num(r.banned) },
    rounds: { total: num(r.rounds_total), last24h: num(r.rounds_24h), open: num(r.rounds_open), wagered24h: num(r.wagered_24h), paid24h: num(r.paid_24h) },
    circulation: { silver: num(r.silver), gold: num(r.gold) },
    progression: { maxLevel: num(r.max_level), level10: num(r.level10), season: (r.season as string | null) ?? null, ranked: num(r.ranked_played), topEligible: num(r.top_eligible) },
  };
}

/** Daily activity for the last `days` UTC days (oldest first), including days with no activity. */
export async function activitySeries(db: DbOrTx, days = 14) {
  const rows = (await db.execute(sql`
    WITH d AS (
      SELECT generate_series(
        (date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => ${days - 1}))::date,
        (now() AT TIME ZONE 'UTC')::date,
        interval '1 day'
      )::date AS day
    )
    SELECT d.day::text AS day,
      (SELECT count(*) FROM users u WHERE u.account_type = 'player' AND (u.created_at AT TIME ZONE 'UTC')::date = d.day) AS registrations,
      (SELECT count(*) FROM game_rounds g WHERE g.status = 'settled' AND (g.settled_at AT TIME ZONE 'UTC')::date = d.day) AS rounds,
      (SELECT coalesce(sum(g.bet), 0) FROM game_rounds g WHERE g.status = 'settled' AND (g.settled_at AT TIME ZONE 'UTC')::date = d.day) AS wagered,
      (SELECT count(DISTINCT g.user_id) FROM game_rounds g WHERE (g.created_at AT TIME ZONE 'UTC')::date = d.day) AS active_players
    FROM d ORDER BY d.day`)) as unknown as Record<string, unknown>[];
  return rows.map((r) => ({ day: String(r.day), registrations: num(r.registrations), rounds: num(r.rounds), wagered: num(r.wagered), activePlayers: num(r.active_players) }));
}

/** Most recent ledger movements across all players. */
export async function recentTransactions(db: DbOrTx, limit = 20) {
  const rows = (await db.execute(sql`
    SELECT l.id, u.uid, u.username, l.currency, l.delta, l.balance_after AS "balanceAfter", l.reason, l.created_at AS "createdAt"
    FROM ledger_entries l JOIN users u ON u.id = l.user_id
    ORDER BY l.id DESC LIMIT ${limit}`)) as unknown as Record<string, unknown>[];
  return rows.map((r) => ({ ...r, id: num(r.id), uid: num(r.uid), delta: num(r.delta), balanceAfter: num(r.balanceAfter) }));
}

/** Operational warnings derived from real state. */
export async function systemAlerts(db: DbOrTx, opts: { smtpConfigured: boolean }): Promise<DashboardAlert[]> {
  const r = await one(
    db,
    sql`SELECT
      (SELECT mode FROM environment_state WHERE id = 1) AS mode,
      (SELECT count(*) FROM email_outbox WHERE status = 'failed') AS mail_failed,
      (SELECT count(*) FROM email_outbox WHERE status = 'pending') AS mail_pending,
      (SELECT count(*) FROM account_deletion_requests WHERE status = 'pending') AS deletions,
      (SELECT count(*) FROM maintenance_runs WHERE status = 'failed' AND started_at > now() - interval '7 days') AS maint_failed,
      (SELECT count(*) FROM game_rounds WHERE status = 'active' AND created_at < now() - interval '1 day') AS stale_rounds,
      (SELECT count(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE ur.role_id = 'owner' AND u.uid = ${KEYO_OWNER_UID}) AS owner`,
  );
  const alerts: DashboardAlert[] = [];
  if (r.mode === 'test') alerts.push({ level: 'info', code: 'test_mode' });
  if (num(r.owner) === 0) alerts.push({ level: 'warning', code: 'no_owner' });
  if (!opts.smtpConfigured && num(r.mail_pending) > 0) alerts.push({ level: 'warning', code: 'smtp_missing', count: num(r.mail_pending) });
  if (num(r.mail_failed) > 0) alerts.push({ level: 'warning', code: 'mail_failed', count: num(r.mail_failed) });
  if (num(r.deletions) > 0) alerts.push({ level: 'info', code: 'deletion_pending', count: num(r.deletions) });
  if (num(r.maint_failed) > 0) alerts.push({ level: 'critical', code: 'maintenance_failed', count: num(r.maint_failed) });
  if (num(r.stale_rounds) > 0) alerts.push({ level: 'warning', code: 'stale_rounds', count: num(r.stale_rounds) });
  return alerts;
}
