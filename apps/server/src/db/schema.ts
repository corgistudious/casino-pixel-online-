import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    usernameLower: text('username_lower').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    locale: text('locale').notNull().default('vi'),
    avatar: integer('avatar').notNull().default(0),
    role: text('role').notNull().default('player'),
    banned: boolean('banned').notNull().default(false),
    tokenVersion: integer('token_version').notNull().default(0),
    /** Deprecated by the 7-day check-in; kept so existing data is never dropped. */
    lastDailyBonusAt: timestamp('last_daily_bonus_at', { withTimezone: true }),
    /** Equipped cosmetic avatar frame (see FRAMES in @casino/shared). */
    frame: text('frame').notNull().default('classic'),
    isVerified: boolean('is_verified').notNull().default(false),
    isPartner: boolean('is_partner').notNull().default(false),
    /** Days completed in the current 7-day check-in cycle. */
    checkinStreak: integer('checkin_streak').notNull().default(0),
    /** Local (Asia/Ho_Chi_Minh) date of the last check-in. */
    lastCheckinDate: date('last_checkin_date', { mode: 'string' }),
    lastRescueAt: timestamp('last_rescue_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_username_lower_idx').on(t.usernameLower)],
);

export const wallets = pgTable(
  'wallets',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Cxu Bạc */
    balance: bigint('balance', { mode: 'number' }).notNull(),
    /** Cxu Vàng */
    gold: bigint('gold', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('wallets_balance_non_negative', sql`${t.balance} >= 0`),
    check('wallets_gold_non_negative', sql`${t.gold} >= 0`),
    index('wallets_balance_idx').on(t.balance),
  ],
);

/** Append-only record of every balance change. Per user and currency, sum(delta) == wallet balance. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    currency: text('currency').notNull().default('silver'),
    delta: bigint('delta', { mode: 'number' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    roundId: uuid('round_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ledger_user_idx').on(t.userId, t.id)],
);

/** Cosmetic items owned by a player (bought with Cxu Vàng). */
export const userItems = pgTable(
  'user_items',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    itemId: text('item_id').notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);

export const fairSeeds = pgTable(
  'fair_seeds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    serverSeed: text('server_seed').notNull(),
    serverSeedHash: text('server_seed_hash').notNull(),
    clientSeed: text('client_seed').notNull(),
    nonce: integer('nonce').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revealedAt: timestamp('revealed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('fair_seeds_one_active_idx').on(t.userId).where(sql`${t.active}`)],
);

export const gameRounds = pgTable(
  'game_rounds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    game: text('game').notNull(),
    /** Total amount staked (includes blackjack doubles). */
    bet: bigint('bet', { mode: 'number' }).notNull(),
    payout: bigint('payout', { mode: 'number' }).notNull().default(0),
    status: text('status').notNull(),
    /** Private server state (e.g. remaining blackjack shoe). Never sent to clients. */
    state: jsonb('state'),
    /** Public result returned to the client and used for idempotent replays. */
    result: jsonb('result'),
    seedId: uuid('seed_id').references(() => fairSeeds.id),
    nonce: integer('nonce'),
    idempotencyKey: text('idempotency_key').notNull(),
    lastActionKey: text('last_action_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('game_rounds_idempotency_idx').on(t.userId, t.idempotencyKey),
    uniqueIndex('game_rounds_one_active_idx').on(t.userId, t.game).where(sql`${t.status} = 'active'`),
    index('game_rounds_user_created_idx').on(t.userId, t.createdAt),
  ],
);
