import type { ItemSource, ItemStatus, Rarity } from './cosmetics';
import { FRAME_FAMILIES, PODIUM_TIERS, type FrameFamily, type PodiumTier } from './leaderboards';
import { KEYO_CAPTAIN_UID, KEYO_OWNER_UID, type RoleId } from './rbac';

/**
 * The built-in avatar frame library. Every frame here is a catalog item (seeded by migration 0034)
 * whose look is a parametric vector artwork drawn by the client (`style.art` = the item id): a
 * metal ring with real ornaments, an emblem medallion and repeated motifs — not a recoloured
 * border. The avatar stays in the transparent centre; nothing rotates; animation is a soft sheen
 * and twinkles, only where the avatar is shown large enough.
 */

export type FrameShape = 'podium' | 'hof' | 'season' | 'tournament' | 'role';
export type FrameOrnament = 'crown' | 'tiara' | 'laurel' | 'wings' | 'star' | 'shield' | 'gem' | 'horns' | 'none';
export const FRAME_GLYPHS = [
  'spade', 'dice', 'wheel', 'cards', 'chip', 'ace', 'vip', 'heart', 'user', 'trophy', 'banner', 'star',
  'pumpkin', 'moon', 'ghost', 'snowflake', 'tree', 'gift', 'firework', 'clock', 'lantern', 'blossom', 'dragon', 'rose',
  'sun', 'pearl', 'wave', 'rabbit', 'palace', 'cake', 'diamond', 'keyo', 'shield', 'gavel', 'eye', 'crown', 'bat', 'mooncake', 'coin', 'medal',
] as const;
export type FrameGlyph = (typeof FRAME_GLYPHS)[number];

export interface FrameArt {
  shape: FrameShape;
  /** Ring gradient (light → dark), accent (gems, details), glow. */
  palette: { light: string; mid: string; dark: string; accent: string; glow: string };
  ornament: FrameOrnament;
  /** Medallion at the bottom of the ring. */
  emblem: FrameGlyph;
  /** Small decorations around the ring. */
  motif: FrameGlyph | null;
  motifCount: number;
  /** 1 (simple) – 4 (richest): ring thickness and detail. */
  tier: 1 | 2 | 3 | 4;
  sheen: boolean;
  twinkle: boolean;
}

export interface FrameDef {
  id: string;
  name: { vi: string; en: string };
  description: { vi: string; en: string };
  rarity: Rarity;
  source: ItemSource;
  status: ItemStatus;
  /** Grouping in the Frame Library. */
  collection: 'podium' | 'hall_of_fame' | 'seasonal' | 'tournament' | 'role';
  art: FrameArt;
  /** For role frames: the role (and for Owner variants, the UID) that may wear it. */
  role?: { roleId: RoleId; uid?: number };
  /** Seasonal collection key and year. */
  season?: { theme: SeasonTheme; year: number };
}

const TIER_LOOK: Record<PodiumTier, { light: string; mid: string; dark: string; glow: string; ornament: FrameOrnament; tier: 1 | 2 | 3 | 4; rarity: Rarity }> = {
  champion: { light: '#fff3b0', mid: '#f2c14e', dark: '#8a5a12', glow: '#ffd76a', ornament: 'crown', tier: 4, rarity: 'mythic' },
  elite: { light: '#ffffff', mid: '#c9d6e8', dark: '#5b6b82', glow: '#dfe9ff', ornament: 'tiara', tier: 3, rarity: 'legendary' },
  master: { light: '#ffd9b0', mid: '#cd7f32', dark: '#6b3a12', glow: '#ffb070', ornament: 'laurel', tier: 2, rarity: 'epic' },
};

