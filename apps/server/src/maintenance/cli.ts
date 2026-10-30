/**
 * Keyo Game maintenance commands. Every command is a dry run unless --execute is given, and
 * every run (dry, refused, failed or succeeded) is recorded in maintenance_runs.
 *
 *   status
 *   create-test-accounts --operator NAME --count N [--prefix tester]   (password from KEYO_TEST_ACCOUNT_PASSWORD)
 *   reset-test-data      --operator NAME [--execute --confirm "RESET <db> <n>"] [--backup-dir DIR]
 *   launch-production    --operator NAME [--execute --confirm "LAUNCH <db>"]  [--backup-dir DIR]
 *   stats-rebuild        --operator NAME [--execute]   (recompute leaderboard game statistics from settled rounds)
 *   create-owner         --operator NAME --username NAME --email EMAIL [--display-name NAME]
 *                        (only when UID 1002 does not exist; the owner activates it by email)
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { Redis } from 'ioredis';
import { createDb } from '../db/client';
import { redisKeys } from '../realtime/hub';
import { createOwnerAccount, createTestAccount } from '../services/accounts';
import { emailSchema, KEYO_OWNER_UID, usernameSchema } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { getEnvironmentState } from '../services/environment';
import { backupDatabase } from './backup';
import { rebuildGameStats } from '../services/leaderboards';
import { executeLaunch, executeReset, finishRun, MaintenanceRefused, planLaunch, planReset, startRun } from './testData';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    operator: { type: 'string' },
    execute: { type: 'boolean', default: false },
    confirm: { type: 'string' },
    'backup-dir': { type: 'string', default: process.env.KEYO_BACKUP_DIR ?? './backups' },
    count: { type: 'string' },
    prefix: { type: 'string', default: 'tester' },
    username: { type: 'string' },
    email: { type: 'string' },
    'display-name': { type: 'string' },
  },
});

const command = positionals[0];
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const { db, client } = createDb(url);
const print = (label: string, data: unknown) => console.log(`\n== ${label}\n${JSON.stringify(data, null, 2)}`);
const operator = values.operator ?? '';
const requireOperator = () => {
  if (!/^[\w.@-]{2,64}$/.test(operator)) throw new MaintenanceRefused('--operator NAME is required (who is running this command).');
};

function writeReport(dir: string, name: string, data: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
  return path;
}

async function clearRedisBigWins() {
  if (!process.env.REDIS_URL) return;
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
  try {
    // Only this app's namespace: big-win names may belong to deleted test accounts.
    await redis.del(redisKeys(process.env.REDIS_PREFIX ?? 'keyo:').bigWins);
  } finally {
    redis.disconnect();
  }
}

async function resetTestData(): Promise<number> {
  const plan = await planReset(db);
  const runId = await startRun(db, 'reset_test_data', !values.execute, operator || process.env.KEYO_OPERATOR || process.env.USER || 'unknown', { plan });
  print('Dry run — what reset:test-data would do', plan);
  if (!values.execute) {
    await finishRun(db, runId, plan.blockers.length ? 'refused' : 'succeeded', { plan });
    console.log(
      plan.blockers.length
        ? `\nBLOCKED:\n- ${plan.blockers.join('\n- ')}`
        : `\nNothing was changed. To delete, the owner runs again with:\n  --execute --operator <name> --confirm "${plan.confirmPhrase}"`,
    );
    return plan.blockers.length ? 2 : 0;
  }
  let backupPath: string | undefined;
  try {
    requireOperator();
    if (plan.blockers.length) throw new MaintenanceRefused(plan.blockers.join(' '));
    if (values.confirm !== plan.confirmPhrase) throw new MaintenanceRefused(`--confirm must be exactly "${plan.confirmPhrase}".`);
    const backup = backupDatabase(url!, values['backup-dir']!, 'pre-reset');
    backupPath = backup.path;
    print('Backup verified', backup);
    const result = await executeReset(db, values.confirm, operator);
    await clearRedisBigWins();
    const report = { kind: 'reset_test_data', operator, database: plan.database, backup, plan, result, finishedAt: new Date().toISOString() };
    const reportPath = writeReport(dirname(backup.path), `${backup.path.split('/').pop()!.replace('.dump', '')}.report.json`, report);
    await finishRun(db, runId, 'succeeded', { ...report, reportPath }, backupPath);
    print('Reset completed and verified', result);
    console.log(`\nReport: ${reportPath}\nRestart the game server so in-memory caches drop the deleted accounts.`);
    return 0;
  } catch (err) {
    const refused = err instanceof MaintenanceRefused;
    await finishRun(db, runId, refused ? 'refused' : 'failed', { plan, error: String((err as Error).message) }, backupPath);
    console.error(`\n${refused ? 'REFUSED' : 'FAILED'}: ${(err as Error).message}${backupPath ? `\nBackup kept at ${backupPath}` : ''}`);
    return refused ? 2 : 1;
  }
}

async function launchProduction(): Promise<number> {
  const plan = await planLaunch(db);
  const runId = await startRun(db, 'launch_production', !values.execute, operator || process.env.KEYO_OPERATOR || process.env.USER || 'unknown', { plan });
  print('Dry run — production launch (UID counter restart)', plan);
  if (!values.execute) {
    await finishRun(db, runId, plan.blockers.length ? 'refused' : 'succeeded', { plan });
    console.log(
      plan.blockers.length
        ? `\nBLOCKED:\n- ${plan.blockers.join('\n- ')}`
        : `\nNothing was changed. To launch, the owner runs again with:\n  --execute --operator <name> --confirm "${plan.confirmPhrase}"`,
    );
    return plan.blockers.length ? 2 : 0;
  }
  let backupPath: string | undefined;
  try {
    requireOperator();
    if (plan.blockers.length) throw new MaintenanceRefused(plan.blockers.join(' '));
    if (values.confirm !== plan.confirmPhrase) throw new MaintenanceRefused(`--confirm must be exactly "${plan.confirmPhrase}".`);
    const backup = backupDatabase(url!, values['backup-dir']!, 'pre-launch');
    backupPath = backup.path;
    const result = await executeLaunch(db, values.confirm, operator);
    await finishRun(db, runId, 'succeeded', { plan, backup, result }, backupPath);
    print('Production launch completed', result);
    console.log('\nSet KEYO_DATA_MODE=production in the server environment and restart it. The first player will receive UID 100000.');
    return 0;
  } catch (err) {
    const refused = err instanceof MaintenanceRefused;
    await finishRun(db, runId, refused ? 'refused' : 'failed', { plan, error: String((err as Error).message) }, backupPath);
    console.error(`\n${refused ? 'REFUSED' : 'FAILED'}: ${(err as Error).message}`);
    return refused ? 2 : 1;
  }
}

async function createTestAccounts(): Promise<number> {
  const count = Number(values.count);
  const prefix = values.prefix!;
  const password = process.env.KEYO_TEST_ACCOUNT_PASSWORD ?? '';
  const runId = await startRun(db, 'create_test_accounts', false, operator || process.env.KEYO_OPERATOR || 'unknown', { count, prefix });
  try {
    requireOperator();
    if ((await getEnvironmentState(db)).mode !== 'test') throw new MaintenanceRefused('Test accounts can only be created while the database is in test mode.');
    if (!Number.isInteger(count) || count < 1 || count > 500) throw new MaintenanceRefused('--count must be between 1 and 500.');
    if (!/^[a-z][a-z0-9_]{1,11}$/.test(prefix)) throw new MaintenanceRefused('--prefix must be 2-12 lowercase letters, digits or _.');
    if (password.length < 8) throw new MaintenanceRefused('Set KEYO_TEST_ACCOUNT_PASSWORD (at least 8 characters); it is never passed on the command line.');
    const created: { uid: number; username: string }[] = [];
    for (let i = 1; created.length < count && i < count + 1000; i++) {
      const username = `${prefix}${String(i).padStart(3, '0')}`;
      try {
        const u = await createTestAccount(db, { username, password }, operator);
        created.push({ uid: u.uid, username: u.username });
      } catch (err) {
        // Name already taken (an earlier batch): try the next number.
        if (!/unique|duplicate/i.test(String((err as { cause?: unknown }).cause ?? err))) throw err;
      }
    }
    await finishRun(db, runId, 'succeeded', { count, prefix, created });
    print('Created TEST accounts (deleted by reset:test-data)', created);
    return 0;
  } catch (err) {
    const refused = err instanceof MaintenanceRefused;
    await finishRun(db, runId, refused ? 'refused' : 'failed', { error: String((err as Error).message) });
    console.error(`\n${refused ? 'REFUSED' : 'FAILED'}: ${(err as Error).message}`);
    return refused ? 2 : 1;
  }
}

async function ownerStatus() {
  const rows = (await db.execute(sql`
    SELECT u.uid, u.username, u.status, u.is_test, EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role_id = 'owner') AS has_owner_role
    FROM users u WHERE u.uid = ${KEYO_OWNER_UID}`)) as unknown as { uid: string; username: string; status: string; is_test: boolean; has_owner_role: boolean }[];
  return rows[0] ? { exists: true, username: rows[0].username, status: rows[0].status, isTest: rows[0].is_test, ownerRole: rows[0].has_owner_role } : { exists: false };
}

async function status(): Promise<number> {
  const state = await getEnvironmentState(db);
  const reset = await planReset(db);
  const launch = await planLaunch(db);
  print('Environment', { ...state, database: reset.database, testAccounts: reset.testAccounts, keptAccounts: reset.keptAccounts, uidSequence: launch.sequence, owner: await ownerStatus() });
  return 0;
}

async function createOwner(): Promise<number> {
  const runId = await startRun(db, 'create_owner', false, operator || process.env.KEYO_OPERATOR || 'unknown', { username: values.username });
  try {
    requireOperator();
    const username = usernameSchema.safeParse(values.username);
    const email = emailSchema.safeParse(values.email);
    if (!username.success || !email.success) throw new MaintenanceRefused('--username (3-20 letters, digits, _) and a valid --email are required.');
    if ((await ownerStatus()).exists) throw new MaintenanceRefused(`UID ${KEYO_OWNER_UID} already exists; the Owner role is attached to it automatically at server start.`);
    const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
    const user = await createOwnerAccount(db, { username: username.data, displayName: values['display-name'] ?? 'Keyo GM', email: email.data }, { appUrl });
    await finishRun(db, runId, 'succeeded', { uid: user.uid, username: user.username });
    print('Owner account created (activation email queued)', { uid: user.uid, username: user.username, status: user.status });
    return 0;
  } catch (err) {
    const refused = err instanceof MaintenanceRefused;
    await finishRun(db, runId, refused ? 'refused' : 'failed', { error: String((err as Error).message) });
    console.error(`\n${refused ? 'REFUSED' : 'FAILED'}: ${(err as Error).message}`);
    return refused ? 2 : 1;
  }
}

/**
 * Recomputes player_game_stats / player_game_daily from settled game history (e.g. right after
 * deploying 0033 on a server with history). Reads game_rounds only; never touches wallets.
 */
