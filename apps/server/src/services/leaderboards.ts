import {
  boardById,
  DEFAULT_FRAME,
  LB_GAMES,
  WIN_RATE_MIN_ROUNDS,
  type GuildColor,
  type GuildEmblem,
  type LbBoardDef,
  type LbBoardView,
  type LbEntry,
  type LbPeriod,
  type PlayerGameStatView,
  type LbGame,
} from '@casino/shared';
import { sql, type SQL } from 'drizzle-orm';
import { playableSql } from '../auth/accountRules';
import type { DbOrTx } from '../db/client';
import { fail } from '../errors';
import { activeSeason, rankBadges } from './rank';
import { CARD_COLUMNS, CARD_JOIN, toCard, type CardRow } from './social';

/**
 * Leaderboards over trusted server data only. Game boards read player_game_stats /
 * player_game_daily (maintained by a trigger on settled game_rounds), never game history and never
 * anything the client sends. Every board is ranked in one SQL statement: three sort keys, all
 * descending, and RANK() so exact ties share a place. Results are cached briefly per board, period
 * and bounds so opening the page does not hit PostgreSQL each time.
 */

export interface Bounds {
  period: LbPeriod;
  start: Date | null;
  end: Date | null;
  /** Stable id of the period: D2026-10-30, W2026-10-26 (its Monday), M2026-10, S3, ALL. */
  key: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** UTC bounds of the period containing `now`; null when the period does not exist (no active season). */
export async function periodBounds(db: DbOrTx, period: LbPeriod, now = new Date()): Promise<Bounds | null> {
  const day = utcDay(now);
  if (period === 'all') return { period, start: null, end: null, key: 'ALL' };
  if (period === 'day') return { period, start: day, end: new Date(day.getTime() + 86_400_000), key: `D${iso(day)}` };
  if (period === 'week') {
    const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86_400_000);
    return { period, start: monday, end: new Date(monday.getTime() + 7 * 86_400_000), key: `W${iso(monday)}` };
  }
  if (period === 'month') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { period, start, end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)), key: `M${iso(start).slice(0, 7)}` };
  }
  const season = await activeSeason(db);
  if (!season) return null;
  return { period, start: new Date(season.startsAt), end: new Date(season.endsAt), key: `S${season.id}` };
}

/** Bounds of the month before the one containing `now` (the period that closes at a month change). */
export function previousMonth(now = new Date()): Bounds {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { period: 'month', start, end, key: `M${iso(start).slice(0, 7)}` };
}

const ELIGIBLE = sql`${playableSql('u')} AND u.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM bans b WHERE b.user_id = u.id AND b.revoked_at IS NULL AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now()))`;
const epoch = (col: SQL) => sql`coalesce(extract(epoch FROM ${col}), 0)`;

