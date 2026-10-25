import {
  applyRankResult,
  DEFAULT_RANK_RULES,
  DIVISIONS,
  demotionRisk,
  INITIAL_RANK,
  isProtected,
  MAX_DIVISION,
  RP_PER_DIVISION,
  seriesActive,
  softReset,
  TOP_TITLE_LIMIT,
  topEligible,
  topTitleFor,
  type MailAttachment,
  type ProgressView,
  type RankLadderEntry,
  type RankRules,
  type RankState,
  type TopTitleId,
} from '@casino/shared';
import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '../db/client';
import { playerRanks, rankEvents, rankSeasonResults, rankSeasons, users } from '../db/schema';
import { fail } from '../errors';
import { deliverReward } from './rewards';

type SeasonRow = typeof rankSeasons.$inferSelect;
type RankRow = typeof playerRanks.$inferSelect;

export interface SeasonRewards {
  /** Reward for the final main rank (bronze … wargod). */
  tiers: Partial<Record<string, MailAttachment[]>>;
  /** Extra reward for the final Top title. */
  top: Partial<Record<TopTitleId, MailAttachment[]>>;
}

export const rulesOf = (s: Pick<SeasonRow, 'rules'>): RankRules => ({ ...DEFAULT_RANK_RULES, ...(s.rules as Partial<RankRules>) });
const stateOf = (r: RankRow): RankState => ({ division: r.division, rp: r.rp, streak: r.streak });

export async function activeSeason(db: DbOrTx): Promise<SeasonRow | undefined> {
  const [row] = await db.select().from(rankSeasons).where(eq(rankSeasons.status, 'active'));
  return row;
}

/** Players present in the ladder: active player accounts that are not banned. */
const ladderMember = sql`EXISTS (SELECT 1 FROM users u WHERE u.id = ${playerRanks.userId} AND u.account_type = 'player' AND u.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM bans b WHERE b.user_id = u.id AND b.revoked_at IS NULL AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now())))`;

/**
 * The player's row for the season, created on first use. A new season starts from the soft reset
 * of the player's last finished season (public rule: RankRules.softResetDivisions lower, 0 RP).
 */
async function lockPlayerRank(tx: Tx, season: SeasonRow, userId: string): Promise<RankRow> {
  const [existing] = await tx.select().from(playerRanks).where(and(eq(playerRanks.seasonId, season.id), eq(playerRanks.userId, userId))).for('update');
  if (existing) return existing;
  const [last] = await tx
    .select({ division: rankSeasonResults.division })
    .from(rankSeasonResults)
    .where(eq(rankSeasonResults.userId, userId))
    .orderBy(desc(rankSeasonResults.seasonId))
    .limit(1);
  const start = last ? softReset(last.division, rulesOf(season)) : INITIAL_RANK;
  await tx.insert(playerRanks).values({ seasonId: season.id, userId, division: start.division, rp: start.rp, streak: 0, peakDivision: start.division }).onConflictDoNothing();
  const [row] = await tx.select().from(playerRanks).where(and(eq(playerRanks.seasonId, season.id), eq(playerRanks.userId, userId))).for('update');
  return row!;
}

/** Top-50 position (eligible players only), or null. */
export async function topPosition(db: DbOrTx, seasonId: number, userId: string): Promise<number | null> {
  const [me] = await db.select().from(playerRanks).where(and(eq(playerRanks.seasonId, seasonId), eq(playerRanks.userId, userId)));
  if (!me || !topEligible(me)) return null;
  const [{ ahead }] = (await db.execute(sql`
    SELECT count(*)::int AS ahead FROM player_ranks pr JOIN users u ON u.id = pr.user_id
    WHERE pr.season_id = ${seasonId} AND pr.division = ${MAX_DIVISION} AND pr.rp >= ${RP_PER_DIVISION}
      AND u.account_type = 'player' AND u.status = 'active'
      AND (pr.rp > ${me.rp} OR (pr.rp = ${me.rp} AND (pr.rp_at < ${me.rpAt.toISOString()}::timestamptz OR (pr.rp_at = ${me.rpAt.toISOString()}::timestamptz AND u.uid < (SELECT uid FROM users WHERE id = ${userId})))))
      AND NOT EXISTS (SELECT 1 FROM bans b WHERE b.user_id = u.id AND b.revoked_at IS NULL AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now()))`)) as unknown as [{ ahead: number }];
  const position = ahead + 1;
  return position <= TOP_TITLE_LIMIT ? position : null;
}