const FAMILY: Record<FrameFamily, { emblem: FrameGlyph; accent: string; vi: string; en: string }> = {
  poker: { emblem: 'spade', accent: '#e23b55', vi: 'Poker', en: 'Poker' },
  taixiu: { emblem: 'dice', accent: '#ff5a5a', vi: 'Tài Xỉu', en: 'Tài Xỉu' },
  roulette: { emblem: 'wheel', accent: '#20c070', vi: 'Roulette', en: 'Roulette' },
  lieng: { emblem: 'cards', accent: '#8a5cff', vi: 'Liêng', en: 'Liêng' },
  xito: { emblem: 'chip', accent: '#2fa4ff', vi: 'Xì Tố', en: 'Xì Tố' },
  blackjack: { emblem: 'ace', accent: '#111111', vi: 'Blackjack', en: 'Blackjack' },
  vip: { emblem: 'vip', accent: '#c13cff', vi: 'VIP', en: 'VIP' },
  charm: { emblem: 'heart', accent: '#ff4f9a', vi: 'Hấp Dẫn', en: 'Charm' },
  profile: { emblem: 'user', accent: '#33d1c4', vi: 'Hồ Sơ', en: 'Profile' },
  tournament: { emblem: 'trophy', accent: '#ffb000', vi: 'Tournament', en: 'Tournament' },
  guild: { emblem: 'banner', accent: '#3d7bff', vi: 'Guild', en: 'Guild' },
  event: { emblem: 'star', accent: '#ff7a1a', vi: 'Sự Kiện', en: 'Event' },
};
const TIER_NAME: Record<PodiumTier, { vi: string; en: string; place: number }> = {
  champion: { vi: 'Champion', en: 'Champion', place: 1 },
  elite: { vi: 'Elite', en: 'Elite', place: 2 },
  master: { vi: 'Master', en: 'Master', place: 3 },
};

const podium: FrameDef[] = FRAME_FAMILIES.flatMap((family) =>
  PODIUM_TIERS.map((tier) => {
    const t = TIER_LOOK[tier];
    const f = FAMILY[family];
    const n = TIER_NAME[tier];
    return {
      id: `lb_${family}_${tier}`,
      name: { vi: `Top ${n.place} ${f.vi} · ${n.vi}`, en: `Top ${n.place} ${f.en} · ${n.en}` },
      description: {
        vi: `Khung đương kim Top ${n.place} bảng ${f.vi} tháng trước. Chỉ dùng được trong tháng giữ ngôi, tự hết hạn khi kỳ kết thúc.`,
        en: `Reigning Top ${n.place} frame of last month's ${f.en} board. Usable only during the reign; it expires when the period ends.`,
      },
      rarity: t.rarity,
      source: 'leaderboard',
      status: 'released',
      collection: 'podium',
      art: { shape: 'podium', palette: { light: t.light, mid: t.mid, dark: t.dark, accent: f.accent, glow: t.glow }, ornament: t.ornament, emblem: f.emblem, motif: tier === 'champion' ? 'star' : null, motifCount: tier === 'champion' ? 6 : 0, tier: t.tier, sheen: true, twinkle: tier !== 'master' },
    } satisfies FrameDef;
  }),
);

const hallOfFame: FrameDef[] = PODIUM_TIERS.map((tier) => {
  const t = TIER_LOOK[tier];
  const n = TIER_NAME[tier];
  return {
    id: `hof_${tier}`,
    name: { vi: `Đại Sảnh Danh Vọng · Top ${n.place}`, en: `Hall of Fame · Top ${n.place}` },
    description: {
      vi: `Khung vĩnh viễn: trao lần đầu kết thúc một tháng ở Top ${n.place} bất kỳ bảng xếp hạng có thưởng. Không bị thu hồi khi tụt hạng.`,
      en: `Permanent frame: given the first time you finish a month at Top ${n.place} of any rewarded leaderboard. Never taken back for dropping in rank.`,
    },
    rarity: t.rarity,
    source: 'leaderboard',
    status: 'released',
    collection: 'hall_of_fame',
    art: { shape: 'hof', palette: { light: t.light, mid: t.mid, dark: t.dark, accent: '#7b1fa2', glow: t.glow }, ornament: 'wings', emblem: 'medal', motif: 'diamond', motifCount: 4, tier: t.tier, sheen: true, twinkle: true },
  } satisfies FrameDef;
});

export const SEASON_THEMES = ['halloween', 'christmas', 'new_year', 'lunar_new_year', 'valentine', 'summer', 'mid_autumn', 'anniversary'] as const;
export type SeasonTheme = (typeof SEASON_THEMES)[number];

