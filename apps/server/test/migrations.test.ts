import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { bootstrapOwner, bootstrapRoles } from '../src/services/rbac';
import { resetDatabase, TEST_DB } from './helpers';

const { db, client } = createDb(TEST_DB);
const dir = mkdtempSync(join(tmpdir(), 'keyo-migrations-'));
afterAll(async () => {
  await client.end();
  rmSync(dir, { recursive: true, force: true });
});

/** Copy of the migrations folder truncated to the first `count` migrations. */
function migrationsUpTo(count: number): string {
  const src = resolve(__dirname, '../drizzle');
  const out = join(dir, `upto-${count}`);
  cpSync(src, out, { recursive: true });
  const journalPath = join(out, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, count);
  writeFileSync(journalPath, JSON.stringify(journal));
  return out;
}

const rows = async <T>(q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as T[];

describe('0004_security_foundation upgrade keeps existing data', () => {
  it('moves roles, protects the Owner and Keyo Support, and loses nothing', async () => {
    await resetDatabase();
    await migrate(db, { migrationsFolder: migrationsUpTo(4) }); // 0000–0003: the schema live servers run today

    // Data as it can exist on a live server before this release (database in test mode).
    await db.execute(sql`INSERT INTO roles (id, name, description, system) VALUES
      ('super_admin', 'Super Admin', 'x', true), ('admin', 'Admin', 'x', true),
      ('support_agent', 'Support Agent', 'x', true), ('finance', 'Finance', 'x', true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO role_permissions (role_id, permission) VALUES
      ('admin', 'economy.grant'), ('admin', 'users.ban'), ('finance', 'economy.grant'), ('finance', 'economy.read'),
      ('support_agent', 'support.manage'), ('super_admin', 'roles.manage')`);
    await db.execute(sql`INSERT INTO users (uid, username, username_lower, password_hash, display_name) VALUES
      (1000, 'keyo_support', 'keyo_support', '!disabled', 'Keyo Support'),
      (1002, 'keyo_gm', 'keyo_gm', 'x', 'Keyo GM'),
      (100000, 'helper', 'helper', 'x', 'Helper'),
      (100001, 'cashier', 'cashier', 'x', 'Cashier'),
      (100002, 'boss', 'boss', 'x', 'Boss')`);
    await db.execute(sql`UPDATE users SET account_type = 'system_support' WHERE uid = 1000`);
    await db.execute(sql`INSERT INTO wallets (user_id, balance, gold) SELECT id, uid, 3 FROM users`);
    await db.execute(sql`INSERT INTO user_roles (user_id, role_id) SELECT id, 'support_agent' FROM users WHERE uid = 100000`);
    await db.execute(sql`INSERT INTO user_roles (user_id, role_id) SELECT id, 'finance' FROM users WHERE uid = 100001`);
    await db.execute(sql`INSERT INTO user_roles (user_id, role_id) SELECT id, 'super_admin' FROM users WHERE uid IN (100002, 1002)`);
    await db.execute(sql`INSERT INTO audit_logs (action) VALUES ('legacy.entry')`);
    const before = await rows<{ users: string; wallets: string; silver: string; audit: string }>(sql`
      SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM wallets) AS wallets,
             (SELECT sum(balance) FROM wallets) AS silver, (SELECT count(*) FROM audit_logs) AS audit`);
    // Created in test mode, so the trigger flagged the Owner and Support as test data.
    expect((await rows<{ is_test: boolean }>(sql`SELECT is_test FROM users WHERE uid = 1002`))[0]!.is_test).toBe(true);

    await runMigrations(db);
    await bootstrapRoles(db);
    await bootstrapOwner(db);

    const after = await rows<{ users: string; wallets: string; silver: string; audit: string }>(sql`
      SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM wallets) AS wallets,
             (SELECT sum(balance) FROM wallets) AS silver, (SELECT count(*) FROM audit_logs) AS audit`);
    expect(after[0]!.users).toBe(before[0]!.users);
    expect(after[0]!.wallets).toBe(before[0]!.wallets);
    expect(after[0]!.silver).toBe(before[0]!.silver);
    expect(Number(after[0]!.audit)).toBeGreaterThanOrEqual(Number(before[0]!.audit));

    const roleOf = async (uid: number) =>
      (await rows<{ role_id: string }>(sql`SELECT ur.role_id FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE u.uid = ${uid} ORDER BY 1`)).map((r) => r.role_id);
    expect(await roleOf(100000)).toEqual(['support']); // support_agent carried over
    expect(await roleOf(100001)).toEqual(['finance']); // kept, but read-only now
    expect(await roleOf(100002)).toEqual(['super_admin']);
    expect(await roleOf(1002)).toEqual(['owner', 'super_admin']);

    const perms = async (role: string) => (await rows<{ permission: string }>(sql`SELECT permission FROM role_permissions WHERE role_id = ${role}`)).map((r) => r.permission);
    expect(await perms('finance')).toEqual(['economy.read']);
    expect(await perms('admin')).not.toContain('economy.grant');
    expect(await perms('super_admin')).not.toContain('roles.manage');
    expect((await rows(sql`SELECT 1 FROM roles WHERE id = 'support_agent'`)).length).toBe(0);

    const flags = await rows<{ uid: string; is_test: boolean }>(sql`SELECT uid, is_test FROM users WHERE uid IN (1000, 1002) ORDER BY uid`);
    expect(flags.map((f) => f.is_test)).toEqual([false, false]);
    expect((await rows(sql`SELECT 1 FROM audit_logs WHERE action = 'legacy.entry'`)).length).toBe(1);
  });
});