async function writeChange(tx: Tx, season: SeasonRow, row: RankRow, next: RankState, ev: { matchKey: string; result: 'win' | 'loss' | 'adjust'; promoted: boolean; demoted: boolean; actorId?: string | null; note?: string | null }) {
  const rpChanged = next.rp !== row.rp || next.division !== row.division;
  await tx
    .update(playerRanks)
    .set({
      division: next.division,
      rp: next.rp,
      streak: next.streak,
      wins: row.wins + (ev.result === 'win' ? 1 : 0),
      losses: row.losses + (ev.result === 'loss' ? 1 : 0),
      peakDivision: Math.max(row.peakDivision, next.division),
      rpAt: rpChanged ? new Date() : row.rpAt,
      updatedAt: new Date(),
    })
    .where(and(eq(playerRanks.seasonId, season.id), eq(playerRanks.userId, row.userId)));
  await tx.insert(rankEvents).values({
    seasonId: season.id,
    userId: row.userId,
    matchKey: ev.matchKey,
    result: ev.result,
    rpDelta: next.division * RP_PER_DIVISION + next.rp - (row.division * RP_PER_DIVISION + row.rp),
    divisionBefore: row.division,
    divisionAfter: next.division,
    rpBefore: row.rp,
    rpAfter: next.rp,
    streakAfter: next.streak,
    promoted: ev.promoted,
    demoted: ev.demoted,
    actorId: ev.actorId ?? null,
    note: ev.note ?? null,
  });
  if (topEligible(next)) {
    const pos = await topPosition(tx, season.id, row.userId);
    if (pos) await tx.execute(sql`UPDATE player_ranks SET peak_top_position = LEAST(coalesce(peak_top_position, ${pos}), ${pos}) WHERE season_id = ${season.id} AND user_id = ${row.userId}`);
  }
}

export interface RankedResult {
  userId: string;
  result: 'win' | 'loss';
}

/**
 * Records the outcome of one ranked match for every participant, in one transaction. Called by
 * the game engines when a ranked match settles. `matchKey` makes it exactly-once per player: a
 * replayed or concurrent call changes nothing. Rows are locked in a fixed order (no deadlocks).
 */
export async function recordRankedMatch(db: Db, matchKey: string, results: RankedResult[]): Promise<{ userId: string; applied: boolean; after: RankState }[]> {
  return db.transaction(async (tx) => {
    const season = await activeSeason(tx);
    if (!season) throw fail('season_inactive');
    const rules = rulesOf(season);
    const out: { userId: string; applied: boolean; after: RankState }[] = [];
    for (const r of [...results].sort((a, b) => a.userId.localeCompare(b.userId))) {
      const row = await lockPlayerRank(tx, season, r.userId);
      const [dup] = await tx
        .select({ id: rankEvents.id })
        .from(rankEvents)
        .where(and(eq(rankEvents.seasonId, season.id), eq(rankEvents.userId, r.userId), eq(rankEvents.matchKey, matchKey)));
      if (dup) {
        out.push({ userId: r.userId, applied: false, after: stateOf(row) });
        continue;
      }
      const change = applyRankResult(stateOf(row), r.result, rules);
      await writeChange(tx, season, row, change.after, { matchKey, result: r.result, promoted: change.promoted, demoted: change.demoted });
      out.push({ userId: r.userId, applied: true, after: change.after });
    }
    return out;
  });
}

/** Staff correction by an RP amount on the whole ladder (series progress resets). */
export async function adjustRank(tx: Tx, userId: string, rpDelta: number, actorId: string, note: string, key: string): Promise<RankState> {
  const season = await activeSeason(tx);
  if (!season) throw fail('season_inactive');
  const row = await lockPlayerRank(tx, season, userId);
  const total = Math.max(0, row.division * RP_PER_DIVISION + row.rp + rpDelta);
  const division = Math.min(MAX_DIVISION, Math.floor(total / RP_PER_DIVISION));
  let rp = total - division * RP_PER_DIVISION;
  if (division < MAX_DIVISION) rp = Math.min(rp, RP_PER_DIVISION - 1);
  const next = { division, rp, streak: 0 };
  await writeChange(tx, season, row, next, { matchKey: `admin:${key}`, result: 'adjust', promoted: division > row.division, demoted: division < row.division, actorId, note });
  return next;
}

