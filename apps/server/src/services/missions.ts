import { findMission, MISSION_RULES, MISSIONS, type MissionDef, type MissionMetric, type MissionsOverview, type MissionView } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { fail } from '../errors';
import { applyDelta } from './wallet';

/**
 * Missions (see @casino/shared missions.ts). Progress is read from settled game rounds and ranked
 * results, so only play the server already accepted counts. Claims are rows in quest_claims keyed
 * by (player, mission, period): the primary key makes a second claim impossible.
 */

interface Periods {
  dailyKey: string;
  dailyStart: string;
  dailyEnd: string;
  weeklyKey: string;
  weeklyStart: string;
  weeklyEnd: string;
  seasonId: number | null;
  seasonStart: string | null;
  seasonEnd: string | null;
}

async function periods(db: DbOrTx): Promise<Periods> {
  const [p] = await db.execute<{
    daily_key: string;
    daily_start: string;
    weekly_key: string;
    weekly_start: string;
    season_id: number | null;
    season_start: string | null;
    season_end: string | null;
  }>(sql`
    SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS daily_key,
           (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::text AS daily_start,
           to_char(now() AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS weekly_key,
           (date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::text AS weekly_start,
           s.id AS season_id, s.starts_at::text AS season_start, s.ends_at::text AS season_end
    FROM (SELECT 1) one
    LEFT JOIN LATERAL (SELECT id, starts_at, ends_at FROM rank_seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1) s ON true`);
  const day = new Date(p!.daily_start);
  const week = new Date(p!.weekly_start);
  return {
    dailyKey: p!.daily_key,
    dailyStart: day.toISOString(),
    dailyEnd: new Date(day.getTime() + 86_400_000).toISOString(),
    weeklyKey: p!.weekly_key,
    weeklyStart: week.toISOString(),
    weeklyEnd: new Date(week.getTime() + 7 * 86_400_000).toISOString(),
    seasonId: p!.season_id === null ? null : Number(p!.season_id),
    seasonStart: p!.season_start ? new Date(p!.season_start).toISOString() : null,
    seasonEnd: p!.season_end ? new Date(p!.season_end).toISOString() : null,
  };
}

function window(def: MissionDef, p: Periods): { key: string | null; start: string | null; end: string | null } {
  if (def.period === 'daily') return { key: p.dailyKey, start: p.dailyStart, end: p.dailyEnd };
  if (def.period === 'weekly') return { key: p.weeklyKey, start: p.weeklyStart, end: p.weeklyEnd };
  return p.seasonId === null ? { key: null, start: null, end: null } : { key: `S${p.seasonId}`, start: p.seasonStart, end: p.seasonEnd };
}

/** One query per distinct (metric, window start) for this player. */
async function metric(db: DbOrTx, userId: string, m: MissionMetric, since: string, seasonId: number | null): Promise<number> {
  switch (m) {
    case 'rounds':
    case 'wins':
    case 'wager':
    case 'card_hands': {
      const [r] = await db.execute<{ rounds: number; wins: number; wager: string; cards: number }>(sql`
        SELECT count(*)::int AS rounds, count(*) FILTER (WHERE payout > bet)::int AS wins, coalesce(sum(bet), 0) AS wager,
               count(*) FILTER (WHERE game IN ('poker', 'lieng', 'xito'))::int AS cards
        FROM game_rounds WHERE user_id = ${userId}::uuid AND status = 'settled' AND settled_at >= ${since}::timestamptz`);
      return m === 'rounds' ? r!.rounds : m === 'wins' ? r!.wins : m === 'wager' ? Number(r!.wager) : r!.cards;
    }
    case 'ranked_matches':
    case 'ranked_wins': {
      if (seasonId === null) return 0;
      // A match the player forfeited (left or AFK) never counts towards a mission.
      const [r] = await db.execute<{ matches: number; wins: number }>(sql`
        SELECT count(*) FILTER (WHERE e.result IN ('win', 'loss'))::int AS matches, count(*) FILTER (WHERE e.result = 'win')::int AS wins
        FROM rank_events e
        WHERE e.user_id = ${userId}::uuid AND e.season_id = ${seasonId} AND e.created_at >= ${since}::timestamptz
          AND NOT EXISTS (SELECT 1 FROM ranked_matches rm WHERE 'card:' || rm.id::text = e.match_key AND rm.forfeit_id = e.user_id)`);
      return m === 'ranked_matches' ? r!.matches : r!.wins;
    }
    case 'peak_division': {
      if (seasonId === null) return 0;
      const [r] = await db.execute<{ peak: number }>(sql`SELECT peak_division AS peak FROM player_ranks WHERE user_id = ${userId}::uuid AND season_id = ${seasonId}`);
      return r ? Number(r.peak) : 0;
    }
  }
}