type SeasonFrameSpec = { key: string; vi: string; en: string; palette: FrameArt['palette']; ornament: FrameOrnament; emblem: FrameGlyph; motif: FrameGlyph };
const SEASONS: Record<SeasonTheme, { vi: string; en: string; frames: [SeasonFrameSpec, SeasonFrameSpec, SeasonFrameSpec] }> = {
  halloween: {
    vi: 'Halloween',
    en: 'Halloween',
    frames: [
      { key: 'pumpkin_night', vi: 'Đêm Bí Ngô', en: 'Pumpkin Night', palette: { light: '#ffc46b', mid: '#ff7a1a', dark: '#4a1a05', accent: '#3b1458', glow: '#ff9b3d' }, ornament: 'none', emblem: 'pumpkin', motif: 'bat' },
      { key: 'haunted_moon', vi: 'Trăng Ma Ám', en: 'Haunted Moon', palette: { light: '#d9d2ff', mid: '#6b4bd6', dark: '#1b0f3a', accent: '#a4ff6a', glow: '#b9a8ff' }, ornament: 'horns', emblem: 'moon', motif: 'ghost' },
      { key: 'phantom_crown', vi: 'Vương Miện Bóng Ma', en: 'Phantom Crown', palette: { light: '#e6c3ff', mid: '#8e24aa', dark: '#14041f', accent: '#ff7a1a', glow: '#d58bff' }, ornament: 'crown', emblem: 'ghost', motif: 'pumpkin' },
    ],
  },
  christmas: {
    vi: 'Giáng Sinh',
    en: 'Christmas',
    frames: [
      { key: 'snowflake', vi: 'Bông Tuyết', en: 'Snowflake', palette: { light: '#ffffff', mid: '#9fd8ff', dark: '#1d4f86', accent: '#e8f7ff', glow: '#cdeeff' }, ornament: 'none', emblem: 'snowflake', motif: 'snowflake' },
      { key: 'golden_christmas', vi: 'Giáng Sinh Vàng', en: 'Golden Christmas', palette: { light: '#fff1b8', mid: '#e0a92a', dark: '#1f5a2a', accent: '#d62b3c', glow: '#ffd76a' }, ornament: 'star', emblem: 'tree', motif: 'gift' },
      { key: 'winter_royalty', vi: 'Hoàng Gia Mùa Đông', en: 'Winter Royalty', palette: { light: '#ffffff', mid: '#b8c8ff', dark: '#26306e', accent: '#7fe0ff', glow: '#e1e8ff' }, ornament: 'crown', emblem: 'snowflake', motif: 'diamond' },
    ],
  },
  new_year: {
    vi: 'Năm Mới',
    en: 'Happy New Year',
    frames: [
      { key: 'midnight_fireworks', vi: 'Pháo Hoa Nửa Đêm', en: 'Midnight Fireworks', palette: { light: '#d6e2ff', mid: '#3b4cc0', dark: '#0a0f2e', accent: '#ff4fd8', glow: '#8fa6ff' }, ornament: 'none', emblem: 'firework', motif: 'firework' },
      { key: 'golden_countdown', vi: 'Đếm Ngược Vàng', en: 'Golden Countdown', palette: { light: '#fff3c4', mid: '#e7b43a', dark: '#4a3008', accent: '#111111', glow: '#ffe08a' }, ornament: 'star', emblem: 'clock', motif: 'star' },
      { key: 'new_year_royal', vi: 'Năm Mới Hoàng Gia', en: 'New Year Royal', palette: { light: '#fff6d6', mid: '#f2c14e', dark: '#3a0d4f', accent: '#ff4fd8', glow: '#ffd76a' }, ornament: 'crown', emblem: 'firework', motif: 'diamond' },
    ],
  },
  lunar_new_year: {
    vi: 'Tết Nguyên Đán',
    en: 'Lunar New Year',
    frames: [
      { key: 'lucky_lantern', vi: 'Đèn Lồng May Mắn', en: 'Lucky Lantern', palette: { light: '#ffd27a', mid: '#e0262f', dark: '#5a0a10', accent: '#ffd76a', glow: '#ff6b5a' }, ornament: 'none', emblem: 'lantern', motif: 'coin' },
      { key: 'golden_blossom', vi: 'Hoa Mai Vàng', en: 'Golden Blossom', palette: { light: '#fff4b0', mid: '#ffc21a', dark: '#7a2a05', accent: '#e0262f', glow: '#ffe066' }, ornament: 'laurel', emblem: 'blossom', motif: 'blossom' },
      { key: 'lunar_emperor', vi: 'Hoàng Đế Âm Lịch', en: 'Lunar Emperor', palette: { light: '#fff1a8', mid: '#e8b021', dark: '#6b0b0b', accent: '#e0262f', glow: '#ffd23d' }, ornament: 'crown', emblem: 'dragon', motif: 'lantern' },
    ],
  },
  valentine: {
    vi: 'Valentine',
    en: "Valentine's Day",
    frames: [
      { key: 'ruby_heart', vi: 'Trái Tim Hồng Ngọc', en: 'Ruby Heart', palette: { light: '#ffc2d1', mid: '#e0245e', dark: '#5a0620', accent: '#ffffff', glow: '#ff7aa3' }, ornament: 'none', emblem: 'heart', motif: 'heart' },
      { key: 'rose_crown', vi: 'Vương Miện Hoa Hồng', en: 'Rose Crown', palette: { light: '#ffd6e0', mid: '#ff4f7a', dark: '#4a0a1f', accent: '#2e8b57', glow: '#ff9bb5' }, ornament: 'tiara', emblem: 'rose', motif: 'rose' },
      { key: 'eternal_love', vi: 'Tình Yêu Vĩnh Cửu', en: 'Eternal Love', palette: { light: '#fff0f5', mid: '#f2a1c0', dark: '#6b1238', accent: '#f2c14e', glow: '#ffc2dc' }, ornament: 'wings', emblem: 'heart', motif: 'diamond' },
    ],
  },
  summer: {
    vi: 'Lễ Hội Mùa Hè',
    en: 'Summer Festival',
    frames: [
      { key: 'tropical_sun', vi: 'Mặt Trời Nhiệt Đới', en: 'Tropical Sun', palette: { light: '#fff6a8', mid: '#ffb21a', dark: '#a8380a', accent: '#1ec8b0', glow: '#ffd23d' }, ornament: 'none', emblem: 'sun', motif: 'sun' },
      { key: 'ocean_pearl', vi: 'Ngọc Trai Đại Dương', en: 'Ocean Pearl', palette: { light: '#e6fbff', mid: '#38b6d8', dark: '#0a3a5a', accent: '#ffffff', glow: '#9ae6ff' }, ornament: 'gem', emblem: 'pearl', motif: 'wave' },
      { key: 'summer_crown', vi: 'Vương Miện Mùa Hè', en: 'Summer Crown', palette: { light: '#fff3c4', mid: '#f2c14e', dark: '#0a5a6b', accent: '#1ec8b0', glow: '#ffe08a' }, ornament: 'crown', emblem: 'sun', motif: 'pearl' },
    ],
  },
  mid_autumn: {
    vi: 'Trung Thu',
    en: 'Mid-Autumn Festival',
    frames: [
      { key: 'moon_rabbit', vi: 'Thỏ Ngọc', en: 'Moon Rabbit', palette: { light: '#fffbe6', mid: '#ffd98a', dark: '#5a3a0a', accent: '#ff6b5a', glow: '#fff0b3' }, ornament: 'none', emblem: 'rabbit', motif: 'mooncake' },
      { key: 'golden_moon', vi: 'Trăng Vàng', en: 'Golden Moon', palette: { light: '#fff6c4', mid: '#f0b63a', dark: '#2a1a5a', accent: '#ffffff', glow: '#ffe08a' }, ornament: 'star', emblem: 'moon', motif: 'lantern' },
      { key: 'moon_palace', vi: 'Cung Trăng', en: 'Moon Palace', palette: { light: '#fff4dc', mid: '#e8c27a', dark: '#3a1a5a', accent: '#e0262f', glow: '#ffe6b0' }, ornament: 'crown', emblem: 'palace', motif: 'moon' },
    ],
  },
  anniversary: {
    vi: 'Kỷ Niệm Keyo',
    en: 'Keyo Anniversary',
    frames: [
      { key: 'anniversary_gold', vi: 'Kỷ Niệm Vàng', en: 'Anniversary Gold', palette: { light: '#fff3b0', mid: '#f2c14e', dark: '#7a4a0a', accent: '#7b1fa2', glow: '#ffd76a' }, ornament: 'laurel', emblem: 'cake', motif: 'star' },
      { key: 'anniversary_diamond', vi: 'Kỷ Niệm Kim Cương', en: 'Anniversary Diamond', palette: { light: '#ffffff', mid: '#9ee8ff', dark: '#2a4a8a', accent: '#c13cff', glow: '#d6f6ff' }, ornament: 'gem', emblem: 'diamond', motif: 'diamond' },
      { key: 'keyo_royal_legacy', vi: 'Di Sản Hoàng Gia Keyo', en: 'Keyo Royal Legacy', palette: { light: '#fff6d6', mid: '#f2c14e', dark: '#2a0a3a', accent: '#c13cff', glow: '#ffd76a' }, ornament: 'crown', emblem: 'keyo', motif: 'diamond' },
    ],
  },
};