export async function progressRank(db: DbOrTx, userId: string): Promise<ProgressView['rank']> {
  const season = await activeSeason(db);
  if (!season) return null;
  const rules = rulesOf(season);
  const [row] = await db.select().from(playerRanks).where(and(eq(playerRanks.seasonId, season.id), eq(playerRanks.userId, userId)));
  let state = row ? stateOf(row) : INITIAL_RANK;
  if (!row) {
    // Not played yet this season: show where the soft reset will place the player.
    const [last] = await db.select({ division: rankSeasonResults.division }).from(rankSeasonResults).where(eq(rankSeasonResults.userId, userId)).orderBy(desc(rankSeasonResults.seasonId)).limit(1);
    if (last) state = softReset(last.division, rules);
  }
  const position = row ? await topPosition(db, season.id, userId) : null;
  return {
    seasonId: season.id,
    seasonName: season.name,
    endsAt: season.endsAt.toISOString(),
    state,
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
    peakDivision: row?.peakDivision ?? state.division,
    seriesActive: seriesActive(state),
    demotionRisk: demotionRisk(state, rules),
    protected: isProtected(state.division),
    topPosition: position,
    topTitle: topTitleFor(position),
    rules,
  };
}

/** Season ladder: Top-eligible players first by RP (earliest wins ties, then lowest UID), then everyone by division and RP. */
export async function rankLadder(db: DbOrTx, seasonId: number, limit = 100): Promise<RankLadderEntry[]> {
  const rows = await db
    .select({ uid: users.uid, displayName: users.displayName, division: playerRanks.division, rp: playerRanks.rp, wins: playerRanks.wins, losses: playerRanks.losses })
    .from(playerRanks)
    .innerJoin(users, eq(users.id, playerRanks.userId))
    .where(and(eq(playerRanks.seasonId, seasonId), ladderMember))
    .orderBy(desc(playerRanks.division), desc(playerRanks.rp), asc(playerRanks.rpAt), asc(users.uid))
    .limit(limit);
  return rows.map((r, i) => {
    const position = i + 1;
    return { position, ...r, topTitle: topEligible(r) ? topTitleFor(position) : null };
  });
}

export async function rankHistory(db: DbOrTx, userId: string, limit = 50) {
  return db
    .select({
      id: rankEvents.id,
      seasonId: rankEvents.seasonId,
      result: rankEvents.result,
      rpDelta: rankEvents.rpDelta,
      divisionBefore: rankEvents.divisionBefore,
      divisionAfter: rankEvents.divisionAfter,
      rpAfter: rankEvents.rpAfter,
      streakAfter: rankEvents.streakAfter,
      promoted: rankEvents.promoted,
      demoted: rankEvents.demoted,
      note: rankEvents.note,
      createdAt: rankEvents.createdAt,
    })
    .from(rankEvents)
    .where(eq(rankEvents.userId, userId))
    .orderBy(desc(rankEvents.id))
    .limit(limit);
}

export async function mySeasonResults(db: DbOrTx, userId: string) {
  return db
    .select({ seasonId: rankSeasonResults.seasonId, name: rankSeasons.name, division: rankSeasonResults.division, rp: rankSeasonResults.rp, peakDivision: rankSeasonResults.peakDivision, topPosition: rankSeasonResults.topPosition, topTitle: rankSeasonResults.topTitle, peakTopPosition: rankSeasonResults.peakTopPosition, wins: rankSeasonResults.wins, losses: rankSeasonResults.losses, endedAt: rankSeasons.endedAt })
    .from(rankSeasonResults)
    .innerJoin(rankSeasons, eq(rankSeasons.id, rankSeasonResults.seasonId))
    .where(eq(rankSeasonResults.userId, userId))
    .orderBy(desc(rankSeasonResults.seasonId));
}

export const publicSeason = (s: SeasonRow) => ({ id: s.id, name: s.name, status: s.status, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), endedAt: s.endedAt?.toISOString() ?? null, rules: rulesOf(s) });

export async function listSeasons(db: DbOrTx) {
  return (await db.select().from(rankSeasons).orderBy(desc(rankSeasons.id))).map((s) => ({ ...publicSeason(s), rewards: s.rewards as SeasonRewards }));
}

/** Activates a scheduled season (only one can be active). */
export async function startSeason(tx: Tx, seasonId: number): Promise<SeasonRow> {
  if (await activeSeason(tx)) throw fail('season_active');
  const [row] = await tx.update(rankSeasons).set({ status: 'active' }).where(and(eq(rankSeasons.id, seasonId), eq(rankSeasons.status, 'scheduled'))).returning();
  if (!row) throw fail('not_found');
  return row;
}

/**
 * Ends the active season exactly once: freezes every player's final standing (with the Top-50
 * title), delivers tier and Top rewards by mail (keyed `season:<id>:tier|top`) and closes the
 * season. Levels are never touched. Players start the next season from the soft reset.
 */