async function progressOf(db: DbOrTx, userId: string, def: MissionDef, p: Periods): Promise<number> {
  const w = window(def, p);
  if (!w.start) return 0;
  return metric(db, userId, def.metric, w.start, p.seasonId);
}

async function vipWeek(db: DbOrTx, userId: string, weeklyStart: string) {
  const [r] = await db.execute<{ granted: number; exp: string | null }>(sql`
    SELECT coalesce((SELECT sum(vip_exp) FROM quest_claims WHERE user_id = ${userId}::uuid AND created_at >= ${weeklyStart}::timestamptz), 0)::int AS granted,
           (SELECT exp FROM vip_progress WHERE user_id = ${userId}::uuid) AS exp`);
  return { granted: r!.granted, exp: Number(r!.exp ?? 0) };
}

export async function missionsOverview(db: Db, userId: string): Promise<MissionsOverview> {
  const p = await periods(db);
  const claims = await db.execute<{ quest_id: string; period_key: string }>(sql`SELECT quest_id, period_key FROM quest_claims WHERE user_id = ${userId}::uuid`);
  const claimed = new Set(claims.map((c) => `${c.quest_id}|${c.period_key}`));
  const cache = new Map<string, Promise<number>>();
  const missions = await Promise.all(
    MISSIONS.map(async (def): Promise<MissionView> => {
      const w = window(def, p);
      const cacheKey = `${def.metric}|${w.start}`;
      if (!cache.has(cacheKey)) cache.set(cacheKey, progressOf(db, userId, def, p));
      const progress = await cache.get(cacheKey)!;
      return { ...def, progress, claimed: w.key !== null && claimed.has(`${def.id}|${w.key}`), resetsAt: w.end, unavailable: w.key === null };
    }),
  );
  const vip = await vipWeek(db, userId, p.weeklyStart);
  return { missions, vip: { exp: vip.exp, weekGranted: vip.granted, weekCap: MISSION_RULES.vipExpWeeklyCap } };
}

/**
 * Claims one mission for the current period: re-checks progress inside the transaction, records the
 * claim (unique per period), then pays through the ledger. VIP EXP is trimmed to the weekly cap.
 */
export async function claimMission(db: Db, userId: string, id: string) {
  const def = findMission(id);
  if (!def) throw fail('not_found');
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`);
    const p = await periods(tx);
    const w = window(def, p);
    if (!w.key) throw fail('season_inactive');
    if ((await progressOf(tx, userId, def, p)) < def.target) throw fail('mission_incomplete');
    let vipExp = def.reward.vipExp ?? 0;
    if (vipExp > 0) {
      const week = await vipWeek(tx, userId, p.weeklyStart);
      vipExp = Math.max(0, Math.min(vipExp, MISSION_RULES.vipExpWeeklyCap - week.granted));
    }
    const inserted = await tx.execute(sql`
      INSERT INTO quest_claims (user_id, quest_id, period_key, reward, vip_exp)
      VALUES (${userId}::uuid, ${def.id}, ${w.key}, ${JSON.stringify(def.reward)}::jsonb, ${vipExp})
      ON CONFLICT DO NOTHING RETURNING quest_id`);
    if (!inserted.length) throw fail('already_claimed');
    const ref = `quest:${def.id}:${w.key}`;
    if (def.reward.silver) await applyDelta(tx, userId, def.reward.silver, 'quest_reward', null, 'silver', ref);
    if (def.reward.gold) await applyDelta(tx, userId, def.reward.gold, 'quest_reward', null, 'gold', ref);
    if (vipExp > 0) {
      await tx.execute(sql`
        INSERT INTO vip_progress (user_id, exp) VALUES (${userId}::uuid, ${vipExp})
        ON CONFLICT (user_id) DO UPDATE SET exp = vip_progress.exp + excluded.exp, updated_at = now()`);
    }
    return { reward: { ...def.reward, vipExp } };
  });
}
