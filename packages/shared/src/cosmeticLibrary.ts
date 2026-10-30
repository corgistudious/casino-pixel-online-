import type { Rarity } from './cosmetics';
import { FRAME_LIBRARY, SEASON_THEMES, SEASON_YEAR, type FrameGlyph, type SeasonTheme } from './frameLibrary';

/**
 * Built-in cosmetics beyond frames: table skins, victory effects, card backs, chat bubbles and
 * titles, plus the seasonal collections that group them with the seasonal frames. Each item is a
 * catalog row (seeded by migration 0035) whose look is original artwork drawn by the client from
 * `style.art` = the item id. Prices here are only the seed proposal: collections start as drafts and
 * nothing is sold before the Owner approves a collection.
 *
 * Visibility: table skins and victory effects are PERSONAL (only the player who equips them sees
 * them); card backs, chat bubbles, titles and frames are PUBLIC (others see the owner's).
 */

export const PERSONAL_KINDS = ['table_skin', 'victory_effect'] as const;
export type CosmeticGame = 'poker' | 'lieng' | 'xito' | 'blackjack' | 'taixiu' | 'roulette';
export const ALL_GAMES: readonly CosmeticGame[] = ['poker', 'lieng', 'xito', 'blackjack', 'taixiu', 'roulette'];
/** Games with player-owned face-down cards (Blackjack's only hidden card is the house's). */
export const CARD_BACK_GAMES: readonly CosmeticGame[] = ['poker', 'lieng', 'xito'];

export type Currency2 = 'silver' | 'gold';
export interface Price {
  amount: number;
  currency: Currency2;
}

export interface TableSkinArt {
  /** Felt light → dark. */
  felt: [string, string, string];
  /** Rail light → dark. */
  rail: [string, string];
  railStyle: 'wood' | 'gold' | 'velvet' | 'marble' | 'chrome' | 'ice' | 'lacquer' | 'coral';
  /** Printed lines on the felt. */
  line: string;
  accent: string;
  glow: string;
  pattern: 'plain' | 'diamond' | 'damask' | 'lattice' | 'scatter' | 'waves' | 'rays';
  motif: FrameGlyph;
  /** Spotlights over the table (1–3). */
  lights: 1 | 2 | 3;
}

export interface EffectArt {
  particles: FrameGlyph[];
  colors: string[];
  motion: 'rain' | 'burst' | 'rise' | 'sparkle' | 'swirl';
  /** Big centrepiece glyph (crown, coin…) or none. */
  centre: FrameGlyph | null;
  glow: string;
  count: number;
}

export interface CardBackArt {
  bg: [string, string];
  border: string;
  accent: string;
  motif: FrameGlyph;
  pattern: 'lattice' | 'diamond' | 'waves' | 'scatter' | 'rays';
}

export interface BubbleArt {
  bg: [string, string];
  border: string;
  glow: string;
  corner: FrameGlyph | null;
  pattern: FrameGlyph | null;
}

export interface TitleArt {
  colors: string[];
  icon: FrameGlyph | null;
  border: string;
}

type Base = {
  id: string;
  name: { vi: string; en: string };
  description: { vi: string; en: string };
  rarity: Rarity;
  theme: SeasonTheme | null;
  /** Seed price for the shop (basic items) or for the collection offer (seasonal items). */
  price: Price;
};
export type CosmeticDef =
  | (Base & { kind: 'table_skin'; games: readonly CosmeticGame[]; art: TableSkinArt })
  | (Base & { kind: 'victory_effect'; games: readonly CosmeticGame[]; art: EffectArt })
  | (Base & { kind: 'card_back'; games: readonly CosmeticGame[]; art: CardBackArt })
  | (Base & { kind: 'chat_bubble'; art: BubbleArt })
  | (Base & { kind: 'title'; art: TitleArt });

const S = (amount: number): Price => ({ amount, currency: 'silver' });
const G = (amount: number): Price => ({ amount, currency: 'gold' });