export const SEASON_YEAR = 2026;
const seasonal: FrameDef[] = SEASON_THEMES.flatMap((theme) =>
  SEASONS[theme].frames.map((f, i) => {
    const rarity: Rarity = (['rare', 'epic', 'legendary'] as const)[i]!;
    return {
      id: `ss${SEASON_YEAR}_${f.key}`,
      name: { vi: f.vi, en: f.en },
      description: {
        vi: `Bộ sưu tập ${SEASONS[theme].vi} ${SEASON_YEAR}. Phát hành theo sự kiện do Owner mở; người đã sở hữu luôn giữ quyền trang bị.`,
        en: `${SEASONS[theme].en} ${SEASON_YEAR} collection. Released with an event the Owner opens; owners always keep the right to wear it.`,
      },
      rarity,
      source: 'season',
      // Owners release each seasonal frame (and set a price, if sold) from Admin → Items.
      status: 'draft',
      collection: 'seasonal',
      season: { theme, year: SEASON_YEAR },
      art: { shape: 'season', palette: f.palette, ornament: f.ornament, emblem: f.emblem, motif: f.motif, motifCount: [4, 6, 8][i]!, tier: ([2, 3, 4] as const)[i]!, sheen: i > 0, twinkle: i === 2 },
    } satisfies FrameDef;
  }),
);