/** Each query returns: id, value, detail (jsonb), m1, m2, m3 — all sort keys descending. */
function playerQuery(def: LbBoardDef, b: Bounds, game?: LbGame): SQL | null {
  const g = def.game ?? game;
  const start = b.start;
  const end = b.end;
  const inDays = start && end ? sql`d.day >= ${iso(start)}::date AND d.day < ${iso(end)}::date` : sql`true`;
  const inTime = (col: SQL) => (start && end ? sql`${col} >= ${start.toISOString()}::timestamptz AND ${col} < ${end.toISOString()}::timestamptz` : sql`true`);
  const daily = (select: SQL, having: SQL) =>
    sql`SELECT d.user_id AS id, ${select} FROM player_game_daily d WHERE d.game = ${g!} AND ${inDays} GROUP BY d.user_id HAVING ${having}`;
  switch (def.metric) {
    case 'wins':
      return b.period === 'all'
        ? sql`SELECT s.user_id AS id, s.wins AS value, jsonb_build_object('played', s.played) AS detail, s.wins AS m1, -s.played AS m2, 0 AS m3 FROM player_game_stats s WHERE s.game = ${g!} AND s.wins > 0`
        : daily(sql`sum(d.wins) AS value, jsonb_build_object('played', sum(d.played)) AS detail, sum(d.wins) AS m1, -sum(d.played) AS m2, 0 AS m3`, sql`sum(d.wins) > 0`);
    case 'best_streak':
      return b.period === 'all'
        ? sql`SELECT s.user_id AS id, s.best_streak AS value, '{}'::jsonb AS detail, s.best_streak AS m1, -${epoch(sql`s.best_streak_at`)} AS m2, 0 AS m3 FROM player_game_stats s WHERE s.game = ${g!} AND s.best_streak > 0`
        : daily(sql`max(d.best_streak) AS value, '{}'::jsonb AS detail, max(d.best_streak) AS m1, sum(d.wins) AS m2, 0 AS m3`, sql`max(d.best_streak) > 0`);
    case 'current_streak':
      return sql`SELECT s.user_id AS id, s.current_streak AS value, '{}'::jsonb AS detail, s.current_streak AS m1, -${epoch(sql`s.last_result_at`)} AS m2, 0 AS m3 FROM player_game_stats s WHERE s.game = ${g!} AND s.current_streak > 0`;
    case 'win_rate': {
      const rate = (w: SQL, p: SQL) => sql`round(100.0 * ${w} / nullif(${p}, 0), 2)`;
      return b.period === 'all'
        ? sql`SELECT s.user_id AS id, ${rate(sql`s.wins`, sql`s.played`)} AS value, jsonb_build_object('wins', s.wins, 'played', s.played) AS detail, ${rate(sql`s.wins`, sql`s.played`)} AS m1, s.played AS m2, 0 AS m3 FROM player_game_stats s WHERE s.game = ${g!} AND s.played >= ${WIN_RATE_MIN_ROUNDS}`
        : daily(
            sql`${rate(sql`sum(d.wins)`, sql`sum(d.played)`)} AS value, jsonb_build_object('wins', sum(d.wins), 'played', sum(d.played)) AS detail, ${rate(sql`sum(d.wins)`, sql`sum(d.played)`)} AS m1, sum(d.played) AS m2, 0 AS m3`,
            sql`sum(d.played) >= ${WIN_RATE_MIN_ROUNDS}`,
          );
    }
    case 'played':
      return b.period === 'all'
        ? sql`SELECT s.user_id AS id, s.played AS value, '{}'::jsonb AS detail, s.played AS m1, s.wins AS m2, 0 AS m3 FROM player_game_stats s WHERE s.game = ${g!} AND s.played > 0`
        : daily(sql`sum(d.played) AS value, '{}'::jsonb AS detail, sum(d.played) AS m1, sum(d.wins) AS m2, 0 AS m3`, sql`sum(d.played) > 0`);
    case 'activity':
      return b.period === 'all'
        ? sql`SELECT s.user_id AS id, sum(s.played) AS value, '{}'::jsonb AS detail, sum(s.played) AS m1, sum(s.wins) AS m2, 0 AS m3 FROM player_game_stats s GROUP BY s.user_id HAVING sum(s.played) > 0`
        : sql`SELECT d.user_id AS id, sum(d.played) AS value, '{}'::jsonb AS detail, sum(d.played) AS m1, count(DISTINCT d.day) AS m2, 0 AS m3 FROM player_game_daily d WHERE ${inDays} GROUP BY d.user_id HAVING sum(d.played) > 0`;
    case 'level':
      return sql`SELECT p.user_id AS id, p.level AS value, '{}'::jsonb AS detail, p.level AS m1, p.exp AS m2, -${epoch(sql`p.updated_at`)} AS m3 FROM player_progress p WHERE p.exp > 0`;
    case 'vip':
      return sql`SELECT v.user_id AS id, keyo_vip_level(v.exp, v.override_level, v.override_until) AS value, '{}'::jsonb AS detail,
        keyo_vip_level(v.exp, v.override_level, v.override_until) AS m1, v.exp AS m2, -${epoch(sql`v.updated_at`)} AS m3 FROM vip_progress v`;
    case 'charm_total':
      return sql`SELECT c.user_id AS id, c.total AS value, '{}'::jsonb AS detail, c.total AS m1, -${epoch(sql`c.updated_at`)} AS m2, 0 AS m3 FROM charm_points c WHERE c.total > 0`;
    case 'charm_received':
      // Gifts minus reversals; manual corrections by staff are not "received".
      return sql`SELECT l.user_id AS id, sum(l.delta) AS value, '{}'::jsonb AS detail, sum(l.delta) AS m1, count(*) FILTER (WHERE l.reason = 'gift') AS m2, 0 AS m3
        FROM charm_ledger l WHERE l.reason IN ('gift', 'gift_reversal') AND ${inTime(sql`l.created_at`)} GROUP BY l.user_id HAVING sum(l.delta) > 0`;
    case 'likes':
      return sql`SELECT l.profile_id AS id, count(*) AS value, '{}'::jsonb AS detail, count(*) AS m1, 0 AS m2, 0 AS m3
        FROM profile_likes l JOIN users x ON x.id = l.liker_id WHERE x.status <> 'deleted' AND ${inTime(sql`l.created_at`)} GROUP BY l.profile_id`;
    case 'followers':
      return sql`SELECT f.followee_id AS id, count(*) AS value, '{}'::jsonb AS detail, count(*) AS m1, 0 AS m2, 0 AS m3
        FROM player_follows f JOIN users x ON x.id = f.follower_id WHERE x.status <> 'deleted' AND ${inTime(sql`f.created_at`)} GROUP BY f.followee_id`;
    case 'featured':
      return sql`SELECT t.id, sum(t.n) AS value, jsonb_build_object('likes', sum(t.likes), 'followers', sum(t.n) - sum(t.likes)) AS detail, sum(t.n) AS m1, sum(t.likes) AS m2, 0 AS m3 FROM (
          SELECT l.profile_id AS id, 1 AS n, 1 AS likes FROM profile_likes l JOIN users x ON x.id = l.liker_id WHERE x.status <> 'deleted' AND ${inTime(sql`l.created_at`)}
          UNION ALL
          SELECT f.followee_id, 1, 0 FROM player_follows f JOIN users x ON x.id = f.follower_id WHERE x.status <> 'deleted' AND ${inTime(sql`f.created_at`)}
        ) t GROUP BY t.id`;
    case 'tournament_titles':
    case 'tournament_top3':
    case 'tournament_points': {
      const done = sql`t.status = 'finished' AND t.confirmed_at IS NOT NULL ${g ? sql`AND t.game = ${g}` : sql``} AND ${inTime(sql`t.ends_at`)}`;
      const titles = sql`count(*) FILTER (WHERE r.placement = 1)`;
      const top3 = sql`count(*) FILTER (WHERE r.placement <= 3)`;
      const [value, m2, m3] =
        def.metric === 'tournament_titles' ? [titles, top3, sql`sum(r.points)`] : def.metric === 'tournament_top3' ? [top3, titles, sql`sum(r.points)`] : [sql`sum(r.points)`, titles, top3];
      return sql`SELECT r.user_id AS id, ${value} AS value, '{}'::jsonb AS detail, ${value} AS m1, ${m2} AS m2, ${m3} AS m3
        FROM tournament_results r JOIN tournaments t ON t.id = r.tournament_id WHERE ${done} GROUP BY r.user_id HAVING ${value} > 0`;
    }
    case 'missions':
      return sql`SELECT q.user_id AS id, count(*) AS value, '{}'::jsonb AS detail, count(*) AS m1, -${epoch(sql`max(q.created_at)`)} AS m2, 0 AS m3
        FROM quest_claims q WHERE ${inTime(sql`q.created_at`)} GROUP BY q.user_id`;
    case 'achievements':
      return sql`SELECT a.user_id AS id, count(*) AS value, '{}'::jsonb AS detail, count(*) AS m1, -${epoch(sql`max(a.claimed_at)`)} AS m2, 0 AS m3 FROM achievement_claims a GROUP BY a.user_id`;
    case 'collection':
      return sql`SELECT i.user_id AS id, count(DISTINCT i.item_id) AS value, '{}'::jsonb AS detail, count(DISTINCT i.item_id) AS m1, 0 AS m2, 0 AS m3
        FROM inventory_items i WHERE i.item_id <> ${DEFAULT_FRAME} AND (i.expires_at IS NULL OR i.expires_at > now()) GROUP BY i.user_id`;
    default:
      return null;
  }
}