const skin = (id: string, vi: string, en: string, dvi: string, den: string, rarity: Rarity, theme: SeasonTheme | null, price: Price, art: TableSkinArt): CosmeticDef => ({
  id, kind: 'table_skin', name: { vi, en }, description: { vi: dvi, en: den }, rarity, theme, price, games: ALL_GAMES, art,
});
const effect = (id: string, vi: string, en: string, dvi: string, den: string, rarity: Rarity, theme: SeasonTheme | null, price: Price, art: EffectArt): CosmeticDef => ({
  id, kind: 'victory_effect', name: { vi, en }, description: { vi: dvi, en: den }, rarity, theme, price, games: ALL_GAMES, art,
});

export const TABLE_SKINS: CosmeticDef[] = [
  skin('table_classic_green', 'Xanh Cổ Điển', 'Classic Green', 'Nỉ xanh truyền thống, viền gỗ óc chó và một đèn trần.', 'Traditional green felt, walnut rail and a single ceiling light.', 'common', null, S(0),
    { felt: ['#2aa36b', '#11643f', '#05301d'], rail: ['#7a4a22', '#2a1306'], railStyle: 'wood', line: '#f2d38a', accent: '#f2c14e', glow: '#fff3c4', pattern: 'plain', motif: 'spade', lights: 1 }),
  skin('table_royal_gold', 'Hoàng Kim', 'Royal Gold', 'Nỉ đỏ rượu vang hoa văn damask vàng, viền mạ vàng, hai đèn chùm.', 'Wine-red felt with gold damask, gilded rail and two chandeliers.', 'rare', null, S(30_000),
    { felt: ['#b3263c', '#6e0f22', '#2a0410'], rail: ['#fff1b8', '#8a5a12'], railStyle: 'gold', line: '#ffd76a', accent: '#f2c14e', glow: '#ffe8a8', pattern: 'damask', motif: 'crown', lights: 2 }),
  skin('table_midnight_purple', 'Tím Nửa Đêm', 'Midnight Purple', 'Nỉ tím than lưới ánh kim, viền nhung đen, ánh neon tím.', 'Midnight felt with a metallic lattice, black velvet rail and violet neon.', 'rare', null, S(25_000),
    { felt: ['#5b3bb0', '#2a1660', '#0c0624'], rail: ['#3a2a55', '#0a0614'], railStyle: 'velvet', line: '#c8a8ff', accent: '#b45cff', glow: '#d6b8ff', pattern: 'lattice', motif: 'moon', lights: 1 }),
  skin('table_emerald_palace', 'Cung Điện Lục Bảo', 'Emerald Palace', 'Nỉ lục bảo hoa văn kim cương, viền đá cẩm thạch trắng gân vàng, ba đèn.', 'Emerald felt with diamond inlay, gold-veined white marble rail and three lights.', 'epic', null, S(40_000),
    { felt: ['#22c08a', '#0b6b4a', '#032a1d'], rail: ['#f4f1ea', '#b9b3a3'], railStyle: 'marble', line: '#ffe08a', accent: '#1ec8b0', glow: '#d8fff0', pattern: 'diamond', motif: 'diamond', lights: 3 }),
  skin('table_diamond_lounge', 'Phòng Kim Cương', 'Diamond Lounge', 'Nỉ xanh băng tia sáng, viền chrome, ánh kim cương lấp lánh.', 'Ice-blue felt with light rays, chrome rail and diamond sparkle.', 'legendary', null, G(80),
    { felt: ['#4fb8e8', '#1a5a8a', '#071a33'], rail: ['#ffffff', '#6b7c93'], railStyle: 'chrome', line: '#e6fbff', accent: '#9ee8ff', glow: '#e6fbff', pattern: 'rays', motif: 'diamond', lights: 2 }),
];

