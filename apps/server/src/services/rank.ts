import {
  addMonths,
  applyRankResult,
  bracketFor,
  bundleCurrency,
  DEFAULT_PARTICIPATION,
  DEFAULT_RANK_RULES,
  OFFICIAL_SEASON_REWARDS,
  resolveDurations,
  SEASON_BRACKETS,
  SEASON_LENGTH_MONTHS,
  type ParticipationRules,
  type SeasonBracket,
  type SeasonRewards,
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
  type RankBadge,
  type RankLadderEntry,
  type RankRules,
  type RankState,
} from '@casino/shared';
import { and, asc, count, desc, eq, lte, sql } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '../db/client';
import { playerRanks, rankEvents, rankSeasonResults, rankSeasons, rewardFlags, seasonRewards, users } from '../db/schema';
import { fail } from '../errors';
import { deliverReward } from './rewards';
import { applyDelta } from './wallet';
import { playableSql } from '../auth/accountRules';

type SeasonRow = typeof rankSeasons.$inferSelect;
type RankRow = typeof playerRanks.$inferSelect;

export const rulesOf = (s: Pick<SeasonRow, 'rules'>): RankRules => ({ ...DEFAULT_RANK_RULES, ...(s.rules as Partial<RankRules>) });
export const participationOf = (s: Pick<SeasonRow, 'participation'>): ParticipationRules => ({ ...DEFAULT_PARTICIPATION, ...(s.participation as Partial<ParticipationRules>) });
export const rewardsOf = (s: Pick<SeasonRow, 'rewards'>): SeasonRewards => {
  const r = s.rewards as Partial<SeasonRewards> | null;
  return r?.brackets ? (r as SeasonRewards) : { brackets: OFFICIAL_SEASON_REWARDS };
};
const stateOf = (r: RankRow): RankState => ({ division: r.division, rp: r.rp, streak: r.streak });

export async function activeSeason(db: DbOrTx): Promise<SeasonRow | undefined> {
  const [row] = await db.select().from(rankSeasons).where(eq(rankSeasons.status, 'active'));
  return row;
}