function guildQuery(def: LbBoardDef, b: Bounds): SQL | null {
  const inTime = (col: SQL) => (b.start && b.end ? sql`${col} >= ${b.start.toISOString()}::timestamptz AND ${col} < ${b.end.toISOString()}::timestamptz` : sql`true`);
  if (def.metric === 'guild_points') {
    return b.period === 'all'
      ? sql`SELECT g.id, g.points AS value, '{}'::jsonb AS detail, g.points AS m1, -${epoch(sql`g.created_at`)} AS m2, 0 AS m3 FROM guilds g WHERE g.disbanded_at IS NULL AND g.points > 0`
      : sql`SELECT e.guild_id AS id, sum(e.points) AS value, '{}'::jsonb AS detail, sum(e.points) AS m1, count(DISTINCT e.user_id) AS m2, 0 AS m3
          FROM guild_win_events e JOIN guilds g ON g.id = e.guild_id WHERE g.disbanded_at IS NULL AND ${inTime(sql`e.created_at`)} GROUP BY e.guild_id`;
  }
  if (def.metric === 'guild_active' && b.start && b.end) {
    // Members who finished at least one ranked-game round this week.
    return sql`SELECT m.guild_id AS id, count(DISTINCT m.user_id) AS value, '{}'::jsonb AS detail, count(DISTINCT m.user_id) AS m1, coalesce(sum(d.played), 0) AS m2, 0 AS m3
      FROM guild_members m JOIN guilds g ON g.id = m.guild_id
      JOIN player_game_daily d ON d.user_id = m.user_id AND d.day >= ${iso(b.start)}::date AND d.day < ${iso(b.end)}::date
      WHERE g.disbanded_at IS NULL GROUP BY m.guild_id`;
  }
  return null;
}