export const VICTORY_EFFECTS: CosmeticDef[] = [
  effect('fx_golden_shower', 'Mưa Vàng', 'Golden Shower', 'Mưa đồng xu vàng rơi khi bạn thắng.', 'A shower of gold coins when you win.', 'rare', null, S(20_000),
    { particles: ['coin'], colors: ['#ffe08a', '#f2c14e', '#b8860b'], motion: 'rain', centre: null, glow: '#ffd76a', count: 28 }),
  effect('fx_diamond_sparkle', 'Kim Cương Lấp Lánh', 'Diamond Sparkle', 'Kim cương lấp lánh quanh màn hình.', 'Diamonds sparkle around the screen.', 'epic', null, S(35_000),
    { particles: ['diamond', 'star'], colors: ['#e6fbff', '#9ee8ff', '#c13cff'], motion: 'sparkle', centre: null, glow: '#bdf3ff', count: 22 }),
  effect('fx_royal_crown', 'Vương Miện Hoàng Gia', 'Royal Crown', 'Vương miện vàng hạ xuống giữa màn hình kèm hào quang.', 'A golden crown descends with a royal halo.', 'legendary', null, S(60_000),
    { particles: ['star', 'diamond'], colors: ['#fff3b0', '#f2c14e', '#e23b55'], motion: 'burst', centre: 'crown', glow: '#ffd76a', count: 18 }),
  effect('fx_firework_burst', 'Pháo Hoa Bùng Nổ', 'Firework Burst', 'Những chùm pháo hoa nhiều màu.', 'Bursts of colourful fireworks.', 'rare', null, S(25_000),
    { particles: ['firework', 'star'], colors: ['#ff4fd8', '#ffd76a', '#5ad8ff', '#7ff0a8'], motion: 'burst', centre: null, glow: '#ff9bf0', count: 26 }),
  effect('fx_lucky_stars', 'Sao May Mắn', 'Lucky Stars', 'Những ngôi sao may mắn bay lên.', 'Lucky stars float upwards.', 'common', null, S(15_000),
    { particles: ['star'], colors: ['#fff3b0', '#ffd76a', '#ffffff'], motion: 'rise', centre: null, glow: '#fff0a8', count: 20 }),
  effect('fx_emerald_aura', 'Hào Quang Lục Bảo', 'Emerald Aura', 'Vòng hào quang lục bảo xoáy quanh chiến thắng.', 'An emerald aura swirls around your win.', 'epic', null, S(40_000),
    { particles: ['diamond', 'blossom'], colors: ['#7ff0a8', '#1ec8b0', '#0b6b4a'], motion: 'swirl', centre: null, glow: '#7ff0c8', count: 22 }),
];

const BASIC_BUBBLES: CosmeticDef[] = [
  { id: 'bubble_classic_gold', kind: 'chat_bubble', name: { vi: 'Vàng Cổ Điển', en: 'Classic Gold' }, description: { vi: 'Nền đen ánh vàng, viền vàng mảnh.', en: 'Black with a gold sheen and a fine gold edge.' }, rarity: 'common', theme: null, price: S(8_000),
    art: { bg: ['#2a1d06', '#4a3510'], border: '#f2c14e', glow: '#f2c14e', corner: null, pattern: null } },
  { id: 'bubble_royal_purple', kind: 'chat_bubble', name: { vi: 'Tím Hoàng Gia', en: 'Royal Purple' }, description: { vi: 'Nhung tím, viền vàng và vương miện nhỏ.', en: 'Purple velvet, gold edge and a small crown.' }, rarity: 'rare', theme: null, price: S(12_000),
    art: { bg: ['#3a1466', '#6b2bb0'], border: '#f2c14e', glow: '#b45cff', corner: 'crown', pattern: null } },
  { id: 'bubble_diamond_blue', kind: 'chat_bubble', name: { vi: 'Lam Kim Cương', en: 'Diamond Blue' }, description: { vi: 'Xanh băng với họa tiết kim cương.', en: 'Ice blue with a diamond pattern.' }, rarity: 'epic', theme: null, price: S(18_000),
    art: { bg: ['#0e3a6b', '#2a7bc8'], border: '#bdf3ff', glow: '#9ee8ff', corner: 'diamond', pattern: 'diamond' } },
  { id: 'bubble_emerald_glow', kind: 'chat_bubble', name: { vi: 'Lục Bảo Rực Rỡ', en: 'Emerald Glow' }, description: { vi: 'Lục bảo phát sáng nhẹ.', en: 'Softly glowing emerald.' }, rarity: 'rare', theme: null, price: S(15_000),
    art: { bg: ['#06402a', '#119a64'], border: '#7ff0a8', glow: '#7ff0a8', corner: 'blossom', pattern: null } },
];

