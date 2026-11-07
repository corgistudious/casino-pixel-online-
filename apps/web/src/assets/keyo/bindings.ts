import type { KeyoAssetId } from './registry.generated';

/**
 * Where game data meets Asset Studio art: pure lookups from live data (VIP level, catalog item id,
 * season theme, …) to an asset id. Nothing here grants, prices or changes anything — ownership,
 * VIP level and prices still come from the server; these only choose the picture.
 */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** VIP badge for a level (1–15; higher admin-created levels keep the top badge). */
export function vipBadgeId(level: number): KeyoAssetId {
  const l = Math.max(1, Math.min(15, Math.floor(level)));
  return `vip.badge.vip-${pad2(l)}` as KeyoAssetId;
}

/** VIP milestone frames (VIP 5 / 7 / 10 / 15): the highest one the level has reached, or null. */
export const VIP_FRAME_LEVELS = [15, 10, 7, 5] as const;
export function vipFrameId(level: number): KeyoAssetId | null {
  const m = VIP_FRAME_LEVELS.find((l) => level >= l);
  return m ? (`frame.vip.vip-${pad2(m)}` as KeyoAssetId) : null;
}

/**
 * Studio felt for a table skin + layout. `oval` (fractions of the image) is where the painted felt
 * oval sits, so the card table can line it up with its seat geometry; otherwise the image covers the
 * table. Only these skin/layout pairs use a studio felt; every other skin keeps its drawn table.
 */
export interface StudioFelt {
  id: KeyoAssetId;
  oval?: { cx: number; cy: number; rx: number; ry: number };
  /** Vertical extent of the painted felt (fractions of the image): it is stretched uniformly so this
   *  band runs from 8% above the table's top to just below its bottom (player row and bet circle stay on felt). */
  band?: { top: number; bottom: number };
}
/** Where `band` lands, as fractions of the table height. */
export const FELT_BAND_TARGET = { top: -0.08, bottom: 1.02 };
export function studioFelt(skinId: string, layout: 'oval' | 'arc' | 'board', vertical = false): StudioFelt | null {
  // Measured on the image: felt from y 144 to 720 of 1024 at the centre line.
  if (layout === 'arc' && skinId === 'table_classic_green') return { id: 'game.blackjack.table-felt', band: { top: 0.14, bottom: 0.7 } };
  // Measured on the image: felt from x 192–1392 of 1536 and y 240–768 of 1024.
  if (layout === 'oval' && !vertical && skinId === 'table_midnight_purple') return { id: 'game.poker.table-felt-royal', oval: { cx: 0.516, cy: 0.492, rx: 0.391, ry: 0.258 } };
  if (layout === 'board' && skinId === 'table_emerald_palace') return { id: 'game.sicbo.table-vip' };
  return null;
}

/**
 * Catalog items (seeded by the migrations) whose look is now the Asset Studio art. Keys are catalog
 * item ids; prices, rarity, sources and ownership are untouched — only the picture changes, and the
 * drawn artwork stays the fallback. Items not listed keep their drawn look.
 */
