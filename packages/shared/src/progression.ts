/**
 * Account level (1–999) and ranked play. Pure rules shared by the server (which owns every
 * change) and the client (which only displays them).
 */

// ---------------------------------------------------------------- level

export const LEVEL_MAX = 999;

/** EXP needed to go from `level` to `level + 1` (grows linearly: 100, 110, 120 …). */
export function expToNext(level: number): number {
  if (level >= LEVEL_MAX) return 0;
  return 100 + 10 * (level - 1);
}

/** Total EXP at which `level` is reached (level 1 = 0). */
export function totalExpForLevel(level: number): number {
  const l = Math.min(Math.max(1, Math.floor(level)), LEVEL_MAX) - 1;
  return 100 * l + 5 * l * (l - 1);
}

export interface LevelInfo {
  level: number;
  totalExp: number;
  /** EXP earned inside the current level. */
  intoLevel: number;
  /** EXP the current level needs (0 at the cap). */
  needed: number;
}

export function levelFromExp(totalExp: number): LevelInfo {
  const exp = Math.max(0, Math.floor(totalExp));
  let lo = 1;
  let hi = LEVEL_MAX;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (totalExpForLevel(mid) <= exp) lo = mid;
    else hi = mid - 1;
  }
  const level = lo;
  return { level, totalExp: exp, intoLevel: level >= LEVEL_MAX ? 0 : exp - totalExpForLevel(level), needed: expToNext(level) };
}

/** EXP is capped at the total of level 999: nothing above it is stored. */
export const EXP_MAX = totalExpForLevel(LEVEL_MAX);

/**
 * Gameplay EXP for one settled round. It depends on playing, not on wealth: a flat amount with a
 * small bonus for a meaningful stake, and a daily cap so farming tiny bets does not pay.
 */
export const GAMEPLAY_EXP = { perRound: 10, bonusMinBet: 1_000, bonus: 5, dailyCap: 3_000 } as const;

export function gameplayExp(bet: number): number {
  return GAMEPLAY_EXP.perRound + (bet >= GAMEPLAY_EXP.bonusMinBet ? GAMEPLAY_EXP.bonus : 0);
}

// ---------------------------------------------------------------- rank

export const RANK_TIERS = [
  { id: 'bronze', divisions: 3 },
  { id: 'silver', divisions: 3 },
  { id: 'gold', divisions: 4 },
  { id: 'platinum', divisions: 5 },
  { id: 'diamond', divisions: 5 },
  { id: 'star', divisions: 5 },
  { id: 'master', divisions: 5 },
  { id: 'legend', divisions: 5 },
  { id: 'wargod', divisions: 5 },
] as const;
export type RankTierId = (typeof RANK_TIERS)[number]['id'];

export interface Division {
  /** 0 = Đồng III … 39 = Chiến Thần I. */
  index: number;
  tier: RankTierId;
  tierIndex: number;
  /** Roman numeral shown after the tier name (I is the highest). */
  roman: number;
}

export const DIVISIONS: readonly Division[] = RANK_TIERS.flatMap((t, tierIndex) =>
  Array.from({ length: t.divisions }, (_, i) => ({ tier: t.id, tierIndex, roman: t.divisions - i })),
).map((d, index) => ({ ...d, index }));

export const DIVISION_COUNT = DIVISIONS.length; // 40
export const MAX_DIVISION = DIVISION_COUNT - 1;
export const RP_PER_DIVISION = 200;

const lastOf = (tier: RankTierId) => DIVISIONS.filter((d) => d.tier === tier).at(-1)!.index;

/** Đồng III … Vàng I: losses never cost RP or a division. */
export const PROTECTED_MAX_DIVISION = lastOf('gold');

/** Divisions whose promotion also needs a 3-win streak (Bạch Kim I → Kim Cương V, …, Huyền Thoại I → Chiến Thần V). */
export const SERIES_DIVISIONS: readonly number[] = (['platinum', 'diamond', 'star', 'master', 'legend'] as const).map(lastOf);
export const SERIES_WINS = 3;

export const TOP_TITLES = [
  { id: 'vuong_gia', from: 1, to: 3 },
  { id: 'than_tuong', from: 4, to: 10 },
  { id: 'than_vuong', from: 11, to: 50 },
] as const;
export type TopTitleId = (typeof TOP_TITLES)[number]['id'];
export const TOP_TITLE_LIMIT = 50;

export function topTitleFor(position: number | null): TopTitleId | null {
  if (!position) return null;
  return TOP_TITLES.find((t) => position >= t.from && position <= t.to)?.id ?? null;
}

export interface RankRules {
  winRp: number;
  lossRp: number;
  /** Divisions dropped at the start of the next season (RP restarts at 0). */
  softResetDivisions: number;
}
export const DEFAULT_RANK_RULES: RankRules = { winRp: 25, lossRp: 20, softResetDivisions: 5 };

