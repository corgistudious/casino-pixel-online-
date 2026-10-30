import { LB_BOARDS, legacyFrameId, reigningFrameId, tierOfPlace, type LbAwardView, type LbBoardDef } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '../db/client';
import { fail } from '../errors';
import { audit } from './audit';
import { grantItem } from './catalog';
import { entriesOf, previousMonth, rankBoard, type Bounds, type RankedRow } from './leaderboards';

/**
 * Closing a month: every rewarded board is ranked once more from server data, the result is stored
 * as an immutable snapshot, and the Top 3 (exact ties share a place) receive:
 *  - the board family's reigning frame for that place, valid until the end of the next month
 *    (it disappears by itself when the reign ends; the next close crowns the next holders);
 *  - the permanent Hall of Fame frame of that place (once per player, kept forever).
 * Everything for one board and month happens in one transaction guarded by an advisory lock and
 * the snapshot's primary key, so a retry, a second server or a restart can never award twice.
 * Nothing is awarded for a period that has not closed.
 */

const SNAPSHOT_ROWS = 100;
const MAX_AWARDED_ROWS = 9;

const nextMonthEnd = (b: Bounds) => new Date(Date.UTC(b.end!.getUTCFullYear(), b.end!.getUTCMonth() + 1, 1));

async function recipients(tx: Tx, def: LbBoardDef, row: RankedRow): Promise<string[]> {
  if (def.subject === 'player') return [row.id];
  const members = await tx.execute<{ user_id: string }>(sql`SELECT user_id FROM guild_members WHERE guild_id = ${row.id}::uuid`);
  return members.map((m) => m.user_id);
}