export const ITEM_ART: Readonly<Record<string, KeyoAssetId>> = {
  // Chat bubbles
  bubble_classic: 'bubble.classic',
  bubble_classic_gold: 'bubble.gold',
  bubble_diamond_blue: 'bubble.diamond',
  bubble_royal_purple: 'bubble.royal',
  ss2026_halloween_bubble: 'bubble.halloween',
  ss2026_christmas_bubble: 'bubble.christmas',
  ss2026_lunar_new_year_bubble: 'bubble.lunar-new-year',
  ss2026_anniversary_bubble: 'bubble.anniversary',
  // Titles
  title_high_roller: 'title.high-roller',
  title_lucky_star: 'title.lucky-player',
  // Card backs
  card_back_classic: 'cardback.classic',
  card_back_sapphire: 'cardback.diamond',
  ss2026_halloween_cards: 'cardback.halloween',
  ss2026_christmas_cards: 'cardback.christmas',
  ss2026_lunar_new_year_cards: 'cardback.lunar-new-year',
  // Avatar frames: tournament set, Hall of Fame Top 1, and the top (legendary) frame of each season.
  tour_participant: 'frame.tournament.participant',
  tour_top10: 'frame.tournament.top-10',
  tour_top3: 'frame.tournament.top-3',
  tour_runner_up: 'frame.tournament.runner-up',
  tour_champion: 'frame.tournament.champion',
  tour_special: 'frame.special.event-exclusive',
  hof_champion: 'frame.tournament.grand-champion',
  ss2026_phantom_crown: 'frame.seasonal.halloween',
  ss2026_winter_royalty: 'frame.seasonal.christmas',
  ss2026_new_year_royal: 'frame.seasonal.new-year',
  ss2026_lunar_emperor: 'frame.seasonal.lunar-new-year',
  ss2026_eternal_love: 'frame.seasonal.valentine',
  ss2026_summer_crown: 'frame.seasonal.summer',
  ss2026_keyo_royal_legacy: 'frame.seasonal.anniversary',
};

/** Studio art for a catalog item (by id, or by the built-in art key it points to). */
export function itemArt(itemId: string | null | undefined, artKey?: string | null): KeyoAssetId | null {
  return (itemId ? ITEM_ART[itemId] : undefined) ?? (artKey ? ITEM_ART[artKey] : undefined) ?? null;
}

/** Chat bubble when no bubble item is equipped. */
export const DEFAULT_BUBBLE: KeyoAssetId = 'bubble.default';

/** Badge for each achievement (rounds-played tiers). */
export const ACHIEVEMENT_ART: Readonly<Record<string, KeyoAssetId>> = {
  first_game: 'achievement.badge',
  ten_games: 'achievement.rare',
  hundred_games: 'achievement.epic',
  thousand_games: 'achievement.legendary',
};

/** Default gift catalog (packages/shared/src/gifts.ts): gifts drawn with collectible art. */
export const GIFT_ART: Readonly<Record<string, KeyoAssetId>> = {
  gold_watch: 'collectible.watch.gold',
  sports_car: 'collectible.car.sports',
  yacht: 'collectible.yacht.luxury',
};

/** Seasonal event art for the game's season themes (SEASON_THEMES). Mid-Autumn has no studio set. */
const EVENT_THEME: Readonly<Record<string, string>> = {
  halloween: 'halloween',
  christmas: 'christmas',
  new_year: 'new-year',
  lunar_new_year: 'lunar-new-year',
  valentine: 'valentine',
  summer: 'summer',
  anniversary: 'anniversary',
};
export type EventPart = 'icon' | 'banner' | 'chest' | 'badge' | 'decoration';
export function eventArt(theme: string | null | undefined, part: EventPart): KeyoAssetId | null {
  const key = theme ? EVENT_THEME[theme] : undefined;
  return key ? (`event.${key}.${part}` as KeyoAssetId) : null;
}

/** Reward chest for a mail's attachments: event mail, seasonal (limited) items, else the top item rarity. */
export function rewardChest(kind: string, items: readonly { id: string; rarity?: string; source?: string }[], hasCurrency: boolean): KeyoAssetId | null {
  if (!items.length && !hasCurrency) return null;
  if (kind === 'event') return 'chest.event';
  if (items.some((i) => i.id.startsWith('ss2026_') || i.source === 'season')) return 'chest.limited';
  const order = ['common', 'rare', 'epic', 'legendary', 'mythic'];
  const top = items.reduce((m, i) => Math.max(m, order.indexOf(i.rarity ?? 'common')), items.length ? 0 : -1);
  if (top >= 3) return 'chest.legendary';
  if (top === 2) return 'chest.epic';
  if (top === 1) return 'chest.rare';
  return 'chest.common';
}
