import {
  CHECKIN_REWARDS,
  checkinDayEnd,
  ECONOMY,
  findFrame,
  FRAMES,
  levelFromExp,
  type BigWinEvent,
  type FairnessInfo,
  type LeaderboardEntry,
  type PlayerStats,
  type PublicUser,
  type RoundSummary,
} from '@casino/shared';

/**
 * UI-preview build (VITE_DEMO=1): the client runs without a server and every
 * value comes from this file. The UI shows a permanent "demo data" banner.
 */
export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

/**
 * Values the server does not provide yet (VIP EXP and Charm are not implemented).
 * Sample numbers appear only in the preview build; live builds show 0 with a "Not live yet" tag.
 */
export const DEMO_EXTRAS = IS_DEMO ? { vipExp: 9_350, charm: 1_280 } : { vipExp: 0, charm: 0 };

const now = () => new Date();

let user: PublicUser = {
  id: '7c1d2e9a-4b3f-4f6e-9a21-5d8c0b7e3f10',
  uid: 100_428,
  username: 'corgi_vip',
  displayName: 'Corgi Royale',
  email: 'corgi@example.com',
  emailVerified: true,
    age: 21,
    renameFreeAvailable: true,
    renameAvailableAt: null,
    renameCards: 0,
  status: 'active',
  accountType: 'player',
  permissions: [],
  roles: [],
  avatarItem: null,
  unreadMail: 0,
  level: 1,
  title: null,
  chatBubble: null,
  cardBack: null,
  locale: 'vi',
  avatar: 3,
  role: 'player',
  badges: ['verified', 'partner'],
  balance: 128_450,
  gold: 36,
  frame: 'sapphire',
  ownedFrames: ['classic', 'silver', 'sapphire'],
  createdAt: '2026-10-01T09:00:00.000Z',
  checkin: { streak: 3, claimedToday: false, nextDay: 4, dayEndsAt: checkinDayEnd(now()).toISOString() },
};

const leaderboard: LeaderboardEntry[] = [
  { rank: 1, uid: 100017, username: 'lucky_tiger', displayName: 'Lucky Tiger', avatar: 4, avatarItem: null, frame: 'royal', badges: ['verified'], balance: 2_480_000 },
  { rank: 2, uid: 100052, username: 'emerald_queen', displayName: 'Emerald Queen', avatar: 2, avatarItem: null, frame: 'emerald', badges: ['partner'], balance: 1_965_500 },
  { rank: 3, uid: 100103, username: 'ace_hunter', displayName: 'Ace Hunter', avatar: 9, avatarItem: null, frame: 'ruby', badges: [], balance: 1_402_250 },
  { rank: 4, uid: 100428, username: 'corgi_vip', displayName: 'Corgi Royale', avatar: 3, avatarItem: null, frame: 'sapphire', badges: ['verified', 'partner'], balance: 128_450 },
  { rank: 5, uid: 100611, username: 'silver_fox', displayName: 'Silver Fox', avatar: 6, avatarItem: null, frame: 'silver', badges: [], balance: 98_300 },
  { rank: 6, uid: 100890, username: 'midnight', displayName: 'Midnight Ace', avatar: 12, avatarItem: null, frame: 'classic', badges: [], balance: 76_900 },
];

const bigWins: BigWinEvent[] = [
  { displayName: 'Lucky Tiger', badges: ['verified'], game: 'roulette', bet: 2_000, payout: 72_000, at: '2026-10-23T08:12:00.000Z' },
  { displayName: 'Emerald Queen', badges: ['partner'], game: 'sicbo', bet: 1_000, payout: 61_000, at: '2026-10-23T07:40:00.000Z' },
  { displayName: 'Ace Hunter', badges: [], game: 'blackjack', bet: 10_000, payout: 25_000, at: '2026-10-23T07:02:00.000Z' },
];

const stats: PlayerStats = {
  rounds: 342,
  wagered: 1_284_000,
  won: 1_198_750,
  biggestWin: 72_000,
  byGame: {
    slots: { rounds: 0, wagered: 0, won: 0 },
    roulette: { rounds: 120, wagered: 540_000, won: 512_300 },
    sicbo: { rounds: 140, wagered: 410_000, won: 388_450 },
    blackjack: { rounds: 82, wagered: 334_000, won: 298_000 },
    taixiu: { rounds: 0, wagered: 0, won: 0 },
    poker: { rounds: 0, wagered: 0, won: 0 },
    lieng: { rounds: 0, wagered: 0, won: 0 },
    xito: { rounds: 0, wagered: 0, won: 0 },
  },
};

