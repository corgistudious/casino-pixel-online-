import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KEYO_SUPPORT_UID } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { users, wallets } from '../src/db/schema';
import { backupDatabase } from '../src/maintenance/backup';
import { executeLaunch, executeReset, MaintenanceRefused, planLaunch, planReset, uncoveredForeignKeys } from '../src/maintenance/testData';
import { createTestAccount } from '../src/services/accounts';
import { applyDelta } from '../src/services/wallet';
import { register, startTestApp, TEST_DB, TestSocket, type TestApp } from './helpers';

let t: TestApp;
let backupDir: string;
beforeAll(async () => {
  t = await startTestApp();
  backupDir = mkdtempSync(join(tmpdir(), 'keyo-backup-'));
});
afterAll(async () => {
  await t.app.close();
  rmSync(backupDir, { recursive: true, force: true });
});

const count = async (q: ReturnType<typeof sql>) => Number(((await t.db.execute(q)) as unknown as { c: string }[])[0]!.c);

/** An official (non-test) account with a special UID, a wallet and ledger history. */
async function officialAccount(uid: number) {
  const [u] = await t.db
    .insert(users)
    .values({ uid, username: `official${uid}`, usernameLower: `official${uid}`, passwordHash: '!disabled', displayName: 'Official', status: 'active', isTest: false })
    .returning();
  await t.db.insert(wallets).values({ userId: u!.id, balance: 0 });
  await applyDelta(t.db, u!.id, 1234, 'admin_adjust');
  return u!;
}

describe('test/production data separation', () => {
  it('starts in test mode and flags every new player account as TEST', async () => {
    const { user } = await register(t);
    const [row] = await t.db.execute<{ is_test: boolean }>(sql`SELECT is_test FROM users WHERE uid = ${user.uid}`);
    expect(row!.is_test).toBe(true);
    const [support] = await t.db.execute<{ is_test: boolean }>(sql`SELECT is_test FROM users WHERE uid = ${KEYO_SUPPORT_UID}`);
    expect(support!.is_test).toBe(false);
    const health = await t.app.inject({ url: '/api/health' });
    expect(health.json().dataMode).toBe('test');
  });

  it('refuses to start when KEYO_DATA_MODE does not match the database', async () => {
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, JWT_SECRET: 'x'.repeat(40), KEYO_DATA_MODE: 'production' });
    await expect(buildApp(config, { logger: false })).rejects.toThrow(/still in test mode/);
  });

  it('every table referencing users is covered by the reset registry', async () => {
    expect(await uncoveredForeignKeys(t.db)).toEqual([]);
    await t.db.execute(sql`CREATE TABLE future_feature (id serial PRIMARY KEY, owner uuid REFERENCES users(id))`);
    try {
      expect(await uncoveredForeignKeys(t.db)).toEqual(['future_feature.owner -> users']);
      expect((await planReset(t.db)).blockers.join(' ')).toMatch(/future_feature/);
    } finally {
      await t.db.execute(sql`DROP TABLE future_feature`);
    }
  });

  it('backs up the database with pg_dump and verifies the archive', () => {
    const b = backupDatabase(TEST_DB, backupDir, 'unit');
    expect(existsSync(b.path)).toBe(true);
    expect(b.bytes).toBeGreaterThan(1000);
  });
});