export interface RankedRow {
  id: string;
  position: number;
  value: number;
  detail: Record<string, number>;
}

/** The full ranking of a board for a period (eligible players / active guilds only). */
export async function rankBoard(db: DbOrTx, def: LbBoardDef, b: Bounds, game?: LbGame): Promise<RankedRow[]> {
  if (!def.active) return [];
  const inner = def.subject === 'player' ? playerQuery(def, b, game) : guildQuery(def, b);
  if (!inner) return [];
  const rows =
    def.subject === 'player'
      ? await db.execute<{ id: string; position: string; value: string; detail: Record<string, string> }>(sql`
          SELECT x.id, x.value, x.detail, RANK() OVER (ORDER BY x.m1 DESC, x.m2 DESC, x.m3 DESC) AS position
          FROM (${inner}) x JOIN users u ON u.id = x.id
          WHERE ${ELIGIBLE}
          ORDER BY position, u.uid`)
      : await db.execute<{ id: string; position: string; value: string; detail: Record<string, string> }>(sql`
          SELECT x.id, x.value, x.detail, RANK() OVER (ORDER BY x.m1 DESC, x.m2 DESC, x.m3 DESC) AS position
          FROM (${inner}) x JOIN guilds g ON g.id = x.id ORDER BY position, g.name`);
  return rows.map((r) => ({
    id: r.id,
    position: Number(r.position),
    value: Number(r.value),
    detail: Object.fromEntries(Object.entries(r.detail ?? {}).map(([k, v]) => [k, Number(v)])),
  }));
}

const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; rows: RankedRow[] }>();