export interface RankState {
  division: number;
  /** RP inside the division (0–200; above 200 only at Chiến Thần I, where it is the ladder score). */
  rp: number;
  /** Wins of the current promotion series (0–3), only while RP is full on a series division. */
  streak: number;
}

export const requiresSeries = (division: number) => SERIES_DIVISIONS.includes(division);
export const isProtected = (division: number) => division <= PROTECTED_MAX_DIVISION;
export const seriesActive = (s: RankState) => requiresSeries(s.division) && s.rp >= RP_PER_DIVISION;
/** Eligible for the server-wide Top 50 (Vương Giả / Thần Tướng / Thần Vương): a full Chiến Thần I. */
export const topEligible = (s: Pick<RankState, 'division' | 'rp'>) => s.division === MAX_DIVISION && s.rp >= RP_PER_DIVISION;
/** A loss right now would cost a division. */
export const demotionRisk = (s: RankState, rules: RankRules = DEFAULT_RANK_RULES) => !isProtected(s.division) && s.rp - rules.lossRp < 0;

export interface RankChange {
  before: RankState;
  after: RankState;
  rpDelta: number;
  promoted: boolean;
  demoted: boolean;
  /** A running promotion series was lost (loss or demotion). */
  seriesReset: boolean;
}

/**
 * Applies one ranked match result.
 * - Every division needs 200 RP; RP carries over after a normal promotion.
 * - On a series division RP stops at 200; from then on each win counts towards 3 in a row, and
 *   the third promotes (RP restarts at 0). A loss resets the streak and costs RP as usual.
 * - Đồng III – Vàng I are protected: a loss changes nothing. From Bạch Kim V a loss costs RP and
 *   can drop a division (Bạch Kim V → Vàng I, where protection applies again).
 * - At Chiến Thần I RP keeps growing: it is the score of the Top 50 ladder.
 */
export function applyRankResult(state: RankState, result: 'win' | 'loss', rules: RankRules = DEFAULT_RANK_RULES): RankChange {
  const before = { ...state };
  let { division, rp, streak } = state;
  let promoted = false;
  let demoted = false;
  let seriesReset = false;

  if (result === 'win') {
    if (division === MAX_DIVISION) rp += rules.winRp;
    else if (requiresSeries(division) && rp >= RP_PER_DIVISION) {
      streak += 1;
      if (streak >= SERIES_WINS) {
        division += 1;
        rp = 0;
        streak = 0;
        promoted = true;
      }
    } else {
      rp += rules.winRp;
      while (rp >= RP_PER_DIVISION && division < MAX_DIVISION && !requiresSeries(division)) {
        division += 1;
        rp -= RP_PER_DIVISION;
        promoted = true;
      }
      if (requiresSeries(division)) rp = Math.min(rp, RP_PER_DIVISION);
    }
  } else {
    if (streak > 0) seriesReset = true;
    streak = 0;
    if (!isProtected(division)) {
      rp -= rules.lossRp;
      if (rp < 0) {
        division -= 1;
        rp = Math.max(0, RP_PER_DIVISION + rp);
        demoted = true;
      }
    }
  }
  const after = { division, rp, streak };
  return { before, after, rpDelta: totalRp(after) - totalRp(before), promoted, demoted, seriesReset };
}

/** Position on the whole ladder (for deltas and ordering). */
export const totalRp = (s: Pick<RankState, 'division' | 'rp'>) => s.division * RP_PER_DIVISION + s.rp;

/** First division of the next season. */
export function softReset(finalDivision: number, rules: RankRules = DEFAULT_RANK_RULES): RankState {
  return { division: Math.max(0, finalDivision - rules.softResetDivisions), rp: 0, streak: 0 };
}

export const INITIAL_RANK: RankState = { division: 0, rp: 0, streak: 0 };

// ---------------------------------------------------------------- API shapes

export interface ProgressView {
  level: LevelInfo;
  rank: {
    seasonId: number;
    seasonName: string;
    endsAt: string | null;
    state: RankState;
    wins: number;
    losses: number;
    peakDivision: number;
    seriesActive: boolean;
    demotionRisk: boolean;
    protected: boolean;
    topPosition: number | null;
    topTitle: TopTitleId | null;
    rules: RankRules;
    /** Cxu Bạc per valid ranked match (0 = off). */
    participation: { playSilver: number; winSilver: number; dailyMatchCap: number };
  } | null;
}

/** Sent after a settled round that gave EXP (and possibly levels). */
export interface ProgressEvent {
  expGained: number;
  level: LevelInfo;
  levelsGained: number[];
}

export interface RankLadderEntry {
  position: number;
  uid: number;
  displayName: string;
  division: number;
  rp: number;
  wins: number;
  losses: number;
  topTitle: TopTitleId | null;
}