type Seasonal = {
  vi: string;
  en: string;
  start: string; // MM-DD, Vietnam time
  days: number;
  table: [string, string, string, string, TableSkinArt];
  effect: [string, string, string, string, EffectArt];
  cardBack: [string, string, CardBackArt];
  bubble: [string, string, BubbleArt];
  title: [string, string, TitleArt];
};

const SEASON_DATA: Record<SeasonTheme, Seasonal> = {
  halloween: {
    vi: 'Halloween', en: 'Halloween', start: '10-20', days: 15,
    table: ['Sòng Bài Ma Ám', 'Haunted Casino', 'Nỉ tím đêm, mạng nhện bạc và bí ngô phát sáng.', 'Night-purple felt, silver cobwebs and glowing pumpkins.',
      { felt: ['#5a2a8a', '#2a0f45', '#0a0314'], rail: ['#4a2a12', '#120601'], railStyle: 'lacquer', line: '#ff9b3d', accent: '#ff7a1a', glow: '#ffb070', pattern: 'scatter', motif: 'pumpkin', lights: 1 }],
    effect: ['Jackpot Ma Quái', 'Ghostly Jackpot', 'Những bóng ma và dơi bay lên quanh chiến thắng.', 'Ghosts and bats rise around your win.',
      { particles: ['ghost', 'bat', 'pumpkin'], colors: ['#e6d8ff', '#ff7a1a', '#a4ff6a'], motion: 'rise', centre: 'pumpkin', glow: '#ff9b3d', count: 20 }],
    cardBack: ['Bài Ma Ám', 'Haunted Cards', { bg: ['#3b1458', '#120420'], border: '#ff9b3d', accent: '#a4ff6a', motif: 'pumpkin', pattern: 'scatter' }],
    bubble: ['Lời Thì Thầm Bí Ngô', 'Pumpkin Whisper', { bg: ['#3a1206', '#7a2e0a'], border: '#ff9b3d', glow: '#ff7a1a', corner: 'pumpkin', pattern: 'bat' }],
    title: ['Hoàng Gia Halloween', 'Halloween Royalty', { colors: ['#ffc46b', '#ff7a1a', '#b45cff'], icon: 'pumpkin', border: '#ff7a1a' }],
  },
  christmas: {
    vi: 'Giáng Sinh', en: 'Christmas', start: '12-15', days: 18,
    table: ['Sòng Bài Mùa Đông', 'Winter Casino', 'Nỉ xanh thông, tuyết rơi và viền băng trắng.', 'Pine-green felt, falling snow and an icy white rail.',
      { felt: ['#1f7a52', '#0d4a30', '#04201a'], rail: ['#ffffff', '#9fb8d0'], railStyle: 'ice', line: '#ffffff', accent: '#d62b3c', glow: '#e6f6ff', pattern: 'scatter', motif: 'snowflake', lights: 2 }],
    effect: ['Lễ Hội Tuyết Rơi', 'Snowfall Celebration', 'Tuyết và quà Giáng Sinh rơi nhẹ.', 'Snow and Christmas gifts drift down.',
      { particles: ['snowflake', 'gift', 'star'], colors: ['#ffffff', '#cdeeff', '#d62b3c'], motion: 'rain', centre: 'tree', glow: '#cdeeff', count: 26 }],
    cardBack: ['Bài Bông Tuyết', 'Snowflake Cards', { bg: ['#1d4f86', '#0a1f3a'], border: '#ffffff', accent: '#9fd8ff', motif: 'snowflake', pattern: 'lattice' }],
    bubble: ['Quà Giáng Sinh', 'Christmas Gift', { bg: ['#7a0f1a', '#c0263a'], border: '#ffd76a', glow: '#ff6b5a', corner: 'gift', pattern: 'snowflake' }],
    title: ['Ngôi Sao Mùa Đông', 'Winter Star', { colors: ['#ffffff', '#9fd8ff', '#ffd76a'], icon: 'snowflake', border: '#9fd8ff' }],
  },
  new_year: {
    vi: 'Năm Mới', en: 'Happy New Year', start: '12-28', days: 10,
    table: ['Dạ Tiệc Năm Mới', 'New Year Gala', 'Nỉ xanh đêm, tia pháo hoa và viền vàng champagne.', 'Midnight felt, firework rays and a champagne-gold rail.',
      { felt: ['#2f3fa8', '#141c5a', '#05081e'], rail: ['#fff3c4', '#a8781e'], railStyle: 'gold', line: '#ffd76a', accent: '#ff4fd8', glow: '#ffe8ff', pattern: 'rays', motif: 'firework', lights: 3 }],
    effect: ['Pháo Hoa Nửa Đêm', 'Midnight Fireworks', 'Pháo hoa nửa đêm nổ rực rỡ.', 'Midnight fireworks light up your win.',
      { particles: ['firework', 'star', 'diamond'], colors: ['#ffd76a', '#ff4fd8', '#5ad8ff', '#ffffff'], motion: 'burst', centre: 'clock', glow: '#ffd0ff', count: 28 }],
    cardBack: ['Đếm Ngược Nửa Đêm', 'Midnight Countdown', { bg: ['#141c5a', '#05081e'], border: '#ffd76a', accent: '#ff4fd8', motif: 'clock', pattern: 'rays' }],
    bubble: ['Lấp Lánh Năm Mới', 'New Year Sparkle', { bg: ['#141c5a', '#3b4cc0'], border: '#ffd76a', glow: '#ff4fd8', corner: 'firework', pattern: 'star' }],
    title: ['Nhà Vô Địch Năm Mới', 'New Year Champion', { colors: ['#fff3c4', '#ffd76a', '#ff4fd8'], icon: 'firework', border: '#ffd76a' }],
  },
  lunar_new_year: {
    vi: 'Tết Nguyên Đán', en: 'Lunar New Year', start: '01-20', days: 21,
    table: ['Cung Điện Âm Lịch', 'Lunar Palace', 'Nỉ đỏ son, hoa mai vàng và viền sơn mài.', 'Vermilion felt, golden apricot blossoms and a lacquer rail.',
      { felt: ['#d8303a', '#8a0f18', '#3a0408'], rail: ['#3a0a0a', '#120202'], railStyle: 'lacquer', line: '#ffd23d', accent: '#ffd23d', glow: '#ffe8a0', pattern: 'damask', motif: 'blossom', lights: 2 }],
    effect: ['Mưa Tài Lộc', 'Fortune Rain', 'Mưa đồng tiền vàng và lì xì may mắn.', 'A rain of gold coins and lucky envelopes.',
      { particles: ['coin', 'blossom', 'lantern'], colors: ['#ffd23d', '#e0262f', '#fff1a8'], motion: 'rain', centre: 'dragon', glow: '#ffd23d', count: 28 }],
    cardBack: ['Đỏ May Mắn', 'Lucky Red', { bg: ['#c8202a', '#5a0a10'], border: '#ffd23d', accent: '#ffe066', motif: 'blossom', pattern: 'lattice' }],
    bubble: ['Đèn Lồng May Mắn', 'Lucky Lantern', { bg: ['#8a0f18', '#d8303a'], border: '#ffd23d', glow: '#ffd23d', corner: 'lantern', pattern: 'coin' }],
    title: ['Xuân Phú Quý', 'Xuân Phú Quý', { colors: ['#fff1a8', '#ffd23d', '#e0262f'], icon: 'blossom', border: '#ffd23d' }],
  },
  valentine: {
    vi: 'Valentine', en: "Valentine's Day", start: '02-07', days: 10,
    table: ['Phòng Hoa Hồng', 'Rose Lounge', 'Nỉ hồng nhung, cánh hoa hồng rải và viền vàng hồng.', 'Rose velvet felt, scattered petals and a rose-gold rail.',
      { felt: ['#e04a7a', '#8a1240', '#2a0414'], rail: ['#ffd6c8', '#a85a4a'], railStyle: 'gold', line: '#ffe0ea', accent: '#ffd6e0', glow: '#ffc2d6', pattern: 'scatter', motif: 'rose', lights: 2 }],
    effect: ['Lễ Hội Trái Tim', 'Heart Celebration', 'Những trái tim bay lên rộn ràng.', 'Hearts flutter upwards.',
      { particles: ['heart', 'rose'], colors: ['#ff4f7a', '#ffc2d1', '#ffffff'], motion: 'rise', centre: 'heart', glow: '#ff9bb5', count: 24 }],
    cardBack: ['Trái Tim Hồng Ngọc', 'Ruby Hearts', { bg: ['#c0245e', '#4a0620'], border: '#ffe0ea', accent: '#ffc2d1', motif: 'heart', pattern: 'diamond' }],
    bubble: ['Lời Nhắn Ngọt Ngào', 'Sweet Message', { bg: ['#8a1240', '#e04a7a'], border: '#ffd6e0', glow: '#ff7aa3', corner: 'heart', pattern: 'heart' }],
    title: ['Người Sưu Tầm Trái Tim', 'Heart Collector', { colors: ['#ffd6e0', '#ff4f7a', '#c0245e'], icon: 'heart', border: '#ff7aa3' }],
  },
  summer: {
    vi: 'Lễ Hội Mùa Hè', en: 'Summer Festival', start: '06-20', days: 21,
    table: ['Sòng Bài Nhiệt Đới', 'Tropical Casino', 'Nỉ xanh ngọc như biển, sóng nắng và viền san hô.', 'Turquoise sea felt, sunny waves and a coral rail.',
      { felt: ['#26c6c0', '#0a7a8a', '#033040'], rail: ['#ffb08a', '#a8483a'], railStyle: 'coral', line: '#fff6a8', accent: '#ffb21a', glow: '#fff6c4', pattern: 'waves', motif: 'sun', lights: 2 }],
    effect: ['Té Nước Mùa Hè', 'Summer Splash', 'Bọt sóng và ngọc trai bắn tung.', 'Waves and pearls splash around.',
      { particles: ['wave', 'pearl', 'sun'], colors: ['#9ae6ff', '#ffffff', '#ffd23d'], motion: 'burst', centre: 'sun', glow: '#9ae6ff', count: 24 }],
    cardBack: ['Gió Biển', 'Ocean Breeze', { bg: ['#1aa0c8', '#073a5a'], border: '#ffffff', accent: '#fff6a8', motif: 'wave', pattern: 'waves' }],
    bubble: ['Sóng Nắng', 'Sunny Wave', { bg: ['#0a6a8a', '#26c6c0'], border: '#fff6a8', glow: '#9ae6ff', corner: 'sun', pattern: 'wave' }],
    title: ['Ngôi Sao Mùa Hè', 'Summer Star', { colors: ['#fff6a8', '#ffb21a', '#26c6c0'], icon: 'sun', border: '#ffb21a' }],
  },
  mid_autumn: {
    vi: 'Trung Thu', en: 'Mid-Autumn Festival', start: '09-10', days: 15,
    table: ['Cung Trăng', 'Moon Palace', 'Nỉ xanh đêm, trăng tròn và đèn lồng, viền sơn mài nâu.', 'Night felt with a full moon and lanterns, brown lacquer rail.',
      { felt: ['#3a3a8a', '#1a1a4a', '#070720'], rail: ['#7a4a1a', '#2a1406'], railStyle: 'lacquer', line: '#ffe6a8', accent: '#ff6b5a', glow: '#fff4c8', pattern: 'scatter', motif: 'lantern', lights: 1 }],
    effect: ['Ánh Trăng Rằm', 'Lunar Glow', 'Trăng rằm tỏa sáng và đèn lồng bay lên.', 'A full moon glows as lanterns rise.',
      { particles: ['lantern', 'star', 'mooncake'], colors: ['#ffe6a8', '#ff6b5a', '#ffffff'], motion: 'rise', centre: 'moon', glow: '#fff0b3', count: 20 }],
    cardBack: ['Bài Ánh Trăng', 'Moonlight Cards', { bg: ['#2a2a6a', '#0a0a24'], border: '#ffe6a8', accent: '#fff6c4', motif: 'moon', pattern: 'scatter' }],
    bubble: ['Đèn Lồng Trăng', 'Moon Lantern', { bg: ['#1a1a4a', '#3a3a8a'], border: '#ffe6a8', glow: '#ffd98a', corner: 'lantern', pattern: 'moon' }],
    title: ['Hộ Vệ Ánh Trăng', 'Moonlight Guardian', { colors: ['#fffbe6', '#ffd98a', '#8a8aff'], icon: 'moon', border: '#ffd98a' }],
  },
  anniversary: {
    vi: 'Kỷ Niệm Keyo', en: 'Keyo Anniversary', start: '08-01', days: 14,
    table: ['Đại Sảnh Hoàng Gia Keyo', 'Keyo Royal Hall', 'Nỉ tím hoàng gia, hoa văn chữ K vàng và viền mạ vàng.', 'Royal purple felt, gold K damask and a gilded rail.',
      { felt: ['#7a3ad0', '#3a1478', '#120530'], rail: ['#fff6d6', '#9a6a12'], railStyle: 'gold', line: '#ffd76a', accent: '#c13cff', glow: '#ffe8a8', pattern: 'damask', motif: 'keyo', lights: 3 }],
    effect: ['Jackpot Kỷ Niệm', 'Anniversary Jackpot', 'Bánh kỷ niệm, kim cương và đồng xu vàng.', 'Anniversary cake, diamonds and gold coins.',
      { particles: ['coin', 'diamond', 'star'], colors: ['#ffd76a', '#c13cff', '#ffffff'], motion: 'burst', centre: 'cake', glow: '#ffd76a', count: 28 }],
    cardBack: ['Phiên Bản Kỷ Niệm', 'Anniversary Edition', { bg: ['#4a1a8a', '#14052a'], border: '#ffd76a', accent: '#c13cff', motif: 'keyo', pattern: 'diamond' }],
    bubble: ['Vàng Lễ Hội', 'Celebration Gold', { bg: ['#4a3510', '#8a6a1a'], border: '#fff3b0', glow: '#ffd76a', corner: 'cake', pattern: 'star' }],
    title: ['Huyền Thoại Kỷ Niệm', 'Anniversary Legend', { colors: ['#fff6d6', '#ffd76a', '#c13cff'], icon: 'keyo', border: '#ffd76a' }],
  },
};