async function statsRebuild(): Promise<number> {
  const runId = await startRun(db, 'stats_rebuild', values.execute, operator || process.env.KEYO_OPERATOR || 'unknown', {});
  try {
    requireOperator();
    const [n] = (await db.execute(sql`SELECT count(*) AS rounds FROM game_rounds WHERE status = 'settled' AND bet > 0 AND keyo_board_game(game) IS NOT NULL`)) as unknown as { rounds: string }[];
    if (!values.execute) {
      print('Dry run: settled ranked-game rounds that would be counted', { rounds: Number(n!.rounds) });
      await finishRun(db, runId, 'succeeded', { dryRun: true, rounds: Number(n!.rounds) });
      return 0;
    }
    const result = await db.transaction((tx) => rebuildGameStats(tx));
    await finishRun(db, runId, 'succeeded', result);
    print('Leaderboard statistics rebuilt', result);
    return 0;
  } catch (err) {
    const refused = err instanceof MaintenanceRefused;
    await finishRun(db, runId, refused ? 'refused' : 'failed', { error: String((err as Error).message) });
    console.error(`\n${refused ? 'REFUSED' : 'FAILED'}: ${(err as Error).message}`);
    return refused ? 2 : 1;
  }
}

let code = 1;
try {
  switch (command) {
    case 'status':
      code = await status();
      break;
    case 'reset-test-data':
      code = await resetTestData();
      break;
    case 'launch-production':
      code = await launchProduction();
      break;
    case 'create-owner':
      code = await createOwner();
      break;
    case 'create-test-accounts':
      code = await createTestAccounts();
      break;
    case 'stats-rebuild':
      code = await statsRebuild();
      break;
    default:
      console.error('Usage: maintenance <status | create-owner | create-test-accounts | reset-test-data | launch-production | stats-rebuild> [options]');
      code = 1;
  }
} catch (err) {
  console.error(`FAILED: ${(err as Error).message}`);
} finally {
  await client.end({ timeout: 5 });
}
process.exit(code);
