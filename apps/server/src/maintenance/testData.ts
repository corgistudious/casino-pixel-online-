import { KEYO_SUPPORT_UID, PLAYER_UID_START, PROTECTED_UIDS } from '@casino/shared';
import { eq, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { maintenanceRuns } from '../db/schema';
import { audit } from '../services/audit';
import { getEnvironmentState } from '../services/environment';

/**
 * Every table holding rows that belong to a user, in deletion order (children first).
 * `delete` removes the TEST user's rows. Future content that must survive a reset even when a
 * test account created it (approved frames, configuration) should use `reassign_to_support`,
 * which hands the rows to Keyo Support (UID 1000) instead of deleting them.
 *
 * New tables that reference users MUST be added here: the reset refuses to run while any foreign
 * key to users (or to a table listed here) is not covered, and a test enforces the same.
 */
export const TEST_DATA_TABLES = [
  // Leaderboards (0033): statistics and awards of TEST accounts go with them; snapshots hold no keys.
  { table: 'player_game_stats', column: 'user_id', action: 'delete' },
  { table: 'player_game_daily', column: 'user_id', action: 'delete' },
  { table: 'leaderboard_awards', column: 'user_id', action: 'delete' },
  { table: 'tournament_results', column: 'user_id', action: 'delete' },
  { table: 'tournaments', column: 'created_by', action: 'reassign_to_support' },
  // Keyo Captain set-up links (0032): the account is protected; an issuing TEST staff becomes Keyo Captain.
  { table: 'account_setup_tokens', column: 'created_by', action: 'reassign_to_support' },
  { table: 'account_setup_tokens', column: 'user_id', action: 'delete' },
  // Charm and gifts (0031): staff columns move to Keyo Support; a real receiver keeps charm it got
  // from a TEST sender (its ledger row stays, only the link to the deleted gift row is cleared).
  { table: 'charm_ledger', column: 'actor_id', action: 'reassign_to_support' },
  { table: 'charm_ledger', column: 'user_id', action: 'delete' },
  { table: 'charm_points', column: 'user_id', action: 'delete' },
  { table: 'gift_transactions', column: 'reversed_by', action: 'reassign_to_support' },
  { table: 'gift_transactions', column: 'sender_id', action: 'delete' },
  { table: 'gift_transactions', column: 'receiver_id', action: 'delete' },
  { table: 'gift_catalog', column: 'updated_by', action: 'reassign_to_support' },
  // Profile photos (0030).
  { table: 'avatar_uploads', column: 'moderated_by', action: 'reassign_to_support' },
  { table: 'avatar_uploads', column: 'user_id', action: 'delete' },
  // VIP configuration and manual changes (0029). A real player's VIP is never deleted because a TEST staff account set it.
  { table: 'vip_events', column: 'actor_id', action: 'reassign_to_support' },
  { table: 'vip_events', column: 'user_id', action: 'delete' },
  { table: 'vip_levels', column: 'updated_by', action: 'reassign_to_support' },
  { table: 'vip_progress', column: 'override_by', action: 'reassign_to_support' },
  { table: 'room_join_attempts', column: 'user_id', action: 'delete' },
  { table: 'room_access', column: 'user_id', action: 'delete' },
  { table: 'room_access', column: 'invited_by', action: 'delete' },
  // A TEST player's room keeps running (real players may sit in it) under Keyo Support until it passes on or closes.
  { table: 'game_rooms', column: 'owner_id', action: 'reassign_to_support' },
  { table: 'bj_seats', column: 'user_id', action: 'delete' },
  { table: 'player_follows', column: 'follower_id', action: 'delete' },
  { table: 'player_follows', column: 'followee_id', action: 'delete' },
  { table: 'profile_likes', column: 'liker_id', action: 'delete' },
  { table: 'profile_likes', column: 'profile_id', action: 'delete' },
  { table: 'player_blocks', column: 'blocker_id', action: 'delete' },
  { table: 'player_blocks', column: 'blocked_id', action: 'delete' },
  { table: 'profile_settings', column: 'user_id', action: 'delete' },
  { table: 'player_reports', column: 'reporter_id', action: 'delete' },
  { table: 'player_reports', column: 'target_id', action: 'delete' },
  { table: 'player_reports', column: 'handled_by', action: 'delete' },
  { table: 'mission_settings', column: 'updated_by', action: 'reassign_to_support' },
  { table: 'gift_transfers', column: 'sender_id', action: 'delete' },
  { table: 'gift_transfers', column: 'receiver_id', action: 'delete' },
  { table: 'guild_invites', column: 'user_id', action: 'delete' },
  { table: 'guild_invites', column: 'invited_by', action: 'delete' },
  { table: 'guild_log', column: 'actor_id', action: 'delete' },
  { table: 'guild_log', column: 'target_id', action: 'delete' },
  { table: 'friendships', column: 'user_id', action: 'delete' },
  { table: 'friendships', column: 'friend_id', action: 'delete' },
  { table: 'friend_requests', column: 'sender_id', action: 'delete' },
  { table: 'friend_requests', column: 'receiver_id', action: 'delete' },
  { table: 'direct_messages', column: 'sender_id', action: 'delete' },
  { table: 'direct_messages', column: 'receiver_id', action: 'delete' },
  { table: 'guild_messages', column: 'user_id', action: 'delete' },
  { table: 'guild_win_events', column: 'user_id', action: 'delete' },
  { table: 'guild_members', column: 'user_id', action: 'delete' },
  { table: 'quest_claims', column: 'user_id', action: 'delete' },
  { table: 'guilds', column: 'owner_id', action: 'delete' },
  { table: 'support_ticket_messages', column: 'author_id', action: 'delete' },
  { table: 'support_tickets', column: 'user_id', action: 'delete' },
  { table: 'support_tickets', column: 'assigned_to', action: 'delete' },
  { table: 'market_operations', column: 'user_id', action: 'delete' },
  { table: 'market_listings', column: 'seller_id', action: 'delete' },
  { table: 'market_listings', column: 'buyer_id', action: 'delete' },
  { table: 'public_chat_messages', column: 'user_id', action: 'delete' },
  { table: 'public_chat_messages', column: 'deleted_by', action: 'delete' },
  { table: 'public_chat_mutes', column: 'user_id', action: 'delete' },
  { table: 'public_chat_mutes', column: 'issued_by', action: 'delete' },
  { table: 'bank_transfers', column: 'user_id', action: 'delete' },
  { table: 'bank_accounts', column: 'user_id', action: 'delete' },
  { table: 'vip_progress', column: 'user_id', action: 'delete' },
  { table: 'achievement_claims', column: 'user_id', action: 'delete' },
  { table: 'giftcode_failure_limits', column: 'user_id', action: 'delete' },
  { table: 'table_bets', column: 'user_id', action: 'delete' },
  { table: 'card_seats', column: 'user_id', action: 'delete' },
  { table: 'ranked_queue', column: 'user_id', action: 'delete' },
  { table: 'giftcode_redemptions', column: 'user_id', action: 'delete' },
  { table: 'reward_flags', column: 'user_id', action: 'delete' },
  { table: 'season_rewards', column: 'user_id', action: 'delete' },
  { table: 'exp_events', column: 'user_id', action: 'delete' },
  { table: 'player_progress', column: 'user_id', action: 'delete' },
  { table: 'rank_events', column: 'user_id', action: 'delete' },
  { table: 'rank_season_results', column: 'user_id', action: 'delete' },
  { table: 'player_ranks', column: 'user_id', action: 'delete' },
  { table: 'game_rounds', column: 'user_id', action: 'delete' },
  { table: 'ledger_entries', column: 'user_id', action: 'delete' },
  { table: 'user_items', column: 'user_id', action: 'delete' },
  { table: 'inventory_items', column: 'user_id', action: 'delete' },
  { table: 'mail_messages', column: 'user_id', action: 'delete' },
  { table: 'fair_seeds', column: 'user_id', action: 'delete' },
  { table: 'keyo_rename_state', column: 'user_id', action: 'delete' },
  { table: 'keyo_rename_cards', column: 'user_id', action: 'delete' },
  { table: 'wallets', column: 'user_id', action: 'delete' },
  { table: 'user_roles', column: 'user_id', action: 'delete' },
  { table: 'bans', column: 'user_id', action: 'delete' },
  { table: 'email_tokens', column: 'user_id', action: 'delete' },
  { table: 'account_deletion_requests', column: 'user_id', action: 'delete' },
] as const satisfies readonly { table: string; column: string; action: 'delete' | 'reassign_to_support' }[];

/** Tables whose foreign keys to the tables above are fine without a registry entry. */
// report_attachments rows cascade with their report (ON DELETE CASCADE).
const REFERENCE_TABLES = new Set(['roles', 'role_permissions', 'report_attachments']);

/** Accounts removed by a reset: flagged TEST, ordinary players, never Keyo Support (1000) or the Owner (1002). */
const TARGETS = sql`SELECT id FROM users WHERE is_test AND account_type = 'player' AND uid NOT IN (${sql.join(
  PROTECTED_UIDS.map((u) => sql`${u}`),
  sql`, `,
)})`;

/**
 * Shared Blackjack rounds (`bj_rounds`) and card hands (`card_hands`) keep their players inside
 * `state.players[].userId` (JSON, no foreign key), and ranked matches keep them in a uuid array,
 * so the registry above cannot see them. A round/hand/match is TEST data when any player in it is a
 * TEST account, and it also involves real money when any other player is not.
 */
export const EMBEDDED_PLAYER_TABLES = ['bj_rounds', 'card_hands'] as const;
type EmbeddedTable = (typeof EMBEDDED_PLAYER_TABLES)[number];
const players = sql`jsonb_array_elements(r.state->'players') p`;
const hasTest = sql`EXISTS (SELECT 1 FROM ${players} WHERE (p->>'userId')::uuid IN (${TARGETS}))`;
const hasReal = sql`EXISTS (SELECT 1 FROM ${players} WHERE p->>'userId' IS NOT NULL AND (p->>'userId')::uuid NOT IN (${TARGETS}))`;
const matchHasTest = sql`m.players && ARRAY(${TARGETS})`;
const matchHasReal = sql`EXISTS (SELECT 1 FROM unnest(m.players) x(id) WHERE x.id IS NOT NULL AND x.id NOT IN (${TARGETS}))`;

export interface BjRoundCounts {
  /** Running rounds/hands/matches with only TEST players: deleted (their stakes left TEST wallets, which are deleted too). */
  activeTestOnly: number;
  /** Running ones with TEST and real players: block the reset until they end. */
  activeMixed: number;
  /** Finished ones with only TEST players: deleted. */
  finishedTestOnly: number;
  /** Finished ones with real players too: kept, TEST players' identities are removed. */
  finishedMixed: number;
}

async function embeddedCounts(db: DbOrTx, table: EmbeddedTable): Promise<BjRoundCounts> {
  const row = await one<Record<keyof BjRoundCounts, string>>(
    db,
    sql`SELECT
          count(*) FILTER (WHERE r.status = 'active' AND NOT ${hasReal}) AS "activeTestOnly",
          count(*) FILTER (WHERE r.status = 'active' AND ${hasReal}) AS "activeMixed",
          count(*) FILTER (WHERE r.status <> 'active' AND NOT ${hasReal}) AS "finishedTestOnly",
          count(*) FILTER (WHERE r.status <> 'active' AND ${hasReal}) AS "finishedMixed"
        FROM ${sql.identifier(table)} r WHERE ${hasTest}`,
  );
  return { activeTestOnly: n(row.activeTestOnly), activeMixed: n(row.activeMixed), finishedTestOnly: n(row.finishedTestOnly), finishedMixed: n(row.finishedMixed) };
}

async function matchCounts(db: DbOrTx): Promise<BjRoundCounts> {
  const row = await one<Record<keyof BjRoundCounts, string>>(
    db,
    sql`SELECT
          count(*) FILTER (WHERE m.status = 'active' AND NOT ${matchHasReal}) AS "activeTestOnly",
          count(*) FILTER (WHERE m.status = 'active' AND ${matchHasReal}) AS "activeMixed",
          count(*) FILTER (WHERE m.status <> 'active' AND NOT ${matchHasReal}) AS "finishedTestOnly",
          count(*) FILTER (WHERE m.status <> 'active' AND ${matchHasReal}) AS "finishedMixed"
        FROM ranked_matches m WHERE ${matchHasTest} OR m.winner_id IN (${TARGETS}) OR m.forfeit_id IN (${TARGETS})`,
  );
  return { activeTestOnly: n(row.activeTestOnly), activeMixed: n(row.activeMixed), finishedTestOnly: n(row.finishedTestOnly), finishedMixed: n(row.finishedMixed) };
}

export interface TableCount {
  table: string;
  action: string;
  test: number;
  kept: number;
}

export interface ResetPlan {
  database: string;
  mode: 'test' | 'production';
  testAccounts: number;
  testAccountUidRange: [number, number] | null;
  keptAccounts: number;
  tables: TableCount[];
  outboxMail: number;
  bjRounds: BjRoundCounts;
  cardHands: BjRoundCounts;
  rankedMatches: BjRoundCounts;
  supportPresent: boolean;
  /** Reasons the reset must not run. Empty means it may run. */
  blockers: string[];
  confirmPhrase: string;
}

const n = (v: unknown) => Number(v ?? 0);

async function one<T extends Record<string, unknown>>(db: DbOrTx, q: ReturnType<typeof sql>): Promise<T> {
  const rows = (await db.execute(q)) as unknown as T[];
  return rows[0]!;
}

/** Foreign keys that point at users or at a registered table but are not covered by TEST_DATA_TABLES. */
export async function uncoveredForeignKeys(db: DbOrTx): Promise<string[]> {
  const rows = (await db.execute(sql`
    SELECT con.conrelid::regclass::text AS child, att.attname AS column, con.confrelid::regclass::text AS parent
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
  `)) as unknown as { child: string; column: string; parent: string }[];
  const registered = new Set<string>(TEST_DATA_TABLES.map((t) => t.table));
  const covered = new Set<string>(TEST_DATA_TABLES.map((t) => `${t.table}.${t.column}`));
  const strip = (name: string) => name.replace(/^public\./, '').replace(/"/g, '');
  return rows
    .map((r) => ({ child: strip(r.child), column: r.column, parent: strip(r.parent) }))
    .filter((r) => {
      if (r.parent === 'users') return !covered.has(`${r.child}.${r.column}`);
      if (registered.has(r.parent)) return !registered.has(r.child) && !REFERENCE_TABLES.has(r.child);
      return false;
    })
    .map((r) => `${r.child}.${r.column} -> ${r.parent}`);
}

async function tableCounts(db: DbOrTx): Promise<TableCount[]> {
  const out: TableCount[] = [];
  for (const t of TEST_DATA_TABLES) {
    // A row with multiple user references belongs to TEST data if ANY referenced
    // user is a TEST account. Count kept rows by the whole row, not by one column.
    const columns = [...new Set(TEST_DATA_TABLES.filter((entry) => entry.table === t.table).map((entry) => entry.column))];
    // coalesce: a NULL column (e.g. a staff column nobody set) is not TEST data, and NOT (NULL IN …) would hide the row from both counts.
    const targets = sql.join(columns.map((column) => sql`coalesce(${sql.identifier(column)} IN (${TARGETS}), false)`), sql` OR `);
    const row = await one<{ test: string; kept: string }>(
      db,
      sql`SELECT
            count(*) FILTER (WHERE ${targets}) AS test,
            count(*) FILTER (WHERE NOT (${targets})) AS kept
          FROM ${sql.identifier(t.table)}`,
    );
    out.push({ table: t.table, action: t.action, test: n(row.test), kept: n(row.kept) });
  }
  return out;
}

const outboxFilter = sql`lower(to_address) IN (SELECT email_lower FROM users WHERE id IN (${TARGETS}) AND email_lower IS NOT NULL)`;

/** Read-only inventory of what a reset would remove and keep. Safe to run at any time. */
export async function planReset(db: DbOrTx): Promise<ResetPlan> {
  const { mode } = await getEnvironmentState(db);
  const { database } = await one<{ database: string }>(db, sql`SELECT current_database() AS database`);
  const acc = await one<{ test: string; kept: string; min_uid: string | null; max_uid: string | null; support: string }>(
    db,
    sql`SELECT
          count(*) FILTER (WHERE id IN (${TARGETS})) AS test,
          count(*) FILTER (WHERE id NOT IN (${TARGETS})) AS kept,
          min(uid) FILTER (WHERE id IN (${TARGETS})) AS min_uid,
          max(uid) FILTER (WHERE id IN (${TARGETS})) AS max_uid,
          count(*) FILTER (WHERE uid = ${KEYO_SUPPORT_UID} AND account_type = 'system_support' AND NOT is_test) AS support
        FROM users`,
  );
  const mail = await one<{ c: string }>(db, sql`SELECT count(*) AS c FROM email_outbox WHERE ${outboxFilter}`);
  const blockers: string[] = [];
  if (mode !== 'test') blockers.push('The database is in production mode; test-data reset is permanently disabled.');
  // Never remove a TEST-owned guild while real players or their guild history
  // still reference it. Guild foreign keys use RESTRICT, and the reset must
  // refuse up front rather than discover the conflict halfway through deletion.
  const sharedGuilds = await one<{ c: string }>(db, sql`
    SELECT count(*) AS c FROM guilds g
    WHERE g.owner_id IN (${TARGETS}) AND (
      EXISTS (SELECT 1 FROM guild_members m WHERE m.guild_id = g.id AND m.user_id NOT IN (${TARGETS}))
      OR EXISTS (SELECT 1 FROM guild_messages m WHERE m.guild_id = g.id AND m.user_id NOT IN (${TARGETS}))
      OR EXISTS (SELECT 1 FROM guild_win_events e WHERE e.guild_id = g.id AND e.user_id NOT IN (${TARGETS}))
    )
  `);
  if (n(sharedGuilds.c) > 0) blockers.push(`${n(sharedGuilds.c)} TEST-owned guild(s) contain real-player memberships or history; resolve ownership and data preservation before resetting TEST accounts.`);
  // A running shared Blackjack round with real players cannot lose a seat halfway: voiding it
  // would refund real stakes and settling it early would pay out a hand that is not finished.
  const bjRounds = await embeddedCounts(db, 'bj_rounds');
  if (bjRounds.activeMixed > 0) blockers.push(`${bjRounds.activeMixed} running shared Blackjack round(s) seat TEST and real players together; wait for the round to finish (or pause the table in Admin so no new round starts) and run the dry-run again.`);
  const cardHands = await embeddedCounts(db, 'card_hands');
  if (cardHands.activeMixed > 0) blockers.push(`${cardHands.activeMixed} running card hand(s) (Poker / Liêng / Xì Tố) seat TEST and real players together; wait for the hand to finish (or pause the table in Admin so no new hand starts) and run the dry-run again.`);
  const rankedMatches = await matchCounts(db);
  if (rankedMatches.activeMixed > 0) blockers.push(`${rankedMatches.activeMixed} running ranked match(es) pair TEST and real players; wait for the match to finish and run the dry-run again.`);
  const uncovered = await uncoveredForeignKeys(db);
  if (uncovered.length) blockers.push(`Tables reference users but are not in the reset registry: ${uncovered.join(', ')}`);
  if (n(acc.support) !== 1) blockers.push('Keyo Support (UID 1000) is missing or not a system account.');
  const testAccounts = n(acc.test);
  if (testAccounts === 0) blockers.push('There are no TEST accounts to remove.');
  return {
    database,
    mode,
    testAccounts,
    testAccountUidRange: acc.min_uid === null ? null : [n(acc.min_uid), n(acc.max_uid)],
    keptAccounts: n(acc.kept),
    tables: await tableCounts(db),
    outboxMail: n(mail.c),
    bjRounds,
    cardHands,
    rankedMatches,
    supportPresent: n(acc.support) === 1,
    blockers,
    confirmPhrase: `RESET ${database} ${testAccounts}`,
  };
}

export class MaintenanceRefused extends Error {}

/** Snapshot of everything a reset must leave untouched, compared before and after. */
async function keptSnapshot(db: DbOrTx) {
  const tables = await tableCounts(db);
  const acc = await one<{ kept: string; mismatched: string }>(
    db,
    sql`SELECT
          (SELECT count(*) FROM users WHERE id NOT IN (${TARGETS})) AS kept,
          (SELECT count(*) FROM wallets w WHERE w.user_id NOT IN (${TARGETS}) AND (
             w.balance <> coalesce((SELECT sum(delta) FROM ledger_entries l WHERE l.user_id = w.user_id AND l.currency = 'silver'), 0)
             OR w.gold <> coalesce((SELECT sum(delta) FROM ledger_entries l WHERE l.user_id = w.user_id AND l.currency = 'gold'), 0)
          )) AS mismatched`,
  );
  // Real players' entries in rounds/hands, with each one's status, and real players in ranked
  // matches with the result: none of it may change.
  const embedded: Record<string, { rounds: number; digest: string | null }> = {};
  for (const table of EMBEDDED_PLAYER_TABLES) {
    const r = await one<{ rounds: string; digest: string | null }>(
      db,
      sql`SELECT count(DISTINCT r.id) AS rounds,
            md5(string_agg(r.id::text || r.status || coalesce(r.ended_at::text, '') || p::text, '|' ORDER BY r.id, p->>'seat')) AS digest
          FROM ${sql.identifier(table)} r, ${players}
          WHERE p->>'userId' IS NOT NULL AND (p->>'userId')::uuid NOT IN (${TARGETS})`,
    );
    embedded[table] = { rounds: n(r.rounds), digest: r.digest };
  }
  const m = await one<{ rounds: string; digest: string | null }>(
    db,
    sql`SELECT count(DISTINCT m.id) AS rounds,
          md5(string_agg(m.id::text || m.status || x.id::text || CASE WHEN m.winner_id = x.id THEN 'W' WHEN m.forfeit_id = x.id THEN 'F' ELSE '' END, '|' ORDER BY m.id, x.id)) AS digest
        FROM ranked_matches m, unnest(m.players) x(id)
        WHERE x.id IS NOT NULL AND x.id NOT IN (${TARGETS})`,
  );
  embedded.ranked_matches = { rounds: n(m.rounds), digest: m.digest };
  return {
    kept: n(acc.kept),
    mismatchedWallets: n(acc.mismatched),
    tables: Object.fromEntries(tables.map((t) => [t.table, t.kept])),
    bjRealRounds: embedded.bj_rounds!,
    embedded,
  };
}

export interface ResetResult {
  deleted: Record<string, number>;
  bjRounds: { deleted: number; redacted: number };
  cardHands: { deleted: number; redacted: number };
  rankedMatches: { deleted: number; redacted: number };
  reassigned: Record<string, number>;
  deletedAccounts: number;
  deletedMail: number;
  verification: { before: Awaited<ReturnType<typeof keptSnapshot>>; after: Awaited<ReturnType<typeof keptSnapshot>>; remainingTestAccounts: number };
}

/**
 * Deletes TEST accounts and their data in one transaction. The caller must have taken a backup
 * and checked the confirmation phrase; this re-checks every blocker under a lock and rolls back
 * if anything kept would change.
 */
export async function executeReset(db: Db, expectedPhrase: string, operator: string): Promise<ResetResult> {
  return db.transaction(async (tx) => {
    // Serialises maintenance runs and freezes the mode for the duration of the reset.
    await tx.execute(sql`SELECT mode FROM environment_state WHERE id = 1 FOR UPDATE`);
    // Lets append-only tables (leaderboard awards) drop TEST accounts' rows, for this transaction only.
    await tx.execute(sql`SET LOCAL keyo.purge_test_data = 'on'`);
    // Running shared Blackjack rounds are frozen (same lock the table engine takes per move), before
    // the users lock so the order matches the engine's: no bet, move or settlement can slip in.
    await tx.execute(sql`SELECT id FROM bj_rounds WHERE status = 'active' FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM card_hands WHERE status = 'active' FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM ranked_matches WHERE status = 'active' FOR UPDATE`);
    await tx.execute(sql`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`);
    const plan = await planReset(tx);
    if (plan.blockers.length) throw new MaintenanceRefused(plan.blockers.join(' '));
    if (plan.confirmPhrase !== expectedPhrase) throw new MaintenanceRefused(`Confirmation phrase no longer matches (now "${plan.confirmPhrase}"); run the dry-run again.`);

    const before = await keptSnapshot(tx);
    // Rounds and hands with only TEST players go (running ones included: no real stake is in them).
    // Finished ones shared with real players stay for the real players' history; TEST players lose their id.
    const cleaned: Record<EmbeddedTable, { deleted: number; redacted: number }> = { bj_rounds: { deleted: 0, redacted: 0 }, card_hands: { deleted: 0, redacted: 0 } };
    let embeddedLeft = 0;
    for (const table of EMBEDDED_PLAYER_TABLES) {
      const t = sql.identifier(table);
      const del = await tx.execute(sql`DELETE FROM ${t} r WHERE ${hasTest} AND NOT ${hasReal}`);
      const red = await tx.execute(sql`
        UPDATE ${t} r SET state = jsonb_set(r.state - 'keys', '{players}', (
          SELECT jsonb_agg(CASE WHEN (p->>'userId')::uuid IN (${TARGETS}) THEN p || '{"userId": null, "removed": true}'::jsonb ELSE p END ORDER BY ord)
          FROM jsonb_array_elements(r.state->'players') WITH ORDINALITY AS x(p, ord)))
        WHERE r.status <> 'active' AND ${hasTest}`);
      cleaned[table] = { deleted: del.count, redacted: red.count };
      embeddedLeft += n((await one<{ c: string }>(tx, sql`SELECT count(*) AS c FROM ${t} r WHERE ${hasTest}`)).c);
    }
    // Ranked matches: the same rule; in kept ones TEST ids become NULL (winner/forfeit too).
    const mDel = await tx.execute(sql`DELETE FROM ranked_matches m WHERE (${matchHasTest} OR m.winner_id IN (${TARGETS}) OR m.forfeit_id IN (${TARGETS})) AND NOT ${matchHasReal}`);
    const mRed = await tx.execute(sql`
      UPDATE ranked_matches m SET
        players = ARRAY(SELECT CASE WHEN x.id IN (${TARGETS}) THEN NULL ELSE x.id END FROM unnest(m.players) WITH ORDINALITY x(id, ord) ORDER BY ord),
        winner_id = CASE WHEN m.winner_id IN (${TARGETS}) THEN NULL ELSE m.winner_id END,
        forfeit_id = CASE WHEN m.forfeit_id IN (${TARGETS}) THEN NULL ELSE m.forfeit_id END
      WHERE m.status <> 'active' AND (${matchHasTest} OR m.winner_id IN (${TARGETS}) OR m.forfeit_id IN (${TARGETS}))`);
    embeddedLeft += n((await one<{ c: string }>(tx, sql`SELECT count(*) AS c FROM ranked_matches m WHERE ${matchHasTest} OR m.winner_id IN (${TARGETS}) OR m.forfeit_id IN (${TARGETS})`)).c);
    const [support] = (await tx.execute(sql`SELECT id FROM users WHERE uid = ${KEYO_SUPPORT_UID}`)) as unknown as { id: string }[];
    const deleted: Record<string, number> = {};
    const reassigned: Record<string, number> = {};
    for (const t of TEST_DATA_TABLES as readonly { table: string; column: string; action: string }[]) {
      const col = sql.identifier(t.column);
      if (t.action === 'reassign_to_support') {
        const r = await tx.execute(sql`UPDATE ${sql.identifier(t.table)} SET ${col} = ${support!.id} WHERE ${col} IN (${TARGETS})`);
        reassigned[t.table] = r.count;
      } else {
        const r = await tx.execute(sql`DELETE FROM ${sql.identifier(t.table)} WHERE ${col} IN (${TARGETS})`);
        deleted[t.table] = r.count;
      }
    }
    const mail = await tx.execute(sql`DELETE FROM email_outbox WHERE ${outboxFilter}`);
    const accounts = await tx.execute(sql`DELETE FROM users WHERE id IN (${TARGETS})`);

    const after = await keptSnapshot(tx);
    const remaining = await one<{ c: string }>(tx, sql`SELECT count(*) AS c FROM users WHERE is_test AND account_type = 'player'`);
    const supportLeft = await one<{ c: string }>(tx, sql`SELECT count(*) AS c FROM users WHERE uid = ${KEYO_SUPPORT_UID}`);
    const problems: string[] = [];
    if (accounts.count !== plan.testAccounts) problems.push(`deleted ${accounts.count} accounts, expected ${plan.testAccounts}`);
    if (after.kept !== before.kept) problems.push('kept account count changed');
    if (after.mismatchedWallets !== before.mismatchedWallets) problems.push('wallet/ledger consistency of kept accounts changed');
    for (const [table, count] of Object.entries(before.tables)) {
      if (!(table in reassigned) && after.tables[table] !== count) problems.push(`kept rows in ${table} changed`);
    }
    if (n(remaining.c) !== 0) problems.push('TEST accounts remain');
    if (embeddedLeft !== 0) problems.push('rounds, hands or ranked matches still reference TEST accounts');
    const expected = { bj_rounds: plan.bjRounds, card_hands: plan.cardHands } as const;
    for (const table of EMBEDDED_PLAYER_TABLES) {
      const e = expected[table];
      if (cleaned[table].deleted !== e.activeTestOnly + e.finishedTestOnly || cleaned[table].redacted !== e.finishedMixed) problems.push(`${table} changed during the reset`);
    }
    if (mDel.count !== plan.rankedMatches.activeTestOnly + plan.rankedMatches.finishedTestOnly || mRed.count !== plan.rankedMatches.finishedMixed) problems.push('ranked_matches changed during the reset');
    if (JSON.stringify(after.embedded) !== JSON.stringify(before.embedded)) problems.push("real players' rounds, hands or ranked matches changed");
    if (n(supportLeft.c) !== 1) problems.push('Keyo Support is missing');
    if (problems.length) throw new Error(`Post-reset verification failed, rolled back: ${problems.join('; ')}`);

    await audit(tx, {
      action: 'system.reset_test_data',
      targetType: 'database',
      targetId: plan.database,
      details: { operator, accounts: accounts.count, deleted, reassigned, mail: mail.count, bjRounds: cleaned.bj_rounds, cardHands: cleaned.card_hands, rankedMatches: { deleted: mDel.count, redacted: mRed.count } },
    });
    return {
      deleted,
      bjRounds: cleaned.bj_rounds,
      cardHands: cleaned.card_hands,
      rankedMatches: { deleted: mDel.count, redacted: mRed.count },
      reassigned,
      deletedAccounts: accounts.count,
      deletedMail: mail.count,
      verification: { before, after, remainingTestAccounts: n(remaining.c) },
    };
  });
}

// ---------------------------------------------------------------- production launch

export interface LaunchPlan {
  database: string;
  mode: 'test' | 'production';
  testAccounts: number;
  /** Accounts already holding a player UID (>= 100000); must be zero before the UID counter restarts. */
  playerUidHolders: { uid: number; username: string; isTest: boolean }[];
  sequence: { lastValue: number; isCalled: boolean };
  blockers: string[];
  confirmPhrase: string;
}

export async function planLaunch(db: DbOrTx): Promise<LaunchPlan> {
  const { mode } = await getEnvironmentState(db);
  const { database } = await one<{ database: string }>(db, sql`SELECT current_database() AS database`);
  const test = await one<{ c: string }>(db, sql`SELECT count(*) AS c FROM users WHERE is_test`);
  const holders = (await db.execute(
    sql`SELECT uid, username, is_test AS "isTest" FROM users WHERE uid >= ${PLAYER_UID_START} ORDER BY uid LIMIT 20`,
  )) as unknown as { uid: string; username: string; isTest: boolean }[];
  const seq = await one<{ last_value: string; is_called: boolean }>(db, sql`SELECT last_value, is_called FROM player_uid_seq`);
  const support = await one<{ c: string }>(db, sql`SELECT count(*) AS c FROM users WHERE uid = ${KEYO_SUPPORT_UID} AND account_type = 'system_support' AND NOT is_test`);
  const blockers: string[] = [];
  if (mode !== 'test') blockers.push('The database is already in production mode; the UID counter can never be reset again.');
  if (n(test.c) > 0) blockers.push(`${n(test.c)} TEST account(s) remain; run reset:test-data first.`);
  if (holders.length > 0) blockers.push(`UIDs >= ${PLAYER_UID_START} are already assigned (e.g. ${holders.map((h) => h.uid).join(', ')}); UID ${PLAYER_UID_START} would not go to the first real player.`);
  if (n(support.c) !== 1) blockers.push('Keyo Support (UID 1000) is missing or not a system account.');
  return {
    database,
    mode,
    testAccounts: n(test.c),
    playerUidHolders: holders.map((h) => ({ uid: n(h.uid), username: h.username, isTest: h.isTest })),
    sequence: { lastValue: n(seq.last_value), isCalled: seq.is_called },
    blockers,
    confirmPhrase: `LAUNCH ${database}`,
  };
}

/** Restarts the player UID counter at 100000 and switches the database to production mode, once. */
export async function executeLaunch(db: Db, expectedPhrase: string, operator: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT mode FROM environment_state WHERE id = 1 FOR UPDATE`);
    await tx.execute(sql`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`);
    const plan = await planLaunch(tx);
    if (plan.blockers.length) throw new MaintenanceRefused(plan.blockers.join(' '));
    if (plan.confirmPhrase !== expectedPhrase) throw new MaintenanceRefused(`Confirmation phrase must be "${plan.confirmPhrase}".`);
    await tx.execute(sql.raw(`ALTER SEQUENCE player_uid_seq RESTART WITH ${PLAYER_UID_START}`));
    await tx.execute(sql`UPDATE environment_state SET mode = 'production', launched_at = now() WHERE id = 1`);
    const seq = await one<{ last_value: string; is_called: boolean }>(tx, sql`SELECT last_value, is_called FROM player_uid_seq`);
    if (n(seq.last_value) !== PLAYER_UID_START || seq.is_called) throw new Error('UID counter verification failed, rolled back');
    await audit(tx, { action: 'system.launch_production', targetType: 'database', targetId: plan.database, details: { operator, previousSequence: plan.sequence } });
    return { nextPlayerUid: PLAYER_UID_START, previousSequence: plan.sequence };
  });
}

// ---------------------------------------------------------------- run log

export async function startRun(db: Db, kind: string, dryRun: boolean, operator: string, details: unknown): Promise<number> {
  const [row] = await db.insert(maintenanceRuns).values({ kind, dryRun, operator, details }).returning({ id: maintenanceRuns.id });
  return row!.id;
}

export async function finishRun(db: Db, id: number, status: 'succeeded' | 'failed' | 'refused', details: unknown, backupPath?: string) {
  await db
    .update(maintenanceRuns)
    .set({ status, details, backupPath: backupPath ?? null, finishedAt: new Date() })
    .where(eq(maintenanceRuns.id, id));
}