const seasonalItems: CosmeticDef[] = SEASON_THEMES.flatMap((theme) => {
  const s = SEASON_DATA[theme];
  const year = SEASON_YEAR;
  const where = { vi: `Bộ sưu tập ${s.vi} ${year}.`, en: `${s.en} ${year} collection.` };
  return [
    { id: `ss${year}_${theme}_table`, kind: 'table_skin', name: { vi: s.table[0], en: s.table[1] }, description: { vi: `${s.table[2]} ${where.vi}`, en: `${s.table[3]} ${where.en}` }, rarity: 'epic', theme, price: S(45_000), games: ALL_GAMES, art: s.table[4] },
    { id: `ss${year}_${theme}_fx`, kind: 'victory_effect', name: { vi: s.effect[0], en: s.effect[1] }, description: { vi: `${s.effect[2]} ${where.vi}`, en: `${s.effect[3]} ${where.en}` }, rarity: 'epic', theme, price: S(40_000), games: ALL_GAMES, art: s.effect[4] },
    { id: `ss${year}_${theme}_cards`, kind: 'card_back', name: { vi: s.cardBack[0], en: s.cardBack[1] }, description: where, rarity: 'rare', theme, price: S(15_000), games: CARD_BACK_GAMES, art: s.cardBack[2] },
    { id: `ss${year}_${theme}_bubble`, kind: 'chat_bubble', name: { vi: s.bubble[0], en: s.bubble[1] }, description: where, rarity: 'rare', theme, price: S(12_000), art: s.bubble[2] },
    { id: `ss${year}_${theme}_title`, kind: 'title', name: { vi: s.title[0], en: s.title[1] }, description: where, rarity: 'epic', theme, price: S(20_000), art: s.title[2] },
  ] satisfies CosmeticDef[];
});