/** Players present in the ladder: active player accounts that are not banned or disqualified. */
const ladderMember = sql`NOT ${playerRanks.disqualified} AND EXISTS (SELECT 1 FROM users u WHERE u.id = ${playerRanks.userId} AND ${playableSql()} AND u.status = 'active'
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

/** Top-50 position among MAX Thần Thoại players (the only ones who can hold a Top title), or null. */
export async function topPosition(db: DbOrTx, seasonId: number, userId: string): Promise<number | null> {
  const [me] = await db.select().from(playerRanks).where(and(eq(playerRanks.seasonId, seasonId), eq(playerRanks.userId, userId)));
  if (!me || me.disqualified || !topEligible(me)) return null;
  const [{ ahead }] = (await db.execute(sql`
    SELECT count(*)::int AS ahead FROM player_ranks pr JOIN users u ON u.id = pr.user_id
    WHERE pr.season_id = ${seasonId} AND pr.division = ${MAX_DIVISION} AND pr.rp >= ${RP_PER_DIVISION} AND NOT pr.disqualified
      AND ${playableSql()} AND u.status = 'active'
      AND (pr.rp > ${me.rp} OR (pr.rp = ${me.rp} AND (pr.rp_at < ${me.rpAt.toISOString()}::timestamptz OR (pr.rp_at = ${me.rpAt.toISOString()}::timestamptz AND u.uid < (SELECT uid FROM users WHERE id = ${userId})))))
      AND NOT EXISTS (SELECT 1 FROM bans b WHERE b.user_id = u.id AND b.revoked_at IS NULL AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now()))`)) as unknown as [{ ahead: number }];
  const position = ahead + 1;
  return position <= TOP_TITLE_LIMIT ? position : null;
}

interface ChangeMeta {
  matchKey: string;
  result: 'win' | 'loss' | 'adjust';
  promoted: boolean;
  demoted: boolean;
  actorId?: string | null;
  note?: string | null;
  opponentIds?: string[];
  rewardSilver?: number;
}

async function writeChange(tx: Tx, season: SeasonRow, row: RankRow, next: RankState, ev: ChangeMeta) {
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
    opponentIds: ev.opponentIds ?? [],
    rewardSilver: ev.rewardSilver ?? 0,
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
  /** Set by the game engine when the player was away (auto-played): rank still counts, no Cxu reward. */
  afk?: boolean;
}

export interface RankedOutcome {
  userId: string;
  applied: boolean;
  after: RankState;
  /** Participation reward paid (Cxu Bạc), 0 when none. */
  reward: number;
}

/** Players registered from the same IP (multi-account farming signal). */
async function sharedRegistrationIp(tx: Tx, a: string, b: string): Promise<boolean> {
  const [row] = (await tx.execute(sql`
    SELECT 1 AS hit FROM audit_logs x JOIN audit_logs y ON y.ip = x.ip AND y.action = 'account.register' AND y.actor_id = ${b}
    WHERE x.action = 'account.register' AND x.actor_id = ${a} AND x.ip IS NOT NULL LIMIT 1`)) as unknown as { hit: number }[];
  return !!row;
}

/**
 * Decides the participation reward for one player of a valid match and why it may be withheld.
 * Rank changes are never affected by this; only the Cxu reward is.
 */
async function participationReward(tx: Tx, season: SeasonRow, r: RankedResult, opponents: string[], matchKey: string): Promise<number> {
  const p = participationOf(season);
  const amount = p.playSilver + (r.result === 'win' ? p.winSilver : 0);
  if (amount <= 0) return 0;
  const flag = (kind: string, details: object) => tx.insert(rewardFlags).values({ userId: r.userId, kind, seasonId: season.id, matchKey, details });
  if (r.afk) {
    await flag('afk', {});
    return 0;
  }
  for (const o of opponents) {
    if (await sharedRegistrationIp(tx, r.userId, o)) {
      await flag('shared_ip', { opponent: o });
      return 0;
    }
  }
  const today = sql`${rankEvents.createdAt} >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
  const rewardedToday = (await tx
    .select({ n: count() })
    .from(rankEvents)
    .where(and(eq(rankEvents.userId, r.userId), sql`${rankEvents.rewardSilver} > 0`, today)))[0]!.n;
  if (rewardedToday >= p.dailyMatchCap) {
    await flag('daily_cap', { rewardedToday });
    return 0;
  }
  if (opponents.length) {
    const samePair = (await tx
      .select({ n: count() })
      .from(rankEvents)
      .where(and(eq(rankEvents.userId, r.userId), sql`${rankEvents.rewardSilver} > 0`, sql`${rankEvents.opponentIds} && ${sql`ARRAY[${sql.join(opponents.map((o) => sql`${o}`), sql`, `)}]::uuid[]`}`, today)))[0]!.n;
    if (samePair >= p.samePairDailyCap) {
      await flag('same_opponent', { samePair, opponents });
      return 0;
    }
  }
  await applyDelta(tx, r.userId, amount, 'rank_reward', null, 'silver', `rank:${season.id}:${matchKey}`);
  return amount;
}

/**
 * Records the outcome of one valid, completed ranked match for every participant, in one
 * transaction (cancelled or invalid matches are simply never recorded). Called by the game engines
 * when a ranked match settles. `matchKey` makes it exactly-once per player: a replayed or
 * concurrent call changes nothing and pays nothing. Rows are locked in a fixed order (no
 * deadlocks). Participation rewards go through the ledger with anti-farming caps.
 */