describe('reset:test-data and launch:production', () => {
  let official: { id: string; uid: number };

  it('dry run lists what would be removed and what is kept', async () => {
    official = await officialAccount(777);
    for (const username of ['tester001', 'tester002']) await createTestAccount(t.db, { username, password: 'password123' }, 'vitest');
    // A played round gives the test accounts game history, seeds and ledger rows.
    const { token } = await register(t);
    const ws = await TestSocket.connect(t.port, token);
    await ws.ok({ type: 'slots.spin', bet: 100 });
    ws.close();

    const plan = await planReset(t.db);
    expect(plan.mode).toBe('test');
    expect(plan.testAccounts).toBe(4);
    expect(plan.keptAccounts).toBe(2); // Keyo Support + official account
    expect(plan.blockers).toEqual([]);
    expect(plan.tables.find((x) => x.table === 'game_rounds')!.test).toBeGreaterThan(0);
    expect(plan.tables.find((x) => x.table === 'ledger_entries')!.kept).toBe(1);
    expect(plan.confirmPhrase).toBe(`RESET ${plan.database} 4`);
  });

  it('refuses to reset a TEST-owned guild containing real-player data', async () => {
    const [tester] = await t.db.execute<{ id: string }>(sql`SELECT id FROM users WHERE username = 'tester001'`);
    const [guild] = await t.db.execute<{ id: string }>(sql`
      INSERT INTO guilds (name, owner_id) VALUES ('Mixed Reset Safety', ${tester!.id}::uuid) RETURNING id
    `);
    try {
      await t.db.execute(sql`
        INSERT INTO guild_members (user_id, guild_id, role)
        VALUES (${official.id}::uuid, ${guild!.id}::uuid, 'member')
      `);
      const plan = await planReset(t.db);
      expect(plan.blockers.join(' ')).toMatch(/TEST-owned guild.*real-player/);
      await expect(executeReset(t.db, plan.confirmPhrase, 'vitest')).rejects.toBeInstanceOf(MaintenanceRefused);
      expect(await count(sql`SELECT count(*) AS c FROM guild_members WHERE user_id = ${official.id}::uuid`)).toBe(1);
      expect(await count(sql`SELECT count(*) AS c FROM users WHERE id = ${tester!.id}::uuid`)).toBe(1);
    } finally {
      await t.db.execute(sql`DELETE FROM guild_members WHERE guild_id = ${guild!.id}::uuid`);
      await t.db.execute(sql`DELETE FROM guilds WHERE id = ${guild!.id}::uuid`);
    }
    expect((await planReset(t.db)).blockers).toEqual([]);
  });

  it('refuses a wrong confirmation phrase and changes nothing', async () => {
    await expect(executeReset(t.db, 'RESET wrong 4', 'vitest')).rejects.toBeInstanceOf(MaintenanceRefused);
    expect(await count(sql`SELECT count(*) AS c FROM users WHERE is_test`)).toBe(4);
  });

  it('blocks the UID restart while test accounts exist', async () => {
    const plan = await planLaunch(t.db);
    expect(plan.blockers.join(' ')).toMatch(/TEST account/);
    await expect(executeLaunch(t.db, plan.confirmPhrase, 'vitest')).rejects.toBeInstanceOf(MaintenanceRefused);
  });

  it('deletes only TEST accounts and their data, keeping Keyo Support and official data', async () => {
    const plan = await planReset(t.db);
    const result = await executeReset(t.db, plan.confirmPhrase, 'vitest');
    expect(result.deletedAccounts).toBe(4);
    expect(result.deleted.game_rounds).toBeGreaterThan(0);
    expect(result.verification.remainingTestAccounts).toBe(0);
    expect(result.verification.after.tables).toEqual(result.verification.before.tables);

    expect(await count(sql`SELECT count(*) AS c FROM users WHERE is_test`)).toBe(0);
    expect(await count(sql`SELECT count(*) AS c FROM users WHERE uid = ${KEYO_SUPPORT_UID}`)).toBe(1);
    expect(await count(sql`SELECT count(*) AS c FROM ledger_entries WHERE user_id = ${official.id}`)).toBe(1);
    expect(await count(sql`SELECT count(*) AS c FROM email_outbox WHERE to_address LIKE 'u\\_%'`)).toBe(0);
    expect(await count(sql`SELECT count(*) AS c FROM audit_logs WHERE action = 'system.reset_test_data'`)).toBe(1);
    // Nothing left to reset.
    expect((await planReset(t.db)).blockers.join(' ')).toMatch(/no TEST accounts/);
  });

  it('restarts the player UID counter at 100000 once, then locks production forever', async () => {
    const plan = await planLaunch(t.db);
    expect(plan.blockers).toEqual([]);
    expect(plan.sequence.lastValue).toBeGreaterThan(100000);
    await expect(executeLaunch(t.db, 'LAUNCH nope', 'vitest')).rejects.toBeInstanceOf(MaintenanceRefused);
    expect(await executeLaunch(t.db, plan.confirmPhrase, 'vitest')).toMatchObject({ nextPlayerUid: 100000 });

    // First real player gets UID 100000 and is not a test account.
    const [first] = await t.db
      .insert(users)
      .values({ username: 'firstplayer', usernameLower: 'firstplayer', passwordHash: 'x', displayName: 'First' })
      .returning();
    expect(first!.uid).toBe(100000);
    expect(first!.isTest).toBe(false);

    // Production is permanent: no test accounts, no return to test mode, no second reset or launch.
    await expect(t.db.execute(sql`INSERT INTO users (username, username_lower, password_hash, display_name, is_test) VALUES ('t2', 't2', 'x', 'T', true)`)).rejects.toThrow();
    await expect(t.db.execute(sql`UPDATE environment_state SET mode = 'test'`)).rejects.toThrow();
    await expect(t.db.execute(sql`DELETE FROM environment_state`)).rejects.toThrow();
    expect((await planReset(t.db)).blockers.join(' ')).toMatch(/production mode/);
    expect((await planLaunch(t.db)).blockers.join(' ')).toMatch(/already in production/);
    await expect(createTestAccount(t.db, { username: 'late', password: 'password123' }, 'vitest')).rejects.toThrow();
  });

  it('a test-mode server refuses to start on the production database', async () => {
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, JWT_SECRET: 'x'.repeat(40), KEYO_DATA_MODE: 'test' });
    await expect(buildApp(config, { logger: false })).rejects.toThrow(/production database/);
  });
});

describe('maintenance CLI', () => {
  it('runs a dry run by default, records it, and is refused without confirmation', async () => {
    const env = { ...process.env, DATABASE_URL: TEST_DB, KEYO_BACKUP_DIR: backupDir };
    const dry = spawnSync('npx', ['tsx', 'src/maintenance/cli.ts', 'reset-test-data'], { env, encoding: 'utf8' });
    // The database is in production mode now, so even the dry run reports BLOCKED (exit 2).
    expect(dry.status).toBe(2);
    expect(dry.stdout).toMatch(/BLOCKED/);
    const exec = spawnSync('npx', ['tsx', 'src/maintenance/cli.ts', 'reset-test-data', '--execute', '--operator', 'owner'], { env, encoding: 'utf8' });
    expect(exec.status).toBe(2);
    expect(exec.stderr).toMatch(/REFUSED/);
    const runs = await t.db.execute<{ status: string; dry_run: boolean }>(sql`SELECT status, dry_run FROM maintenance_runs ORDER BY id`);
    expect(runs.map((r) => [r.dry_run, r.status])).toEqual([
      [true, 'refused'],
      [false, 'refused'],
    ]);
  }, 60_000);
});