export const COSMETIC_LIBRARY: readonly CosmeticDef[] = [...TABLE_SKINS, ...VICTORY_EFFECTS, ...BASIC_BUBBLES, ...seasonalItems];
export const cosmeticDef = (id: string) => COSMETIC_LIBRARY.find((c) => c.id === id);
/** The free, always-owned default table skin. */
export const DEFAULT_TABLE_SKIN = 'table_classic_green';

/** Seasonal collection plan for one year (seeded as drafts; dates in Vietnam time). */
export interface CollectionSeed {
  id: string;
  theme: SeasonTheme;
  year: number;
  name: { vi: string; en: string };
  startsAt: string;
  endsAt: string;
  items: { itemId: string; price: Price }[];
}

const SEASON_FRAME_PRICE: Record<string, Price> = { rare: S(20_000), epic: S(40_000), legendary: G(80) };

export const COLLECTION_SEEDS: readonly CollectionSeed[] = SEASON_THEMES.map((theme) => {
  const s = SEASON_DATA[theme];
  const year = SEASON_YEAR;
  const [mm, dd] = s.start.split('-').map(Number) as [number, number];
  // Window entirely in the coming season for this seed year (+7 h = Vietnam midnight).
  const startYear = theme === 'lunar_new_year' || theme === 'valentine' || theme === 'summer' || theme === 'mid_autumn' || theme === 'anniversary' ? year + 1 : year;
  const start = new Date(Date.UTC(startYear, mm - 1, dd, -7));
  const end = new Date(start.getTime() + s.days * 86_400_000);
  const frames = FRAME_LIBRARY.filter((f) => f.season?.theme === theme && f.season.year === year);
  return {
    id: `${theme}_${year}`,
    theme,
    year,
    name: { vi: `${s.vi} ${year}`, en: `${s.en} ${year}` },
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    items: [
      ...seasonalItems.filter((i) => i.theme === theme).map((i) => ({ itemId: i.id, price: i.price })),
      ...frames.map((f) => ({ itemId: f.id, price: SEASON_FRAME_PRICE[f.rarity] ?? S(20_000) })),
    ],
  };
});