export async function finalizeBoard(db: Db, def: LbBoardDef, b: Bounds, now = new Date()): Promise<{ finalized: boolean; awarded: number }> {
  if (!def.reward || !def.active) return { finalized: false, awarded: 0 };
  if (!b.end || b.end.getTime() > now.getTime()) throw fail('bad_request', 'period not closed');
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`lb:${def.id}:${b.key}`}))`);
    const [done] = await tx.execute(sql`SELECT 1 FROM leaderboard_snapshots WHERE board_id = ${def.id} AND period_key = ${b.key}`);
    if (done) return { finalized: false, awarded: 0 };
    const rows = await rankBoard(tx, def, b);
    const entries = await entriesOf(tx, def, rows.slice(0, SNAPSHOT_ROWS));
    const snapshot = entries.map((e) => ({
      position: e.position,
      value: e.value,
      detail: e.detail ?? {},
      ...(e.player ? { uid: e.player.uid, displayName: e.player.displayName } : {}),
      ...(e.guild ? { guildId: e.guild.id, guildName: e.guild.name } : {}),
    }));
    await tx.execute(sql`INSERT INTO leaderboard_snapshots (board_id, period_key, starts_at, ends_at, entries)
      VALUES (${def.id}, ${b.key}, ${b.start?.toISOString() ?? null}::timestamptz, ${b.end!.toISOString()}::timestamptz, ${JSON.stringify(snapshot)}::jsonb)`);
    let awarded = 0;
    const until = nextMonthEnd(b);
    for (const row of rows.filter((r) => r.position <= 3).slice(0, MAX_AWARDED_ROWS)) {
      const tier = tierOfPlace(row.position)!;
      const reigning = reigningFrameId(def.reward!, tier);
      const legacy = legacyFrameId(tier);
      for (const userId of await recipients(tx, def, row)) {
        const [inserted] = await tx.execute(sql`
          INSERT INTO leaderboard_awards (board_id, period_key, user_id, place, metric, reigning_item, reigning_until, legacy_item)
          VALUES (${def.id}, ${b.key}, ${userId}::uuid, ${row.position}, ${row.value}, ${reigning}, ${until.toISOString()}::timestamptz, ${legacy})
          ON CONFLICT (board_id, period_key, user_id) DO NOTHING RETURNING id`);
        if (!inserted) continue;
        await grantItem(tx, userId, reigning, 'leaderboard', `${def.id}:${b.key}`, until);
        await grantItem(tx, userId, legacy, 'leaderboard', `${def.id}:${b.key}`);
        awarded++;
      }
    }
    await audit(tx, { action: 'leaderboard.finalize', targetType: 'leaderboard', targetId: `${def.id}:${b.key}`, details: { awarded, entries: snapshot.length } });
    return { finalized: true, awarded };
  });
}

/** Closes last month for every rewarded board that has not been closed yet (safe to call every minute). */
export async function finalizeClosedPeriods(db: Db, now = new Date()) {
  const b = previousMonth(now);
  const out: { board: string; period: string; awarded: number }[] = [];
  for (const def of LB_BOARDS.filter((d) => d.reward && d.active)) {
    const r = await finalizeBoard(db, def, b, now);
    if (r.finalized) out.push({ board: def.id, period: b.key, awarded: r.awarded });
  }
  return out;
}

export async function playerAwards(db: DbOrTx, userId: string): Promise<LbAwardView[]> {
  const rows = await db.execute<{ board_id: string; period_key: string; place: number; metric: string; reigning_item: string | null; reigning_until: Date | null; legacy_item: string | null; created_at: Date }>(sql`
    SELECT board_id, period_key, place, metric, reigning_item, reigning_until, legacy_item, created_at FROM leaderboard_awards WHERE user_id = ${userId}::uuid ORDER BY created_at DESC LIMIT 100`);
  return rows.map((r) => ({
    board: r.board_id,
    periodKey: r.period_key,
    place: r.place,
    value: Number(r.metric),
    reigningItem: r.reigning_item,
    reigningUntil: r.reigning_until ? new Date(r.reigning_until).toISOString() : null,
    legacyItem: r.legacy_item,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** Frames given for a tournament placement unless the tournament configures its own items. */
export const TOURNAMENT_FRAMES = {
  champion: 'tour_champion',
  runnerUp: 'tour_runner_up',
  top3: 'tour_top3',
  top10: 'tour_top10',
  participant: 'tour_participant',
  special: 'tour_special',
} as const;

export function tournamentFrameFor(placement: number, rewards: Partial<Record<keyof typeof TOURNAMENT_FRAMES, string>> = {}): string {
  const pick = (k: keyof typeof TOURNAMENT_FRAMES) => rewards[k] ?? TOURNAMENT_FRAMES[k];
  if (placement === 1) return pick('champion');
  if (placement === 2) return pick('runnerUp');
  if (placement === 3) return pick('top3');
  if (placement <= 10) return pick('top10');
  return pick('participant');
}

/**
 * Records a finished tournament's confirmed placements and gives its frames, once. For the
 * tournament engine to call when a tournament ends; refuses running/future/cancelled tournaments
 * and a second confirmation.
 */
export async function finalizeTournament(db: Db, actorId: string | null, tournamentId: string, placements: { userId: string; placement: number; points: number }[], now = new Date()) {
  return db.transaction(async (tx) => {
    const [t] = await tx.execute<{ id: string; status: string; ends_at: Date; confirmed_at: Date | null; rewards: Record<string, string> }>(sql`
      SELECT id, status, ends_at, confirmed_at, rewards FROM tournaments WHERE id = ${tournamentId}::uuid FOR UPDATE`);
    if (!t) throw fail('not_found');
    if (t.confirmed_at || t.status === 'finished') throw fail('already_owned');
    if (t.status === 'cancelled' || new Date(t.ends_at).getTime() > now.getTime()) throw fail('bad_request', 'tournament not finished');
    const seen = new Set<string>();
    for (const p of placements) {
      if (seen.has(p.userId) || p.placement < 1 || p.points < 0) throw fail('bad_request');
      seen.add(p.userId);
      const item = tournamentFrameFor(p.placement, t.rewards ?? {});
      await tx.execute(sql`INSERT INTO tournament_results (tournament_id, user_id, placement, points, reward_item) VALUES (${tournamentId}::uuid, ${p.userId}::uuid, ${p.placement}, ${p.points}, ${item})`);
      await grantItem(tx, p.userId, item, 'tournament', `tournament:${tournamentId}`);
    }
    await tx.execute(sql`UPDATE tournaments SET status = 'finished', confirmed_at = now() WHERE id = ${tournamentId}::uuid`);
    await audit(tx, { actorId, action: 'tournament.finalize', targetType: 'tournament', targetId: tournamentId, details: { players: placements.length } });
    return { results: placements.length };
  });
}
