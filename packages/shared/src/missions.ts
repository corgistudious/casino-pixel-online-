/**
 * Missions. Progress is computed on the server from records of real play (settled game rounds and
 * ranked results); the client only shows it. Each mission can be claimed once per period:
 * - daily: resets 00:00 UTC; weekly: resets Monday 00:00 UTC (ISO week);
 * - season: once per ranked season.
 * Rank missions also grant a little VIP EXP, capped per week (MISSION_RULES) so VIP stays a
 * long-term goal and cannot be farmed.
 */
export type MissionGroup = 'daily' | 'weekly' | 'rank';
export type MissionPeriod = 'daily' | 'weekly' | 'season';
export type MissionMetric =
  /** Settled rounds of any game (solo, shared tables, casual card hands). */
  | 'rounds'
  /** Settled rounds that paid more than was staked. */
  | 'wins'
  /** Cxu Bạc staked in settled rounds. */
  | 'wager'
  /** Casual Poker / Liêng / Xì Tố hands played. */
  | 'card_hands'
  /** Ranked matches finished (win or loss) in the current season. */
  | 'ranked_matches'
  | 'ranked_wins'
  /** Highest division reached this season (target = division index). */
  | 'peak_division';

export interface MissionReward {
  silver?: number;
  gold?: number;
  vipExp?: number;
}

export interface MissionDef {
  id: string;
  group: MissionGroup;
  period: MissionPeriod;
  metric: MissionMetric;
  target: number;
  reward: MissionReward;
}

export const MISSION_RULES = {
  /** Most VIP EXP missions can grant one player in one ISO week. */
  vipExpWeeklyCap: 100,
} as const;

/** Ids of the first four quests are kept so claims made before the redesign still count. */
export const MISSIONS: readonly MissionDef[] = [
  { id: 'daily_play', group: 'daily', period: 'daily', metric: 'rounds', target: 3, reward: { silver: 300 } },
  { id: 'daily_win', group: 'daily', period: 'daily', metric: 'wins', target: 1, reward: { silver: 500 } },
  { id: 'daily_wager', group: 'daily', period: 'daily', metric: 'wager', target: 20_000, reward: { silver: 1_000 } },
  { id: 'daily_cards', group: 'daily', period: 'daily', metric: 'card_hands', target: 3, reward: { silver: 800 } },
  { id: 'weekly_play', group: 'weekly', period: 'weekly', metric: 'rounds', target: 20, reward: { silver: 2_500 } },
  { id: 'weekly_win', group: 'weekly', period: 'weekly', metric: 'wins', target: 10, reward: { silver: 5_000 } },
  { id: 'weekly_wager', group: 'weekly', period: 'weekly', metric: 'wager', target: 300_000, reward: { silver: 8_000, gold: 5 } },
  { id: 'weekly_cards', group: 'weekly', period: 'weekly', metric: 'card_hands', target: 25, reward: { silver: 6_000 } },
  { id: 'rank_week_play', group: 'rank', period: 'weekly', metric: 'ranked_matches', target: 5, reward: { silver: 3_000, vipExp: 15 } },
  { id: 'rank_week_win', group: 'rank', period: 'weekly', metric: 'ranked_wins', target: 3, reward: { silver: 5_000, vipExp: 25 } },
  { id: 'rank_reach_silver', group: 'rank', period: 'season', metric: 'peak_division', target: 3, reward: { silver: 10_000, vipExp: 20 } },
  { id: 'rank_reach_gold', group: 'rank', period: 'season', metric: 'peak_division', target: 6, reward: { silver: 20_000, gold: 10, vipExp: 30 } },
  { id: 'rank_reach_platinum', group: 'rank', period: 'season', metric: 'peak_division', target: 10, reward: { silver: 40_000, gold: 20, vipExp: 40 } },
];

export function findMission(id: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id);
}

export interface MissionView extends MissionDef {
  progress: number;
  claimed: boolean;
  /** When the current period ends (ISO), null for a season without an end date. */
  resetsAt: string | null;
  /** A season mission while no season is running. */
  unavailable: boolean;
}

export interface MissionsOverview {
  missions: MissionView[];
  vip: { exp: number; weekGranted: number; weekCap: number };
}