export async function endSeason(tx: Tx, seasonId: number): Promise<{ players: number; rewardMails: number } | null> {
  const [season] = await tx.update(rankSeasons).set({ status: 'ended', endedAt: new Date() }).where(and(eq(rankSeasons.id, seasonId), eq(rankSeasons.status, 'active'))).returning();
  if (!season) return null;
  // Final positions, same order as the ladder; only eligible players inside the Top 50 get a title.
  await tx.execute(sql`
    INSERT INTO rank_season_results (season_id, user_id, division, rp, peak_division, top_position, top_title, peak_top_position, wins, losses)
    SELECT pr.season_id, pr.user_id, pr.division, pr.rp, pr.peak_division, t.pos,
      CASE WHEN t.pos <= 3 THEN 'vuong_gia' WHEN t.pos <= 10 THEN 'than_tuong' WHEN t.pos <= ${TOP_TITLE_LIMIT} THEN 'than_vuong' END,
      LEAST(pr.peak_top_position, t.pos), pr.wins, pr.losses
    FROM player_ranks pr
    LEFT JOIN (
      SELECT p.user_id, row_number() OVER (ORDER BY p.rp DESC, p.rp_at ASC, u.uid ASC) AS pos
      FROM player_ranks p JOIN users u ON u.id = p.user_id
      WHERE p.season_id = ${season.id} AND p.division = ${MAX_DIVISION} AND p.rp >= ${RP_PER_DIVISION}
        AND u.account_type = 'player' AND u.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM bans b WHERE b.user_id = u.id AND b.revoked_at IS NULL AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now()))
    ) t ON t.user_id = pr.user_id AND t.pos <= ${TOP_TITLE_LIMIT}
    WHERE pr.season_id = ${season.id}
    ON CONFLICT DO NOTHING`);

  const rewards = season.rewards as SeasonRewards;
  const results = await tx.select().from(rankSeasonResults).where(eq(rankSeasonResults.seasonId, season.id));
  let rewardMails = 0;
  for (const r of results) {
    const tier = DIVISIONS[r.division]!.tier;
    const tierReward = rewards.tiers?.[tier];
    if (tierReward?.length) {
      const id = await deliverReward(tx, {
        userId: r.userId,
        key: `season:${season.id}:tier`,
        kind: 'reward',
        text: {
          vi: { subject: `Thưởng mùa ${season.name}`, body: `Mùa ${season.name} đã kết thúc. Đây là phần thưởng cho hạng cuối mùa của bạn.` },
          en: { subject: `${season.name} season reward`, body: `Season ${season.name} has ended. Here is the reward for your final rank.` },
        },
        attachments: tierReward,
      });
      if (id) rewardMails += 1;
    }
    const topReward = r.topTitle ? rewards.top?.[r.topTitle as TopTitleId] : undefined;
    if (topReward?.length) {
      const id = await deliverReward(tx, {
        userId: r.userId,
        key: `season:${season.id}:top`,
        kind: 'reward',
        text: {
          vi: { subject: `Thưởng Top ${r.topPosition} mùa ${season.name}`, body: `Bạn kết thúc mùa ${season.name} ở vị trí Top ${r.topPosition}.` },
          en: { subject: `${season.name} Top ${r.topPosition} reward`, body: `You finished season ${season.name} at Top ${r.topPosition}.` },
        },
        attachments: topReward,
      });
      if (id) rewardMails += 1;
    }
  }
  return { players: results.length, rewardMails };
}

/** Starts due scheduled seasons and ends expired ones. Safe to run on every instance (guarded updates). */
export async function tickSeasons(db: Db): Promise<{ ended: number[]; started: number[] }> {
  const ended: number[] = [];
  const started: number[] = [];
  const now = new Date();
  const due = await db.select().from(rankSeasons).where(and(eq(rankSeasons.status, 'active'), lte(rankSeasons.endsAt, now)));
  for (const s of due) if (await db.transaction((tx) => endSeason(tx, s.id))) ended.push(s.id);
  const [next] = await db.select().from(rankSeasons).where(and(eq(rankSeasons.status, 'scheduled'), lte(rankSeasons.startsAt, now))).orderBy(asc(rankSeasons.startsAt)).limit(1);
  if (next && !(await activeSeason(db))) {
    try {
      await db.transaction((tx) => startSeason(tx, next.id));
      started.push(next.id);
    } catch {
      // Another instance started it first.
    }
  }
  return { ended, started };
}
