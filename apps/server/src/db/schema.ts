import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  bigserial,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    /** Internal account id. Never shown to players. */
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Public UID. Regular accounts draw from player_uid_seq (100000, 100001, …);
     * 1–99999 are assigned manually by admins; 1000 is Keyo Captain (Owner + official support). Never changes or is reused.
     */
    uid: bigint('uid', { mode: 'number' })
      .notNull()
      .default(sql`nextval('player_uid_seq')`),
    username: text('username').notNull(),
    usernameLower: text('username_lower').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    age: integer('age'),
    locale: text('locale').notNull().default('vi'),
    avatar: integer('avatar').notNull().default(0),
    /** Legacy single role; superseded by user_roles (kept so existing data is never dropped). */
    role: text('role').notNull().default('player'),
    /** Legacy flag; superseded by the bans table. */
    banned: boolean('banned').notNull().default(false),
    email: text('email'),
    emailLower: text('email_lower'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    /** pending_verification | pending_activation | active | restricted | deleted */
    status: text('status').notNull().default('active'),
    /** player | system_support */
    accountType: text('account_type').notNull().default('player'),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    starterGrantedAt: timestamp('starter_granted_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    /**
     * TEST account flag. Left unset on insert, the users_set_is_test trigger fills it from
     * environment_state.mode (test → true); in production mode test accounts are rejected.
     */
    isTest: boolean('is_test').notNull().default(sql`NULL`),
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
    /** Equipped special avatar (catalog item id); null = default avatar `avatar`. */
    avatarItem: text('avatar_item'),
    /** Equipped title, chat bubble and card back (catalog item ids). */
    equippedTitle: text('equipped_title'),
    equippedBubble: text('equipped_bubble'),
    equippedCardBack: text('equipped_card_back'),
    equippedTableSkin: text('equipped_table_skin'),
    equippedVictoryEffect: text('equipped_victory_effect'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_username_lower_idx').on(t.usernameLower),
    uniqueIndex('users_uid_idx').on(t.uid),
    uniqueIndex('users_email_lower_idx').on(t.emailLower).where(sql`${t.emailLower} IS NOT NULL`),
    index('users_is_test_idx').on(t.isTest).where(sql`${t.isTest}`),
    check('users_uid_positive', sql`${t.uid} >= 1`),
  ],
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
    /** What caused a non-game movement, e.g. "mail:<uuid>". */
    ref: text('ref'),
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

// ---------------------------------------------------------------- accounts & security

/** Roles are data so admins can manage them; the permission catalogue lives in code. */
export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  /** System roles cannot be deleted. */
  system: boolean('system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    grantedBy: uuid('granted_by'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.roleId] }),
    // Only UID 1000 (Keyo Captain) and UID 1002 (Keyo GM) can hold the Owner role, and nobody can
    // move or remove it: enforced by the user_roles_owner_guard trigger (migrations 0004, 0032).
  ],
);

/**
 * Idempotency records for administrative writes (grants, mail, issuance). The client sends a
 * fresh key per intended action; a retry with the same key returns the stored result instead of
 * applying the change twice.
 */
export const adminOperations = pgTable('admin_operations', {
  id: uuid('id').primaryKey(),
  /** Staff account that performed the operation (no FK: operations outlive test-data resets). */
  actorId: uuid('actor_id').notNull(),
  kind: text('kind').notNull(),
  requestHash: text('request_hash').notNull(),
  result: jsonb('result'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only audit trail for security-relevant and administrative actions. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    details: jsonb('details'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_logs_target_idx').on(t.targetType, t.targetId), index('audit_logs_created_idx').on(t.createdAt)],
);

export const bans = pgTable(
  'bans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    evidence: text('evidence'),
    issuedBy: uuid('issued_by'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null = permanent. Temporary bans expire automatically once ends_at has passed. */
    endsAt: timestamp('ends_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by'),
    revokeReason: text('revoke_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('bans_user_idx').on(t.userId)],
);

/** One-time email codes/links. Only hashes are stored. */
export const emailTokens = pgTable(
  'email_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** verify_email | reset_password | activate */
    purpose: text('purpose').notNull(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('email_tokens_token_hash_idx').on(t.tokenHash), index('email_tokens_user_idx').on(t.userId, t.purpose)],
);

/** Outgoing mail queue; a worker delivers through SMTP when configured. */
export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    toAddress: text('to_address').notNull(),
    subject: text('subject').notNull(),
    bodyText: text('body_text').notNull(),
    bodyHtml: text('body_html').notNull(),
    /** Machine-readable template id, e.g. verify_email. */
    template: text('template').notNull(),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [index('email_outbox_status_idx').on(t.status, t.id)],
);

export const accountDeletionRequests = pgTable(
  'account_deletion_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** pending | cancelled | rejected | completed */
    status: text('status').notNull().default('pending'),
    reason: text('reason'),
    decidedBy: uuid('decided_by'),
    decisionNote: text('decision_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('account_deletion_one_pending_idx').on(t.userId).where(sql`${t.status} = 'pending'`)],
);

/**
 * Single row describing what kind of data this database holds. 'test' until the owner runs
 * launch:production; triggers forbid going back to 'test' or deleting the row.
 */
export const environmentState = pgTable(
  'environment_state',
  {
    id: smallint('id').primaryKey().default(1),
    /** test | production */
    mode: text('mode').notNull().default('test'),
    launchedAt: timestamp('launched_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('environment_state_singleton', sql`${t.id} = 1`), check('environment_state_mode', sql`${t.mode} IN ('test', 'production')`)],
);

/** Log of maintenance commands (test-data reset, production launch), including refused runs and dry runs. */
export const maintenanceRuns = pgTable('maintenance_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  /** reset_test_data | launch_production | create_test_accounts */
  kind: text('kind').notNull(),
  dryRun: boolean('dry_run').notNull(),
  /** OS user / operator name given on the command line. */
  operator: text('operator').notNull(),
  /** started | succeeded | failed | refused */
  status: text('status').notNull().default('started'),
  backupPath: text('backup_path'),
  details: jsonb('details'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/**
 * Uploaded images (frames, avatars, collectibles), content-addressed by SHA-256. Stored in
 * PostgreSQL so backups cover them and every server instance can serve them.
 */
export const assets = pgTable('assets', {
  id: text('id').primaryKey(),
  mime: text('mime').notNull(),
  bytes: bytea('bytes').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  size: integer('size').notNull(),
  animated: boolean('animated').notNull().default(false),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Everything a player can own. Rows are never deleted (ownership must survive); retire with status "hidden". */
export const catalogItems = pgTable(
  'catalog_items',
  {
    id: text('id').primaryKey(),
    /** frame | avatar | collectible */
    kind: text('kind').notNull(),
    nameVi: text('name_vi').notNull(),
    nameEn: text('name_en').notNull(),
    descVi: text('desc_vi'),
    descEn: text('desc_en'),
    rarity: text('rarity').notNull().default('common'),
    source: text('source').notNull().default('shop'),
    tradable: boolean('tradable').notNull().default(false),
    /** draft | released | hidden */
    status: text('status').notNull().default('draft'),
    assetId: text('asset_id').references(() => assets.id, { onDelete: 'restrict' }),
    /** Frame placement for uploaded images: { scale, offsetX, offsetY }. */
    render: jsonb('render'),
    /** Built-in drawn frames: { colors, animated }. */
    style: jsonb('style'),
    priceSilver: bigint('price_silver', { mode: 'number' }),
    priceGold: bigint('price_gold', { mode: 'number' }),
    sort: integer('sort').notNull().default(0),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('catalog_items_kind', sql`${t.kind} IN ('frame', 'avatar', 'title', 'chat_bubble', 'card_back', 'table_skin', 'victory_effect', 'collectible')`),
    check('catalog_items_status', sql`${t.status} IN ('draft', 'released', 'hidden')`),
    check('catalog_items_price', sql`${t.priceSilver} IS NULL OR ${t.priceSilver} >= 0`),
  ],
);

/** Owned item instances. Frames and avatars can be held once per player (unique index). */
export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    itemId: text('item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'restrict' }),
    /** Copied from the catalog (immutable) so uniqueness can be indexed. */
    kind: text('kind').notNull(),
    source: text('source').notNull(),
    /** e.g. mail id or admin operation id that granted it. */
    sourceRef: text('source_ref'),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
    /** Timed items: usable until then (the row stays as ownership history); null = permanent. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    index('inventory_items_user_idx').on(t.userId),
    index('inventory_items_item_idx').on(t.itemId),
    uniqueIndex('inventory_items_unique_cosmetic_idx').on(t.userId, t.itemId).where(sql`${t.kind} IN ('frame', 'avatar', 'title', 'chat_bubble', 'card_back', 'table_skin', 'victory_effect')`),
    index('inventory_items_expiry_idx').on(t.expiresAt).where(sql`${t.expiresAt} IS NOT NULL`),
  ],
);

/** One admin send (to listed UIDs or everyone), for the history view. */
export const mailBatches = pgTable('mail_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdBy: uuid('created_by'),
  kind: text('kind').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  attachments: jsonb('attachments').notNull(),
  target: jsonb('target').notNull(),
  recipients: integer('recipients').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Personal mailbox. Attachments are granted only when the player claims them (once). */
export const mailMessages = pgTable(
  'mail_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull().default(''),
    attachments: jsonb('attachments').notNull().default(sql`'[]'::jsonb`),
    batchId: uuid('batch_id').references(() => mailBatches.id, { onDelete: 'restrict' }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimResult: jsonb('claim_result'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    /**
     * Set when the mail delivers an automatic reward (level, season, giftcode, …): one mail per
     * player and key, so a reward can never be delivered twice.
     */
    rewardKey: text('reward_key'),
  },
  (t) => [
    index('mail_messages_user_idx').on(t.userId, t.createdAt),
    uniqueIndex('mail_messages_reward_key_idx').on(t.userId, t.rewardKey).where(sql`${t.rewardKey} IS NOT NULL`),
  ],
);

/** Multiplayer tables (shared-round games now, seated card games later). */
export const gameTables = pgTable('game_tables', {
  id: text('id').primaryKey(),
  game: text('game').notNull(),
  nameVi: text('name_vi').notNull(),
  nameEn: text('name_en').notNull(),
  /** { minBet, maxBet, timings: { shakeMs, betMs, revealMs, breakMs } } */
  config: jsonb('config').notNull(),
  /** open | paused (no new rounds) */
  status: text('status').notNull().default('open'),
  sort: integer('sort').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One shared round of a table. The timeline is stored so any server (or the same server after a
 * restart) can carry on from the right phase. The outcome is fixed from `server_seed` when bets lock.
 */
export const tableRounds = pgTable(
  'table_rounds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tableId: text('table_id')
      .notNull()
      .references(() => gameTables.id, { onDelete: 'restrict' }),
    seq: integer('seq').notNull(),
    /** betting | locked | settled | void */
    status: text('status').notNull().default('betting'),
    serverSeed: text('server_seed').notNull(),
    seedHash: text('seed_hash').notNull(),
    outcome: jsonb('outcome'),
    opensAt: timestamp('opens_at', { withTimezone: true }).notNull(),
    betsOpenAt: timestamp('bets_open_at', { withTimezone: true }).notNull(),
    locksAt: timestamp('locks_at', { withTimezone: true }).notNull(),
    revealAt: timestamp('reveal_at', { withTimezone: true }).notNull(),
    nextAt: timestamp('next_at', { withTimezone: true }).notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('table_rounds_table_seq_idx').on(t.tableId, t.seq), index('table_rounds_status_idx').on(t.status)],
);

/** A player's bet on a shared round. Stakes are debited when placed; payouts credited at settlement. */
export const tableBets = pgTable(
  'table_bets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => tableRounds.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    value: integer('value'),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    payout: bigint('payout', { mode: 'number' }),
    /** placed | settled | refunded */
    status: text('status').notNull().default('placed'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('table_bets_round_idx').on(t.roundId),
    index('table_bets_user_idx').on(t.userId),
    uniqueIndex('table_bets_idempotency_idx').on(t.userId, t.idempotencyKey),
    check('table_bets_amount_positive', sql`${t.amount} > 0`),
  ],
);

/** Account level progress (1–999). `level` is derived from `exp` and stored for ladders. */
export const playerProgress = pgTable(
  'player_progress',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'restrict' }),
    exp: bigint('exp', { mode: 'number' }).notNull().default(0),
    level: integer('level').notNull().default(1),
    /** Gameplay EXP earned on `expDay` (UTC), for the daily cap. */
    expToday: integer('exp_today').notNull().default(0),
    expDay: date('exp_day'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('player_progress_ladder_idx').on(t.exp),
    check('player_progress_exp_nonnegative', sql`${t.exp} >= 0`),
    check('player_progress_level_range', sql`${t.level} BETWEEN 1 AND 999`),
  ],
);

/** Every EXP change, once per (player, source key). */
export const expEvents = pgTable(
  'exp_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** gameplay | admin | event | achievement | … */
    source: text('source').notNull(),
    sourceKey: text('source_key').notNull(),
    amount: integer('amount').notNull(),
    levelBefore: integer('level_before').notNull(),
    levelAfter: integer('level_after').notNull(),
    actorId: uuid('actor_id'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('exp_events_source_idx').on(t.userId, t.sourceKey), index('exp_events_user_idx').on(t.userId, t.createdAt)],
);

/** Rewards for reaching a level, delivered by mail exactly once per player. */
export const levelRewards = pgTable(
  'level_rewards',
  {
    level: integer('level').primaryKey(),
    attachments: jsonb('attachments').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    updatedBy: uuid('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('level_rewards_range', sql`${t.level} BETWEEN 2 AND 999`)],
);

/** Ranked seasons. At most one is active. */
export const rankSeasons = pgTable(
  'rank_seasons',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    name: text('name').notNull(),
    /** scheduled | active | ended */
    status: text('status').notNull().default('scheduled'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** RankRules: { winRp, lossRp, softResetDivisions } */
    rules: jsonb('rules').notNull(),
    /** End-of-season rewards: { tiers: { [tierId]: MailAttachment[] }, top: { [topTitle]: MailAttachment[] } } */
    rewards: jsonb('rewards').notNull(),
    /** ParticipationRules: Cxu Bạc per valid ranked match and anti-farming caps. */
    participation: jsonb('participation').notNull().default(sql`'{"playSilver":0,"winSilver":0,"dailyMatchCap":20,"samePairDailyCap":3}'::jsonb`),
    /** Open the next season automatically when this one ends. */
    autoRollover: boolean('auto_rollover').notNull().default(true),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('rank_seasons_one_active_idx').on(t.status).where(sql`${t.status} = 'active'`), check('rank_seasons_dates', sql`${t.endsAt} > ${t.startsAt}`)],
);

/** A player's rank in a season. */
export const playerRanks = pgTable(
  'player_ranks',
  {
    seasonId: integer('season_id')
      .notNull()
      .references(() => rankSeasons.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    division: smallint('division').notNull(),
    rp: integer('rp').notNull().default(0),
    streak: smallint('streak').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    peakDivision: smallint('peak_division').notNull(),
    /** Best Top-50 position reached this season (null = never in the Top). */
    peakTopPosition: integer('peak_top_position'),
    /** Verified cheating: excluded from the ladder, titles and season rewards. */
    disqualified: boolean('disqualified').notNull().default(false),
    disqualifiedReason: text('disqualified_reason'),
    /** When the current RP was reached: earlier wins Top-ladder ties. */
    rpAt: timestamp('rp_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.seasonId, t.userId] }),
    index('player_ranks_ladder_idx').on(t.seasonId, t.division, t.rp),
    check('player_ranks_division_range', sql`${t.division} BETWEEN 0 AND 40`),
    check('player_ranks_rp_nonnegative', sql`${t.rp} >= 0`),
    check('player_ranks_streak_range', sql`${t.streak} BETWEEN 0 AND 3`),
  ],
);

/** Every rank change (match result, staff adjustment, season start), once per (season, player, key). */
export const rankEvents = pgTable(
  'rank_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    seasonId: integer('season_id')
      .notNull()
      .references(() => rankSeasons.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    matchKey: text('match_key').notNull(),
    /** win | loss | adjust */
    result: text('result').notNull(),
    rpDelta: integer('rp_delta').notNull(),
    divisionBefore: smallint('division_before').notNull(),
    divisionAfter: smallint('division_after').notNull(),
    rpBefore: integer('rp_before').notNull(),
    rpAfter: integer('rp_after').notNull(),
    streakAfter: smallint('streak_after').notNull(),
    promoted: boolean('promoted').notNull().default(false),
    demoted: boolean('demoted').notNull().default(false),
    /** Other players of the match (anti-farming checks). */
    opponentIds: uuid('opponent_ids').array().notNull().default(sql`'{}'::uuid[]`),
    /** Participation reward paid for this match (Cxu Bạc, via the ledger). */
    rewardSilver: integer('reward_silver').notNull().default(0),
    actorId: uuid('actor_id'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('rank_events_match_idx').on(t.seasonId, t.userId, t.matchKey), index('rank_events_user_idx').on(t.userId, t.createdAt)],
);

/** Final standing of each player when a season ends (history, rewards, soft reset). */
export const rankSeasonResults = pgTable(
  'rank_season_results',
  {
    seasonId: integer('season_id')
      .notNull()
      .references(() => rankSeasons.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    division: smallint('division').notNull(),
    rp: integer('rp').notNull(),
    peakDivision: smallint('peak_division').notNull(),
    topPosition: integer('top_position'),
    topTitle: text('top_title'),
    peakTopPosition: integer('peak_top_position'),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.seasonId, t.userId] })],
);

/**
 * Immutable end-of-season reward record per player: decided once when the season closes, then
 * delivered by mail (retried until delivered; delivery is keyed so it never duplicates).
 */
export const seasonRewards = pgTable(
  'season_rewards',
  {
    seasonId: integer('season_id')
      .notNull()
      .references(() => rankSeasons.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    topPosition: integer('top_position'),
    /** top1 | top2 | top3 | top4_10 | top11_50 | rest */
    bracket: text('bracket').notNull(),
    attachments: jsonb('attachments').notNull(),
    silver: bigint('silver', { mode: 'number' }).notNull(),
    gold: bigint('gold', { mode: 'number' }).notNull(),
    /** pending | delivered */
    status: text('status').notNull().default('pending'),
    mailId: uuid('mail_id'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.seasonId, t.userId] }), index('season_rewards_pending_idx').on(t.status).where(sql`${t.status} = 'pending'`)],
);

/** Suspicious reward patterns (farming, shared IPs, AFK) for staff review. */
export const rewardFlags = pgTable(
  'reward_flags',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** same_opponent | daily_cap | shared_ip | afk */
    kind: text('kind').notNull(),
    seasonId: integer('season_id'),
    matchKey: text('match_key'),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('reward_flags_created_idx').on(t.createdAt), index('reward_flags_user_idx').on(t.userId)],
);

/** Gift codes. `uses` is updated under a row lock, so limits hold under concurrency. */
export const giftcodes = pgTable(
  'giftcodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Normalised: upper case, no spaces or dashes. */
    code: text('code').notNull(),
    campaign: text('campaign').notNull(),
    attachments: jsonb('attachments').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    /** Total redemptions allowed (null = unlimited). */
    maxUses: integer('max_uses'),
    perUserLimit: integer('per_user_limit').notNull().default(1),
    uses: integer('uses').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('giftcodes_code_idx').on(t.code),
    index('giftcodes_campaign_idx').on(t.campaign),
    check('giftcodes_limits', sql`${t.perUserLimit} >= 1 AND (${t.maxUses} IS NULL OR ${t.maxUses} >= 1) AND ${t.uses} >= 0 AND (${t.maxUses} IS NULL OR ${t.uses} <= ${t.maxUses})`),
  ],
);

export const giftcodeRedemptions = pgTable(
  'giftcode_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    giftcodeId: uuid('giftcode_id')
      .notNull()
      .references(() => giftcodes.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** 1…perUserLimit: the n-th use of this code by this player. */
    seq: integer('seq').notNull(),
    mailId: uuid('mail_id'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('giftcode_redemptions_once_idx').on(t.giftcodeId, t.userId, t.seq), index('giftcode_redemptions_user_idx').on(t.userId, t.createdAt)],
);

/** Seated card tables (Poker, Liêng, Xì Tố). Casual tables use Cxu Bạc buy-ins; ranked tables use match chips. */
export const cardTables = pgTable('card_tables', {
  id: text('id').primaryKey(),
  game: text('game').notNull(),
  nameVi: text('name_vi').notNull(),
  nameEn: text('name_en').notNull(),
  /** CardTableConfig: blinds, ante, buy-in range, seats, turn time. */
  config: jsonb('config').notNull(),
  /** casual | ranked */
  mode: text('mode').notNull().default('casual'),
  /** official (staff tables) | room (player-created, see game_rooms) */
  kind: text('kind').notNull().default('official'),
  /** open | paused | closed */
  status: text('status').notNull().default('open'),
  /** Seat holding the dealer button for the next hand. */
  button: integer('button').notNull().default(0),
  sort: integer('sort').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cardSeats = pgTable(
  'card_seats',
  {
    tableId: text('table_id')
      .notNull()
      .references(() => cardTables.id, { onDelete: 'restrict' }),
    seat: integer('seat').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Chips at the table between hands (the running hand keeps its own copy until it settles). */
    stack: bigint('stack', { mode: 'number' }).notNull(),
    /** active | sitting_out | leaving */
    status: text('status').notNull().default('active'),
    /** Consecutive turn timeouts across hands; any real action resets it. */
    timeouts: integer('timeouts').notNull().default(0),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tableId, t.seat] }),
    uniqueIndex('card_seats_table_user_idx').on(t.tableId, t.userId),
    index('card_seats_user_idx').on(t.userId),
    check('card_seats_stack_nonnegative', sql`${t.stack} >= 0`),
  ],
);

/** One hand. `state` is the server-only engine state (deck and hidden cards included). */
export const cardHands = pgTable(
  'card_hands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tableId: text('table_id')
      .notNull()
      .references(() => cardTables.id, { onDelete: 'restrict' }),
    seq: integer('seq').notNull(),
    state: jsonb('state').notNull(),
    /** Number of actions applied (clients keep the newest view). */
    version: integer('version').notNull().default(0),
    serverSeed: text('server_seed').notNull(),
    seedHash: text('seed_hash').notNull(),
    /** active | done | void */
    status: text('status').notNull().default('active'),
    deadline: timestamp('deadline', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('card_hands_table_seq_idx').on(t.tableId, t.seq),
    uniqueIndex('card_hands_one_active_idx').on(t.tableId).where(sql`${t.status} = 'active'`),
    index('card_hands_deadline_idx').on(t.deadline).where(sql`${t.status} = 'active'`),
  ],
);

/** Ranked matchmaking queue (one entry per player). */
export const rankedQueue = pgTable('ranked_queue', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'restrict' }),
  game: text('game').notNull(),
  division: integer('division').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A ranked heads-up match: match chips only (never Cxu); the result goes to the season ladder. */
export const rankedMatches = pgTable(
  'ranked_matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    game: text('game').notNull(),
    tableId: text('table_id')
      .notNull()
      .references(() => cardTables.id, { onDelete: 'restrict' }),
    seasonId: integer('season_id').notNull(),
    players: uuid('players').array().notNull(),
    /** active | done | void */
    status: text('status').notNull().default('active'),
    winnerId: uuid('winner_id'),
    /** Who forfeited (left or AFK), if anyone. */
    forfeitId: uuid('forfeit_id'),
    hands: integer('hands').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [index('ranked_matches_status_idx').on(t.status), index('ranked_matches_table_idx').on(t.tableId)],
);