const TOURNAMENT: { id: string; vi: string; en: string; rarity: Rarity; tier: 1 | 2 | 3 | 4; palette: FrameArt['palette']; ornament: FrameOrnament; emblem: FrameGlyph }[] = [
  { id: 'tour_participant', vi: 'Tournament · Tham Gia', en: 'Tournament · Participant', rarity: 'common', tier: 1, palette: { light: '#dfe7f2', mid: '#7f93ad', dark: '#2a3448', accent: '#3d7bff', glow: '#b8c8e0' }, ornament: 'none', emblem: 'trophy' },
  { id: 'tour_top10', vi: 'Tournament · Top 10', en: 'Tournament · Top 10', rarity: 'rare', tier: 2, palette: { light: '#cfe6ff', mid: '#3d7bff', dark: '#10285a', accent: '#ffffff', glow: '#8fb6ff' }, ornament: 'shield', emblem: 'trophy' },
  { id: 'tour_top3', vi: 'Tournament · Top 3', en: 'Tournament · Top 3', rarity: 'epic', tier: 3, palette: { light: '#ffd9b0', mid: '#cd7f32', dark: '#4a2208', accent: '#3d7bff', glow: '#ffb070' }, ornament: 'laurel', emblem: 'trophy' },
  { id: 'tour_runner_up', vi: 'Tournament · Á Quân', en: 'Tournament · Runner-up', rarity: 'legendary', tier: 3, palette: { light: '#ffffff', mid: '#c9d6e8', dark: '#3a4a62', accent: '#3d7bff', glow: '#dfe9ff' }, ornament: 'tiara', emblem: 'trophy' },
  { id: 'tour_champion', vi: 'Tournament · Vô Địch', en: 'Tournament · Champion', rarity: 'mythic', tier: 4, palette: { light: '#fff3b0', mid: '#f2c14e', dark: '#5a3a08', accent: '#e23b55', glow: '#ffd76a' }, ornament: 'crown', emblem: 'trophy' },
  { id: 'tour_special', vi: 'Tournament · Đặc Biệt', en: 'Tournament · Special Event', rarity: 'legendary', tier: 3, palette: { light: '#f3d6ff', mid: '#a855f7', dark: '#2a0a4a', accent: '#f2c14e', glow: '#d8a8ff' }, ornament: 'star', emblem: 'medal' },
];
const tournament: FrameDef[] = TOURNAMENT.map((t) => ({
  id: t.id,
  name: { vi: t.vi, en: t.en },
  description: {
    vi: 'Trao khi giải đấu đã kết thúc và kết quả được xác nhận. Tên giải, mùa, năm và trò chơi hiển thị trong chi tiết vật phẩm.',
    en: 'Given when a tournament has finished and its results are confirmed. Tournament name, season, year and game are shown in the item details.',
  },
  rarity: t.rarity,
  source: 'tournament',
  status: 'released',
  collection: 'tournament',
  art: { shape: 'tournament', palette: t.palette, ornament: t.ornament, emblem: t.emblem, motif: t.tier >= 3 ? 'star' : null, motifCount: t.tier >= 3 ? 4 : 0, tier: t.tier, sheen: t.tier >= 3, twinkle: t.tier === 4 },
}));

