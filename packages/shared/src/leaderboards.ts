import type { GuildColor, GuildEmblem, PlayerCard } from './social';

/**
 * One leaderboard system for everything ranked. A board is a metric over trusted server data
 * (settled game rounds, VIP, Charm ledger, likes/follows, missions, guilds, tournaments) with a set
 * of periods it truly supports. Names and descriptions live in i18n (`boards.<id>`).
 */

export const LB_GAMES = ['poker', 'taixiu', 'roulette', 'lieng', 'xito', 'blackjack'] as const;
export type LbGame = (typeof LB_GAMES)[number];

/** All periods are UTC: days start 00:00 UTC (07:00 Vietnam), weeks on Monday, months on the 1st. */
export const LB_PERIODS = ['day', 'week', 'month', 'season', 'all'] as const;
export type LbPeriod = (typeof LB_PERIODS)[number];

export const LB_GROUPS = ['overview', 'games', 'vip', 'charm', 'profile', 'tournament', 'guild', 'achievements', 'events'] as const;
export type LbGroup = (typeof LB_GROUPS)[number];

/** Frame families of the Top 1/2/3 frames (one set per family). */
export const FRAME_FAMILIES = [...LB_GAMES, 'vip', 'charm', 'profile', 'tournament', 'guild', 'event'] as const;
export type FrameFamily = (typeof FRAME_FAMILIES)[number];
export const PODIUM_TIERS = ['champion', 'elite', 'master'] as const;
export type PodiumTier = (typeof PODIUM_TIERS)[number];
export const tierOfPlace = (place: number): PodiumTier | null => (place === 1 ? 'champion' : place === 2 ? 'elite' : place === 3 ? 'master' : null);
/** Reigning frame for a family and place, e.g. lb_poker_champion. */
export const reigningFrameId = (family: FrameFamily, tier: PodiumTier) => `lb_${family}_${tier}`;
/** Permanent Hall of Fame frame, given the first time a player finishes Top N of any rewarded board. */
export const legacyFrameId = (tier: PodiumTier) => `hof_${tier}`;

/** Win rate is only ranked from this many settled rounds in the period (no 1-for-1 = 100% tops). */
export const WIN_RATE_MIN_ROUNDS = 20;

export type LbMetric =
  | 'wins'
  | 'best_streak'
  | 'current_streak'
  | 'win_rate'
  | 'played'
  | 'vip'
  | 'charm_total'
  | 'charm_received'
  | 'likes'
  | 'followers'
  | 'featured'
  | 'tournament_titles'
  | 'tournament_top3'
  | 'tournament_points'
  | 'guild_points'
  | 'guild_active'
  | 'missions'
  | 'achievements'
  | 'collection'
  | 'activity'
  | 'level'
  | 'event_points';

export interface LbBoardDef {
  id: string;
  group: LbGroup;
  metric: LbMetric;
  game?: LbGame;
  subject: 'player' | 'guild';
  periods: readonly LbPeriod[];
  /** Closed months of this board are snapshotted and their Top 3 get this family's frames. */
  reward?: FrameFamily;
  /** False while the data behind it does not exist yet (no tournament or seasonal event engine). */
  active: boolean;
}

const GAME_PERIODS = ['day', 'week', 'month', 'season', 'all'] as const;
const gameBoards = (g: LbGame): LbBoardDef[] => [
  { id: `${g}.wins`, group: 'games', game: g, metric: 'wins', subject: 'player', periods: GAME_PERIODS, reward: g, active: true },
  { id: `${g}.best_streak`, group: 'games', game: g, metric: 'best_streak', subject: 'player', periods: GAME_PERIODS, active: true },
  { id: `${g}.current_streak`, group: 'games', game: g, metric: 'current_streak', subject: 'player', periods: ['all'], active: true },
  { id: `${g}.win_rate`, group: 'games', game: g, metric: 'win_rate', subject: 'player', periods: GAME_PERIODS, active: true },
  { id: `${g}.played`, group: 'games', game: g, metric: 'played', subject: 'player', periods: GAME_PERIODS, active: true },
];