export async function recordRankedMatch(db: Db, matchKey: string, results: RankedResult[]): Promise<RankedOutcome[]> {
  return db.transaction(async (tx) => {
    const season = await activeSeason(tx);
    if (!season) throw fail('season_inactive');
    const rules = rulesOf(season);
    const out: RankedOutcome[] = [];
    for (const r of [...results].sort((a, b) => a.userId.localeCompare(b.userId))) {
      const row = await lockPlayerRank(tx, season, r.userId);
      const [dup] = await tx
        .select({ id: rankEvents.id })
        .from(rankEvents)
        .where(and(eq(rankEvents.seasonId, season.id), eq(rankEvents.userId, r.userId), eq(rankEvents.matchKey, matchKey)));
      if (dup) {
        out.push({ userId: r.userId, applied: false, after: stateOf(row), reward: 0 });
        continue;
      }
      const opponents = results.filter((x) => x.userId !== r.userId).map((x) => x.userId);
      const change = applyRankResult(stateOf(row), r.result, rules);
      const reward = await participationReward(tx, season, r, opponents, matchKey);
      await writeChange(tx, season, row, change.after, { matchKey, result: r.result, promoted: change.promoted, demoted: change.demoted, opponentIds: opponents, rewardSilver: reward });
      out.push({ userId: r.userId, applied: true, after: change.after, reward });
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
    participation: (({ playSilver, winSilver, dailyMatchCap }) => ({ playSilver, winSilver, dailyMatchCap }))(participationOf(season)),
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

export const publicSeason = (s: SeasonRow) => ({
  id: s.id,
  name: s.name,
  status: s.status,
  startsAt: s.startsAt.toISOString(),
  endsAt: s.endsAt.toISOString(),
  endedAt: s.endedAt?.toISOString() ?? null,
  rules: rulesOf(s),
  autoRollover: s.autoRollover,
});

export async function listSeasons(db: DbOrTx) {
  return (await db.select().from(rankSeasons).orderBy(desc(rankSeasons.id))).map((s) => ({ ...publicSeason(s), rewards: rewardsOf(s), participation: participationOf(s) }));
}

/** Activates a scheduled season (only one can be active). */
export async function startSeason(tx: Tx, seasonId: number): Promise<SeasonRow> {
  if (await activeSeason(tx)) throw fail('season_active');
  const [row] = await tx.update(rankSeasons).set({ status: 'active' }).where(and(eq(rankSeasons.id, seasonId), eq(rankSeasons.status, 'scheduled'))).returning();
  if (!row) throw fail('not_found');
  return row;
}

/** Final Top position among eligible, non-disqualified players (same order as the ladder). */
const topRankingSql = (seasonId: number) => sql`
  SELECT p.user_id, row_number() OVER (ORDER BY p.rp DESC, p.rp_at ASC, u.uid ASC) AS pos
  FROM player_ranks p JOIN users u ON u.id = p.user_id
  WHERE p.season_id = ${seasonId} AND p.division = ${MAX_DIVISION} AND p.rp >= ${RP_PER_DIVISION} AND NOT p.disqualified
    AND ${playableSql()} AND u.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM bans b WHERE b.user_id = u.id AND b.revoked_at IS NULL AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now()))`;

/**
 * Who earns a season reward: active player accounts (never system accounts), not banned, not
 * disqualified for verified cheating, with at least one valid ranked match this season.
 */
const rewardEligibleSql = sql`(r.wins + r.losses) > 0
  AND NOT pr.disqualified
  AND ${playableSql()} AND u.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM bans b WHERE b.user_id = u.id AND b.revoked_at IS NULL AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now()))`;

export interface EndSeasonResult {
  players: number;
  rewards: number;
  silver: number;
  gold: number;
  nextSeasonId: number | null;
}

/**
 * Ends the active season exactly once (guarded status update), in one transaction:
 * 1. closes the season, so no further match result can be credited to it;
 * 2. freezes every player's final standing with the Top-50 title;
 * 3. writes one immutable reward record per eligible player (bracket Top 1 / 2 / 3 / 4–10 /
 *    11–50 / rest); timed items expire 60 days after the NEXT season starts, not when claimed;
 * 4. opens the next 2-month season (unless one is scheduled), whose players start from the soft reset.
 * Mail delivery happens after commit (deliverSeasonRewards) and is retried until it succeeds.
 * Levels, EXP, Cxu, bank, VIP and inventories are never touched.
 */
export async function endSeason(tx: Tx, seasonId: number): Promise<EndSeasonResult | null> {
  const now = new Date();
  const [season] = await tx.update(rankSeasons).set({ status: 'ended', endedAt: now }).where(and(eq(rankSeasons.id, seasonId), eq(rankSeasons.status, 'active'))).returning();
  if (!season) return null;
  await tx.execute(sql`
    INSERT INTO rank_season_results (season_id, user_id, division, rp, peak_division, top_position, top_title, peak_top_position, wins, losses)
    SELECT pr.season_id, pr.user_id, pr.division, pr.rp, pr.peak_division, t.pos,
      CASE WHEN t.pos <= 3 THEN 'vuong_gia' WHEN t.pos <= 10 THEN 'than_tuong' WHEN t.pos <= ${TOP_TITLE_LIMIT} THEN 'than_vuong' END,
      LEAST(pr.peak_top_position, t.pos), pr.wins, pr.losses
    FROM player_ranks pr
    LEFT JOIN (${topRankingSql(season.id)}) t ON t.user_id = pr.user_id AND t.pos <= ${TOP_TITLE_LIMIT}
    WHERE pr.season_id = ${season.id}
    ON CONFLICT DO NOTHING`);

  // The next season: a scheduled one if the Owner prepared it, otherwise an automatic 2-month season.
  const [scheduled] = await tx.select().from(rankSeasons).where(eq(rankSeasons.status, 'scheduled')).orderBy(asc(rankSeasons.startsAt)).limit(1);
  let nextSeasonId: number | null = null;
  let nextStart = new Date(Math.min(now.getTime(), season.endsAt.getTime()));
  if (scheduled) nextStart = new Date(Math.max(scheduled.startsAt.getTime(), nextStart.getTime()));
  else if (season.autoRollover) {
    const n = (await tx.select({ n: count() }).from(rankSeasons))[0]!.n;
    const [next] = await tx
      .insert(rankSeasons)
      .values({
        name: `Mùa ${n + 1}`,
        status: 'active',
        startsAt: nextStart,
        endsAt: addMonths(nextStart, SEASON_LENGTH_MONTHS),
        rules: season.rules,
        rewards: rewardsOf(season),
        participation: season.participation,
        autoRollover: true,
        createdBy: null,
      })
      .returning();
    nextSeasonId = next!.id;
  }

  const brackets = rewardsOf(season).brackets;
  const eligible = (await tx.execute(sql`
    SELECT r.user_id, r.top_position FROM rank_season_results r
    JOIN player_ranks pr ON pr.season_id = r.season_id AND pr.user_id = r.user_id
    JOIN users u ON u.id = r.user_id
    WHERE r.season_id = ${season.id} AND ${rewardEligibleSql}`)) as unknown as { user_id: string; top_position: number | null }[];
  let rewards = 0;
  let silver = 0;
  let gold = 0;
  for (const e of eligible) {
    const bracket = bracketFor(e.top_position);
    const attachments = resolveDurations(brackets[bracket] ?? [], nextStart);
    if (!attachments.length) continue;
    const c = bundleCurrency(attachments);
    await tx.insert(seasonRewards).values({ seasonId: season.id, userId: e.user_id, topPosition: e.top_position, bracket, attachments, silver: c.silver, gold: c.gold }).onConflictDoNothing();
    rewards += 1;
    silver += c.silver;
    gold += c.gold;
  }
  const players = (await tx.select({ n: count() }).from(rankSeasonResults).where(eq(rankSeasonResults.seasonId, season.id)))[0]!.n;
  return { players, rewards, silver, gold, nextSeasonId };
}

const BRACKET_LABEL: Record<SeasonBracket, { vi: string; en: string }> = {
  top1: { vi: 'Top 1 — Vương Giả', en: 'Top 1 — Sovereign' },
  top2: { vi: 'Top 2 — Vương Giả', en: 'Top 2 — Sovereign' },
  top3: { vi: 'Top 3 — Vương Giả', en: 'Top 3 — Sovereign' },
  top4_10: { vi: 'Top 4–10 — Thần Tướng', en: 'Top 4–10 — Divine General' },
  top11_50: { vi: 'Top 11–50 — Thần Vương', en: 'Top 11–50 — Divine Lord' },
  rest: { vi: 'Thưởng tham gia mùa', en: 'Season participation' },
};

/**
 * Mails every pending season reward. Each record is delivered in its own transaction with the key
 * `season:<id>:reward`, so a crash, a restart or two instances running at once can never deliver
 * twice, and a failure is retried on the next tick. Players do not need to be online.
 */
export async function deliverSeasonRewards(db: Db, limit = 500): Promise<{ delivered: number; failed: number }> {
  const pending = await db
    .select({ r: seasonRewards, name: rankSeasons.name })
    .from(seasonRewards)
    .innerJoin(rankSeasons, eq(rankSeasons.id, seasonRewards.seasonId))
    .where(eq(seasonRewards.status, 'pending'))
    .limit(limit);
  let delivered = 0;
  let failed = 0;
  for (const { r, name } of pending) {
    const label = BRACKET_LABEL[r.bracket as SeasonBracket] ?? BRACKET_LABEL.rest;
    const expiry = (r.attachments as MailAttachment[]).find((a) => a.type === 'item' && a.expiresAt);
    const until = expiry && expiry.type === 'item' ? expiry.expiresAt! : null;
    try {
      await db.transaction(async (tx) => {
        const key = `season:${r.seasonId}:reward`;
        let mailId = await deliverReward(tx, {
          userId: r.userId,
          key,
          kind: 'reward',
          text: {
            vi: {
              subject: `Thưởng mùa ${name}: ${label.vi}`,
              body: `Mùa ${name} đã kết thúc. ${r.topPosition ? `Bạn xếp hạng Top ${r.topPosition}.` : 'Cảm ơn bạn đã tham gia Đấu Rank.'}${until ? ` Vật phẩm Vương Giả có hiệu lực đến ${new Date(until).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (giờ Việt Nam), kể cả khi bạn nhận thư muộn.` : ''}`,
            },
            en: {
              subject: `${name} season reward: ${label.en}`,
              body: `Season ${name} has ended. ${r.topPosition ? `You finished Top ${r.topPosition}.` : 'Thank you for playing ranked.'}${until ? ` Sovereign items are valid until ${new Date(until).toUTCString()}, even if you claim this mail later.` : ''}`,
            },
          },
          attachments: r.attachments as MailAttachment[],
        });
        if (!mailId) {
          const [m] = (await tx.execute(sql`SELECT id FROM mail_messages WHERE user_id = ${r.userId} AND reward_key = ${key}`)) as unknown as { id: string }[];
          mailId = m?.id ?? null;
        }
        await tx.update(seasonRewards).set({ status: 'delivered', mailId, deliveredAt: new Date(), attempts: r.attempts + 1, lastError: null }).where(and(eq(seasonRewards.seasonId, r.seasonId), eq(seasonRewards.userId, r.userId)));
      });
      delivered += 1;
    } catch (err) {
      failed += 1;
      await db
        .update(seasonRewards)
        .set({ attempts: r.attempts + 1, lastError: String((err as Error).message ?? err).slice(0, 500) })
        .where(and(eq(seasonRewards.seasonId, r.seasonId), eq(seasonRewards.userId, r.userId), eq(seasonRewards.status, 'pending')));
    }
  }
  return { delivered, failed };
}

/** Expected issuance if the season ended now (admin preview). */
export async function seasonProjection(db: DbOrTx, seasonId: number) {
  const [season] = await db.select().from(rankSeasons).where(eq(rankSeasons.id, seasonId));
  if (!season) throw fail('not_found');
  const rows = (await db.execute(sql`
    SELECT t.pos FROM player_ranks r
    JOIN player_ranks pr ON pr.season_id = r.season_id AND pr.user_id = r.user_id
    JOIN users u ON u.id = r.user_id
    LEFT JOIN (${topRankingSql(seasonId)}) t ON t.user_id = r.user_id AND t.pos <= ${TOP_TITLE_LIMIT}
    WHERE r.season_id = ${seasonId} AND ${rewardEligibleSql}`)) as unknown as { pos: number | null }[];
  const brackets = rewardsOf(season).brackets;
  const perBracket = SEASON_BRACKETS.map((b) => {
    const players = rows.filter((r) => bracketFor(r.pos ? Number(r.pos) : null) === b.id).length;
    const c = bundleCurrency(brackets[b.id] ?? []);
    return { bracket: b.id, players, silver: c.silver * players, gold: c.gold * players, attachments: brackets[b.id] ?? [] };
  });
  return {
    eligible: rows.length,
    perBracket,
    silver: perBracket.reduce((s, b) => s + b.silver, 0),
    gold: perBracket.reduce((s, b) => s + b.gold, 0),
  };
}

/** Reward records of a season with delivery state, and the Cxu actually issued (audit). */
export async function seasonRewardReport(db: DbOrTx, seasonId: number) {
  const records = await db
    .select({
      uid: users.uid,
      displayName: users.displayName,
      topPosition: seasonRewards.topPosition,
      bracket: seasonRewards.bracket,
      attachments: seasonRewards.attachments,
      silver: seasonRewards.silver,
      gold: seasonRewards.gold,
      status: seasonRewards.status,
      attempts: seasonRewards.attempts,
      lastError: seasonRewards.lastError,
      deliveredAt: seasonRewards.deliveredAt,
      claimedAt: sql<string | null>`(SELECT claimed_at FROM mail_messages m WHERE m.id = ${seasonRewards.mailId})`,
    })
    .from(seasonRewards)
    .innerJoin(users, eq(users.id, seasonRewards.userId))
    .where(eq(seasonRewards.seasonId, seasonId))
    .orderBy(sql`${seasonRewards.topPosition} ASC NULLS LAST`, asc(users.uid));
  const [issued] = (await db.execute(sql`
    SELECT coalesce(sum(silver), 0)::bigint AS silver, coalesce(sum(gold), 0)::bigint AS gold FROM season_rewards WHERE season_id = ${seasonId}`)) as unknown as { silver: string; gold: string }[];
  const [claimed] = (await db.execute(sql`
    SELECT coalesce(sum(CASE WHEN currency = 'silver' THEN delta END), 0)::bigint AS silver, coalesce(sum(CASE WHEN currency = 'gold' THEN delta END), 0)::bigint AS gold
    FROM ledger_entries WHERE reason = 'mail' AND ref IN (SELECT 'mail:' || mail_id FROM season_rewards WHERE season_id = ${seasonId} AND mail_id IS NOT NULL)`)) as unknown as { silver: string; gold: string }[];
  const [participation] = (await db.execute(sql`
    SELECT coalesce(sum(delta), 0)::bigint AS silver FROM ledger_entries WHERE reason = 'rank_reward' AND ref LIKE ${`rank:${seasonId}:%`}`)) as unknown as { silver: string }[];
  return {
    records,
    totals: {
      planned: { silver: Number(issued!.silver), gold: Number(issued!.gold) },
      claimed: { silver: Number(claimed!.silver), gold: Number(claimed!.gold) },
      participationSilver: Number(participation!.silver),
    },
  };
}

/** Verified cheating: removes the player from the ladder, Top titles and season rewards (or restores them). */
export async function setDisqualified(tx: Tx, seasonId: number, userId: string, disqualified: boolean, reason: string) {
  const [row] = await tx
    .update(playerRanks)
    .set({ disqualified, disqualifiedReason: disqualified ? reason : null, updatedAt: new Date() })
    .where(and(eq(playerRanks.seasonId, seasonId), eq(playerRanks.userId, userId)))
    .returning();
  if (!row) throw fail('not_found');
  return row;
}

export async function recentRewardFlags(db: DbOrTx, limit = 100) {
  return db
    .select({ id: rewardFlags.id, uid: users.uid, displayName: users.displayName, kind: rewardFlags.kind, seasonId: rewardFlags.seasonId, matchKey: rewardFlags.matchKey, details: rewardFlags.details, createdAt: rewardFlags.createdAt })
    .from(rewardFlags)
    .innerJoin(users, eq(users.id, rewardFlags.userId))
    .orderBy(desc(rewardFlags.id))
    .limit(limit);
}

/** Starts due scheduled seasons and ends expired ones. Safe to run on every instance (guarded updates). */
export async function tickSeasons(db: Db): Promise<{ ended: number[]; started: number[] }> {
  const ended: number[] = [];
  const started: number[] = [];
  const now = new Date();
  const due = await db.select().from(rankSeasons).where(and(eq(rankSeasons.status, 'active'), lte(rankSeasons.endsAt, now)));
  for (const s of due) if (await db.transaction((tx) => endSeason(tx, s.id))) ended.push(s.id);
  // Deliver new and previously failed season rewards (never twice).
  await deliverSeasonRewards(db);
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

/**
 * Current-season rank of each player for lists (friends, rooms, profiles). Top titles come from the
 * same ranking as the ladder: only MAX Thần Thoại players inside the Top 50 get one.
 */
export async function rankBadges(db: DbOrTx, userIds: string[]): Promise<Map<string, RankBadge & { rp: number; position: number | null; wins: number; losses: number }>> {
  const out = new Map<string, RankBadge & { rp: number; position: number | null; wins: number; losses: number }>();
  if (!userIds.length) return out;
  const season = await activeSeason(db);
  if (!season) return out;
  const rows = await db.execute<{ user_id: string; division: number; rp: number; wins: number; losses: number; pos: string | null }>(sql`
    SELECT pr.user_id, pr.division, pr.rp, pr.wins, pr.losses, t.pos
    FROM player_ranks pr
    LEFT JOIN (${topRankingSql(season.id)}) t ON t.user_id = pr.user_id AND t.pos <= ${TOP_TITLE_LIMIT}
    WHERE pr.season_id = ${season.id} AND pr.user_id::text = ANY(string_to_array(${userIds.join(',')}, ','))`);
  for (const r of rows) {
    const position = r.pos === null ? null : Number(r.pos);
    out.set(r.user_id, { division: Number(r.division), rp: Number(r.rp), wins: Number(r.wins), losses: Number(r.losses), position, topTitle: topTitleFor(position) });
  }
  return out;
}