async function cachedRanking(db: DbOrTx, def: LbBoardDef, b: Bounds, game?: LbGame, fresh = false): Promise<RankedRow[]> {
  const key = `${def.id}|${b.key}|${game ?? ''}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const rows = await rankBoard(db, def, b, game);
  cache.set(key, { at: Date.now(), rows });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return rows;
}

/** Test helper: forget cached rankings. */
export function clearLeaderboardCache() {
  cache.clear();
}

async function availablePeriods(db: DbOrTx, def: LbBoardDef): Promise<LbPeriod[]> {
  const season = def.periods.includes('season') ? await activeSeason(db) : null;
  return def.periods.filter((p) => p !== 'season' || !!season);
}

async function playerCards(db: DbOrTx, ids: string[]) {
  if (!ids.length) return new Map<string, ReturnType<typeof toCard>>();
  const rows = await db.execute<CardRow>(sql`SELECT ${CARD_COLUMNS} FROM users u ${CARD_JOIN} WHERE u.id = ANY(string_to_array(${ids.join(',')}, ',')::uuid[])`);
  const ranks = await rankBadges(db, ids);
  return new Map(
    rows.map((r) => {
      const card = toCard(r);
      const rank = ranks.get(r.user_id);
      return [r.user_id, { ...card, rank: rank ? { division: rank.division, topTitle: rank.topTitle } : (card.rank ?? null) }];
    }),
  );
}

async function guildCards(db: DbOrTx, ids: string[]) {
  if (!ids.length) return new Map<string, NonNullable<LbEntry['guild']>>();
  const rows = await db.execute<{ id: string; name: string; emblem: string; color: string; members: number }>(sql`
    SELECT g.id, g.name, g.emblem, g.color, (SELECT count(*)::int FROM guild_members m WHERE m.guild_id = g.id) AS members
    FROM guilds g WHERE g.id = ANY(string_to_array(${ids.join(',')}, ',')::uuid[])`);
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, emblem: r.emblem as GuildEmblem, color: r.color as GuildColor, members: Number(r.members) }]));
}

/** Turns ranked rows into entries with public cards only (no email, wallet or private data). */
export async function entriesOf(db: DbOrTx, def: LbBoardDef, rows: RankedRow[]): Promise<LbEntry[]> {
  const ids = rows.map((r) => r.id);
  if (def.subject === 'player') {
    const cards = await playerCards(db, ids);
    return rows.filter((r) => cards.has(r.id)).map((r) => ({ position: r.position, value: r.value, detail: r.detail, player: cards.get(r.id)! }));
  }
  const guilds = await guildCards(db, ids);
  return rows.filter((r) => guilds.has(r.id)).map((r) => ({ position: r.position, value: r.value, detail: r.detail, guild: guilds.get(r.id)! }));
}

export async function boardView(
  db: DbOrTx,
  meId: string | null,
  input: { board: string; period?: LbPeriod; offset?: number; limit?: number; game?: LbGame },
): Promise<LbBoardView> {
  const def = boardById(input.board);
  if (!def) throw fail('not_found');
  const periods = await availablePeriods(db, def);
  if (!periods.length) throw fail('not_found');
  const period = input.period && periods.includes(input.period) ? input.period : periods[0]!;
  const b = (await periodBounds(db, period))!;
  const game = def.group === 'tournament' && input.game && LB_GAMES.includes(input.game) ? input.game : undefined;
  const rows = await cachedRanking(db, def, b, game);
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  const page = rows.slice(offset, offset + limit);
  let mine: RankedRow | undefined;
  if (meId) {
    if (def.subject === 'player') mine = rows.find((r) => r.id === meId);
    else {
      const [m] = await db.execute<{ guild_id: string }>(sql`SELECT guild_id FROM guild_members WHERE user_id = ${meId}::uuid`);
      if (m) mine = rows.find((r) => r.id === m.guild_id);
    }
  }
  const entries = await entriesOf(db, def, page);
  const meEntry = mine ? ((await entriesOf(db, def, [mine]))[0] ?? null) : null;
  return {
    board: def.id,
    period,
    periods,
    startsAt: b.start?.toISOString() ?? null,
    endsAt: b.end?.toISOString() ?? null,
    total: rows.length,
    entries,
    me: meEntry,
    updatedAt: new Date().toISOString(),
  };
}

/** A player's per-game statistics (public: shown on profiles). */
export async function playerGameStats(db: DbOrTx, userId: string): Promise<PlayerGameStatView[]> {
  const rows = await db.execute<{ game: LbGame; played: number; wins: number; losses: number; pushes: number; current_streak: number; best_streak: number }>(sql`
    SELECT game, played, wins, losses, pushes, current_streak, best_streak FROM player_game_stats WHERE user_id = ${userId}::uuid ORDER BY game`);
  return rows.map((r) => ({ game: r.game, played: r.played, wins: r.wins, losses: r.losses, pushes: r.pushes, currentStreak: r.current_streak, bestStreak: r.best_streak }));
}

/**
 * Recomputes player_game_stats and player_game_daily from all settled game_rounds (operator
 * command, e.g. after deploying 0033 on a server that already has history). Real rows only: the
 * same win/push/loss rule as the trigger, streaks in settlement order. Idempotent.
 */
export async function rebuildGameStats(db: DbOrTx): Promise<{ players: number; rounds: number }> {
  await db.execute(sql`LOCK TABLE player_game_stats, player_game_daily IN EXCLUSIVE MODE`);
  await db.execute(sql`DELETE FROM player_game_daily`);
  await db.execute(sql`DELETE FROM player_game_stats`);
  const [n] = await db.execute<{ rounds: string }>(sql`
    WITH r AS (
      SELECT gr.user_id, keyo_board_game(gr.game) AS game, coalesce(gr.settled_at, gr.created_at) AS at, gr.id,
        CASE WHEN gr.payout > gr.bet THEN 'win' WHEN gr.payout = gr.bet THEN 'push' ELSE 'loss' END AS outcome
      FROM game_rounds gr WHERE gr.status = 'settled' AND gr.bet > 0 AND keyo_board_game(gr.game) IS NOT NULL
    ), seq AS (
      -- Streak groups: a new group starts after every loss; pushes stay in the group but add nothing.
      SELECT r.*, sum(CASE WHEN outcome = 'loss' THEN 1 ELSE 0 END) OVER (PARTITION BY user_id, game ORDER BY at, id) AS grp FROM r
    ), streak AS (
      SELECT seq.*, CASE WHEN outcome = 'loss' THEN 0 ELSE sum(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) OVER (PARTITION BY user_id, game, grp ORDER BY at, id) END AS run FROM seq
    ), daily AS (
      INSERT INTO player_game_daily (user_id, game, day, played, wins, losses, pushes, best_streak)
      SELECT user_id, game, (at AT TIME ZONE 'UTC')::date, count(*), count(*) FILTER (WHERE outcome = 'win'), count(*) FILTER (WHERE outcome = 'loss'),
        count(*) FILTER (WHERE outcome = 'push'), max(CASE WHEN outcome = 'win' THEN run ELSE 0 END)
      FROM streak GROUP BY 1, 2, 3 RETURNING played
    ), totals AS (
      INSERT INTO player_game_stats (user_id, game, played, wins, losses, pushes, current_streak, best_streak, best_streak_at, last_result_at)
      SELECT s.user_id, s.game, count(*), count(*) FILTER (WHERE outcome = 'win'), count(*) FILTER (WHERE outcome = 'loss'), count(*) FILTER (WHERE outcome = 'push'),
        (array_agg(s.run ORDER BY s.at DESC, s.id DESC))[1],
        max(s.run),
        (SELECT min(x.at) FROM streak x WHERE x.user_id = s.user_id AND x.game = s.game AND x.run = max(s.run) AND x.outcome = 'win'),
        max(s.at)
      FROM streak s GROUP BY s.user_id, s.game RETURNING played
    )
    SELECT (SELECT coalesce(sum(played), 0) FROM totals) AS rounds`);
  const [p] = await db.execute<{ n: string }>(sql`SELECT count(DISTINCT user_id) AS n FROM player_game_stats`);
  return { players: Number(p!.n), rounds: Number(n!.rounds) };
}