export const LB_BOARDS: readonly LbBoardDef[] = [
  { id: 'overview.activity', group: 'overview', metric: 'activity', subject: 'player', periods: ['day', 'week', 'month', 'season', 'all'], active: true },
  { id: 'overview.level', group: 'overview', metric: 'level', subject: 'player', periods: ['all'], active: true },
  ...LB_GAMES.flatMap(gameBoards),
  { id: 'vip.level', group: 'vip', metric: 'vip', subject: 'player', periods: ['all'], reward: 'vip', active: true },
  { id: 'charm.total', group: 'charm', metric: 'charm_total', subject: 'player', periods: ['all'], active: true },
  { id: 'charm.received', group: 'charm', metric: 'charm_received', subject: 'player', periods: ['day', 'week', 'month', 'season'], reward: 'charm', active: true },
  { id: 'profile.likes', group: 'profile', metric: 'likes', subject: 'player', periods: ['week', 'month', 'all'], active: true },
  { id: 'profile.followers', group: 'profile', metric: 'followers', subject: 'player', periods: ['week', 'month', 'all'], active: true },
  { id: 'profile.featured', group: 'profile', metric: 'featured', subject: 'player', periods: ['week', 'month'], reward: 'profile', active: true },
  { id: 'tournament.titles', group: 'tournament', metric: 'tournament_titles', subject: 'player', periods: ['all'], active: true },
  { id: 'tournament.top3', group: 'tournament', metric: 'tournament_top3', subject: 'player', periods: ['all'], active: true },
  { id: 'tournament.points', group: 'tournament', metric: 'tournament_points', subject: 'player', periods: ['month', 'season', 'all'], reward: 'tournament', active: true },
  { id: 'guild.points', group: 'guild', metric: 'guild_points', subject: 'guild', periods: ['week', 'month', 'all'], reward: 'guild', active: true },
  { id: 'guild.active', group: 'guild', metric: 'guild_active', subject: 'guild', periods: ['week'], active: true },
  { id: 'achievements.missions', group: 'achievements', metric: 'missions', subject: 'player', periods: ['week', 'month', 'all'], active: true },
  { id: 'achievements.badges', group: 'achievements', metric: 'achievements', subject: 'player', periods: ['all'], active: true },
  { id: 'achievements.collection', group: 'achievements', metric: 'collection', subject: 'player', periods: ['all'], active: true },
  { id: 'events.seasonal', group: 'events', metric: 'event_points', subject: 'player', periods: ['month'], reward: 'event', active: false },
];

export const boardById = (id: string) => LB_BOARDS.find((b) => b.id === id);

/** One ranked row. `position` uses competition ranking: exact ties share a place (1, 1, 3). */
export interface LbEntry {
  position: number;
  /** Main value shown (wins, streak, %, points…). */
  value: number;
  /** Extra context (e.g. rounds played for a win rate, likes for "featured"). */
  detail?: Record<string, number>;
  player?: PlayerCard;
  guild?: { id: string; name: string; emblem: GuildEmblem; color: GuildColor; members: number };
}

export interface LbBoardView {
  board: string;
  period: LbPeriod;
  periods: LbPeriod[];
  /** UTC bounds of the period (null for all-time). */
  startsAt: string | null;
  endsAt: string | null;
  total: number;
  entries: LbEntry[];
  me: LbEntry | null;
  updatedAt: string;
}

export interface LbAwardView {
  board: string;
  periodKey: string;
  place: number;
  value: number;
  reigningItem: string | null;
  reigningUntil: string | null;
  legacyItem: string | null;
  createdAt: string;
}

export interface PlayerGameStatView {
  game: LbGame;
  played: number;
  wins: number;
  losses: number;
  pushes: number;
  currentStreak: number;
  bestStreak: number;
}