const history: RoundSummary[] = [
  { id: 'd1', game: 'roulette', bet: 2_000, payout: 4_000, createdAt: '2026-10-23T08:20:00.000Z', nonce: 341 },
  { id: 'd2', game: 'blackjack', bet: 5_000, payout: 0, createdAt: '2026-10-23T08:14:00.000Z', nonce: 340 },
  { id: 'd3', game: 'sicbo', bet: 1_000, payout: 2_000, createdAt: '2026-10-23T08:09:00.000Z', nonce: 339 },
  { id: 'd4', game: 'roulette', bet: 500, payout: 18_000, createdAt: '2026-10-23T08:01:00.000Z', nonce: 338 },
];

const fairness: FairnessInfo = {
  serverSeedHash: '9f2c4e1a7b3d5f60c8e2a4b6d8f0123456789abcdef0123456789abcdef01234',
  clientSeed: 'corgi-demo',
  nonce: 342,
};

class DemoError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/** Answers the REST calls the preview needs. Unknown routes fail like an unreachable server. */
export async function demoApi(path: string, method: string, body: unknown): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 120));
  const itemId = (body as { itemId?: string } | undefined)?.itemId ?? '';
  switch (`${method} ${path}`) {
    case 'GET /api/me':
      return { user };
    case 'PATCH /api/me':
      user = { ...user, ...(body as Partial<PublicUser>) };
      return { user };
    case 'GET /api/me/stats':
      return { stats };
    case 'GET /api/me/history':
      return { rounds: history };
    case 'GET /api/me/fairness':
      return fairness;
    case 'GET /api/me/progress':
      return { level: levelFromExp(0), rank: null };
    case 'GET /api/rank/ladder':
      return { season: null, entries: [] };
    case 'GET /api/leaderboard/level':
    case 'GET /api/me/rank/history':
    case 'GET /api/me/rank/seasons':
      return { entries: [], events: [], results: [] };
    case 'GET /api/leaderboard':
      return { entries: leaderboard };
    case 'GET /api/bigwins':
      return { wins: bigWins };
    case 'POST /api/me/checkin': {
      if (user.checkin.claimedToday) throw new DemoError('checkin_done');
      const day = user.checkin.nextDay;
      const reward = CHECKIN_REWARDS[day - 1]!;
      user = {
        ...user,
        balance: user.balance + reward.silver,
        gold: user.gold + reward.gold,
        checkin: { ...user.checkin, streak: day, claimedToday: true, nextDay: (day % 7) + 1 },
      };
      return { day, reward, user };
    }
    case 'POST /api/shop/buy': {
      const frame = findFrame(itemId);
      if (!frame) throw new DemoError('item_not_found');
      if (user.ownedFrames.includes(itemId)) throw new DemoError('already_owned');
      if (user.balance < frame.price) throw new DemoError('insufficient_funds');
      user = { ...user, balance: user.balance - frame.price, ownedFrames: [...user.ownedFrames, itemId] };
      return { user };
    }
    case 'POST /api/me/frame':
      if (!user.ownedFrames.includes(itemId)) throw new DemoError('not_owned');
      user = { ...user, frame: itemId };
      return { user };
    case 'GET /api/catalog':
      return {
        items: FRAMES.map((f) => ({
          id: f.id,
          kind: 'frame',
          name: { vi: f.id, en: f.id },
          description: null,
          rarity: 'common',
          source: 'shop',
          tradable: false,
          status: 'released',
          assetUrl: null,
          animated: f.animated,
          render: null,
          style: { colors: [...f.colors], animated: f.animated },
          priceSilver: f.price,
        })),
      };
    case 'GET /api/me/inventory':
      return {
        items: user.ownedFrames.filter((f) => f !== 'classic').map((f) => ({ instanceId: `demo-${f}`, itemId: f, kind: 'frame', source: 'shop', acquiredAt: user.createdAt })),
        equipped: { frame: user.frame, avatarItem: null },
      };
    case 'POST /api/me/equip': {
      const { slot, itemId: next } = body as { slot: string; itemId: string | null };
      if (slot !== 'frame') throw new DemoError('not_owned');
      if (next && !user.ownedFrames.includes(next)) throw new DemoError('not_owned');
      user = { ...user, frame: next ?? 'none' };
      return { user };
    }
    case 'GET /api/mail':
      return { mail: [], unread: 0 };
    case 'GET /api/me/deletion':
      return { request: null };
    case 'POST /api/me/rescue':
      throw new DemoError('rescue_not_available');
    default:
      throw new DemoError('network');
  }
}

export const DEMO_TOKEN = 'demo-preview-token';
export const DEMO_WELCOME = ECONOMY.welcome;
