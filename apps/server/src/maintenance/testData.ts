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
  { table: 'game_rounds', column: 'user_id', action: 'delete' },
  { table: 'ledger_entries', column: 'user_id', action: 'delete' },
  { table: 'user_items', column: 'user_id', action: 'delete' },
  { table: 'inventory_items', column: 'user_id', action: 'delete' },
  { table: 'mail_messages', column: 'user_id', action: 'delete' },
  { table: 'fair_seeds', column: 'user_id', action: 'delete' },
  { table: 'wallets', column: 'user_id', action: 'delete' },
  { table: 'user_roles', column: 'user_id', action: 'delete' },
  { table: 'bans', column: 'user_id', action: 'delete' },
  { table: 'email_tokens', column: 'user_id', action: 'delete' },
  { table: 'account_deletion_requests', column: 'user_id', action: 'delete' },
] as const satisfies readonly { table: string; column: string; action: 'delete' | 'reassign_to_support' }[];

/** Tables whose foreign keys to the tables above are fine without a registry entry. */
const REFERENCE_TABLES = new Set(['roles', 'role_permissions']);

/** Accounts removed by a reset: flagged TEST, ordinary players, never Keyo Support (1000) or the Owner (1002). */
const TARGETS = sql`SELECT id FROM users WHERE is_test AND account_type = 'player' AND uid NOT IN (${sql.join(
  PROTECTED_UIDS.map((u) => sql`${u}`),
  sql`, `,
)})`;

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
    const row = await one<{ test: string; kept: string }>(
      db,
      sql`SELECT
            count(*) FILTER (WHERE ${sql.identifier(t.column)} IN (${TARGETS})) AS test,
            count(*) FILTER (WHERE ${sql.identifier(t.column)} NOT IN (${TARGETS})) AS kept
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
  return { kept: n(acc.kept), mismatchedWallets: n(acc.mismatched), tables: Object.fromEntries(tables.map((t) => [t.table, t.kept])) };
}

export interface ResetResult {
  deleted: Record<string, number>;
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
    await tx.execute(sql`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`);
    const plan = await planReset(tx);
    if (plan.blockers.length) throw new MaintenanceRefused(plan.blockers.join(' '));
    if (plan.confirmPhrase !== expectedPhrase) throw new MaintenanceRefused(`Confirmation phrase no longer matches (now "${plan.confirmPhrase}"); run the dry-run again.`);

    const before = await keptSnapshot(tx);
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
    if (n(supportLeft.c) !== 1) problems.push('Keyo Support is missing');
    if (problems.length) throw new Error(`Post-reset verification failed, rolled back: ${problems.join('; ')}`);

    await audit(tx, {
      action: 'system.reset_test_data',
      targetType: 'database',
      targetId: plan.database,
      details: { operator, accounts: accounts.count, deleted, reassigned, mail: mail.count },
    });
    return {
      deleted,
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