export const seasonName = (theme: SeasonTheme) => ({ vi: SEASON_DATA[theme].vi, en: SEASON_DATA[theme].en });

/** Names a cosmetic title may never take (staff roles, verification, official accounts). */
export const RESERVED_TITLE_PATTERN = /(owner|super\s*admin|\badmin|moderator|\bmod\b|verified|x[áa]c\s*minh|qu[ảa]n\s*tr[ịi]|ki[ểe]m\s*duy[ệe]t|keyo\s*captain|keyo[_\s]*gm|official|ch[íi]nh\s*th[ứu]c)/i;

/** Status of a collection at `now`. Draft until the Owner approves it. */
export type CollectionStatus = 'draft' | 'scheduled' | 'active' | 'ended';
export function collectionStatus(c: { approvedAt: string | null; startsAt: string; endsAt: string; endedAt: string | null }, now = Date.now()): CollectionStatus {
  if (!c.approvedAt) return 'draft';
  if (c.endedAt || Date.parse(c.endsAt) <= now) return 'ended';
  return Date.parse(c.startsAt) > now ? 'scheduled' : 'active';
}

export interface CollectionOfferView {
  itemId: string;
  price: number;
  currency: Currency2;
  sort: number;
}
export interface CollectionView {
  id: string;
  theme: string;
  year: number;
  name: { vi: string; en: string };
  description: { vi: string; en: string } | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: CollectionStatus;
  rerunOf: string | null;
  items: CollectionOfferView[];
}
