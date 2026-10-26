import { SOCIAL_RULES, type MyReportView, type ReportCategory, type ReportInput, type ReportStatus, type StaffReportView } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { fail } from '../errors';
import { audit } from './audit';
import { CARD_COLUMNS, CARD_JOIN, toCard, visiblePlayer, type CardRow } from './social';

/**
 * Player reports. Reporters see only their own reports; the reported player never sees who
 * reported them. Staff with `reports.manage` work the queue; every decision is audited. Nothing
 * happens to an account automatically, however many reports it gets.
 */

const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);

export async function createReport(db: Db, me: { id: string; uid: number }, input: ReportInput): Promise<{ id: string }> {
  if (input.uid === me.uid) throw fail('self_social');
  return db.transaction(async (tx) => {
    const target = await visiblePlayer(tx, input.uid);
    // Serialises one reporter's reports so the daily limit holds under concurrent requests.
    await tx.execute(sql`SELECT id FROM users WHERE id = ${me.id}::uuid FOR UPDATE`);
    const [{ n }] = (await tx.execute(sql`
      SELECT count(*)::int AS n FROM player_reports
      WHERE reporter_id = ${me.id}::uuid AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`)) as unknown as [{ n: number }];
    if (n >= SOCIAL_RULES.report.dailyPerReporter) throw fail('report_limit');
    const open = await tx.execute(sql`SELECT 1 FROM player_reports WHERE reporter_id = ${me.id}::uuid AND target_id = ${target.user_id}::uuid AND status IN ('pending', 'reviewing')`);
    if (open.length) throw fail('report_duplicate');
    const [row] = await tx.execute<{ id: string }>(sql`
      INSERT INTO player_reports (reporter_id, target_id, category, description, context)
      VALUES (${me.id}::uuid, ${target.user_id}::uuid, ${input.category}, ${input.description}, ${input.context ?? null})
      RETURNING id`);
    return { id: row!.id };
  });
}

export async function myReports(db: Db, meId: string): Promise<MyReportView[]> {
  const rows = await db.execute<CardRow & { id: string; category: ReportCategory; status: ReportStatus; created_at: string }>(sql`
    SELECT r.id, r.category, r.status, r.created_at, ${CARD_COLUMNS}
    FROM player_reports r JOIN users u ON u.id = r.target_id ${CARD_JOIN}
    WHERE r.reporter_id = ${meId}::uuid ORDER BY r.created_at DESC LIMIT 50`);
  return rows.map((r) => ({ id: r.id, target: toCard(r), category: r.category, status: r.status, createdAt: iso(r.created_at)! }));
}

export async function staffReports(db: Db, opts: { status?: ReportStatus; targetUid?: number; before?: string }): Promise<StaffReportView[]> {
  const rows = await db.execute<{
    id: string;
    category: ReportCategory;
    description: string;
    context: string | null;
    status: ReportStatus;
    resolution: string | null;
    created_at: string;
    updated_at: string;
    reporter_uid: number;
    reporter_name: string;
    target_uid: number;
    target_name: string;
    target_status: string;
    handler_uid: number | null;
    handler_name: string | null;
    target_open: number;
  }>(sql`
    SELECT r.id, r.category, r.description, r.context, r.status, r.resolution, r.created_at, r.updated_at,
      rep.uid AS reporter_uid, rep.display_name AS reporter_name,
      tgt.uid AS target_uid, tgt.display_name AS target_name, tgt.status AS target_status,
      h.uid AS handler_uid, h.display_name AS handler_name,
      (SELECT count(*)::int FROM player_reports o WHERE o.target_id = r.target_id AND o.status IN ('pending', 'reviewing')) AS target_open
    FROM player_reports r
    JOIN users rep ON rep.id = r.reporter_id
    JOIN users tgt ON tgt.id = r.target_id
    LEFT JOIN users h ON h.id = r.handled_by
    WHERE TRUE
      ${opts.status ? sql`AND r.status = ${opts.status}` : sql``}
      ${opts.targetUid ? sql`AND tgt.uid = ${opts.targetUid}` : sql``}
      ${opts.before ? sql`AND r.created_at < ${opts.before}::timestamptz` : sql``}
    ORDER BY (r.status IN ('pending', 'reviewing')) DESC, r.created_at ${opts.status === 'pending' || opts.status === 'reviewing' ? sql`ASC` : sql`DESC`}
    LIMIT 50`);
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    description: r.description,
    context: r.context,
    status: r.status,
    resolution: r.resolution,
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    reporter: { uid: Number(r.reporter_uid), displayName: r.reporter_name },
    target: { uid: Number(r.target_uid), displayName: r.target_name, status: r.target_status },
    handledBy: r.handler_uid === null ? null : { uid: Number(r.handler_uid), displayName: r.handler_name! },
    targetOpen: r.target_open,
  }));
}

const NEXT: Record<ReportStatus, ReportStatus[]> = { pending: ['reviewing', 'resolved', 'rejected'], reviewing: ['resolved', 'rejected'], resolved: [], rejected: [] };

/** Moves a report along pending → reviewing → resolved / rejected. Staff never handle reports by or about themselves. */
export async function updateReport(db: Db, actorId: string, id: string, input: { status: 'reviewing' | 'resolved' | 'rejected'; resolution?: string }, ip?: string) {
  await db.transaction(async (tx) => {
    const [r] = await tx.execute<{ status: ReportStatus; reporter_id: string; target_id: string }>(sql`SELECT status, reporter_id, target_id FROM player_reports WHERE id = ${id}::uuid FOR UPDATE`);
    if (!r) throw fail('not_found');
    if (r.reporter_id === actorId || r.target_id === actorId) throw fail('self_action_forbidden');
    if (!NEXT[r.status].includes(input.status)) throw fail('bad_request', `cannot move a ${r.status} report to ${input.status}`);
    const final = input.status !== 'reviewing';
    await tx.execute(sql`
      UPDATE player_reports SET status = ${input.status}, handled_by = ${actorId}::uuid, updated_at = now(),
        resolution = coalesce(${input.resolution ?? null}, resolution), resolved_at = ${final ? sql`now()` : sql`NULL`}
      WHERE id = ${id}::uuid`);
    await audit(tx, { actorId, action: 'reports.update', targetType: 'player_report', targetId: id, details: { from: r.status, to: input.status, resolution: input.resolution ?? null }, ip });
  });
}