const ROLE: { id: string; vi: string; en: string; role: FrameDef['role']; palette: FrameArt['palette']; ornament: FrameOrnament; emblem: FrameGlyph; tier: 1 | 2 | 3 | 4; motif: FrameGlyph | null }[] = [
  { id: 'role_owner_captain', vi: 'Owner · Keyo Captain', en: 'Owner · Keyo Captain', role: { roleId: 'owner', uid: KEYO_CAPTAIN_UID }, palette: { light: '#fff6c8', mid: '#f2c14e', dark: '#5a2a00', accent: '#7b1fa2', glow: '#ffe08a' }, ornament: 'crown', emblem: 'keyo', tier: 4, motif: 'diamond' },
  { id: 'role_owner_gm', vi: 'Owner · Keyo_GM', en: 'Owner · Keyo_GM', role: { roleId: 'owner', uid: KEYO_OWNER_UID }, palette: { light: '#fff1b0', mid: '#e8b021', dark: '#3a0a0a', accent: '#e23b55', glow: '#ffd76a' }, ornament: 'crown', emblem: 'crown', tier: 4, motif: 'diamond' },
  { id: 'role_super_admin', vi: 'Super Admin', en: 'Super Admin', role: { roleId: 'super_admin' }, palette: { light: '#ffffff', mid: '#d8e2f0', dark: '#6b5a2a', accent: '#f2c14e', glow: '#eef4ff' }, ornament: 'tiara', emblem: 'gavel', tier: 3, motif: 'star' },
  { id: 'role_admin', vi: 'Admin', en: 'Admin', role: { roleId: 'admin' }, palette: { light: '#cfe0ff', mid: '#2f5fd0', dark: '#0a1a4a', accent: '#f2c14e', glow: '#8fb0ff' }, ornament: 'shield', emblem: 'shield', tier: 3, motif: null },
  { id: 'role_moderator', vi: 'Moderator', en: 'Moderator', role: { roleId: 'moderator' }, palette: { light: '#e6f2ff', mid: '#7fa8c8', dark: '#1a3a4a', accent: '#33d1c4', glow: '#c8e6ff' }, ornament: 'shield', emblem: 'eye', tier: 2, motif: null },
];
const role: FrameDef[] = ROLE.map((r) => ({
  id: r.id,
  name: { vi: `Khung ${r.vi}`, en: `${r.en} Frame` },
  description: {
    vi: 'Khung đặc quyền theo vai trò quản trị thật. Không bán, không tặng, không chuyển nhượng; mất vai trò thì không dùng được nữa. Chỉ là dấu hiệu nhận diện, không cấp thêm quyền.',
    en: 'Privilege frame tied to a real staff role. Never sold, gifted or traded; it stops working when the role is removed. A visual sign only — it grants no permission.',
  },
  rarity: 'mythic',
  source: 'role',
  status: 'released',
  collection: 'role',
  role: r.role,
  art: { shape: 'role', palette: r.palette, ornament: r.ornament, emblem: r.emblem, motif: r.motif, motifCount: r.motif ? 4 : 0, tier: r.tier, sheen: true, twinkle: r.tier === 4 },
}));

export const FRAME_LIBRARY: readonly FrameDef[] = [...podium, ...hallOfFame, ...seasonal, ...tournament, ...role];
export const frameDef = (id: string) => FRAME_LIBRARY.find((f) => f.id === id);
export const ROLE_FRAMES = role;
