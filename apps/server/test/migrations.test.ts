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

describe('0005_cosmetics_mailbox upgrade keeps frame ownership', () => {
  it('copies owned frames into the inventory, keeps user_items, and leaves equipped frames as they were', async () => {
    await resetDatabase();
    await migrate(db, { migrationsFolder: migrationsUpTo(5) }); // 0000–0004
    await db.execute(sql`INSERT INTO users (uid, username, username_lower, password_hash, display_name, frame) VALUES
      (100500, 'collector', 'collector', 'x', 'Collector', 'sapphire'), (100501, 'plain', 'plain', 'x', 'Plain', 'classic')`);
    await db.execute(sql`INSERT INTO user_items (user_id, item_id) SELECT id, f FROM users, unnest(ARRAY['silver', 'sapphire']) AS f WHERE uid = 100500`);
    await runMigrations(db);
    const inv = await rows<{ item_id: string; kind: string; source: string }>(sql`
      SELECT i.item_id, i.kind, i.source FROM inventory_items i JOIN users u ON u.id = i.user_id WHERE u.uid = 100500 ORDER BY 1`);
    expect(inv).toEqual([
      { item_id: 'sapphire', kind: 'frame', source: 'legacy' },
      { item_id: 'silver', kind: 'frame', source: 'legacy' },
    ]);
    expect((await rows(sql`SELECT 1 FROM user_items`)).length).toBe(2);
    expect((await rows<{ frame: string }>(sql`SELECT frame FROM users WHERE uid = 100500`))[0]!.frame).toBe('sapphire');
    expect((await rows(sql`SELECT 1 FROM catalog_items WHERE status = 'released' AND id IN ('classic', 'silver', 'emerald', 'ruby', 'sapphire', 'royal')`)).length).toBe(6);
  });
});

describe('0006_shared_round_tables upgrade', () => {
  it('adds the default tables without touching players, wallets or history', async () => {
    await resetDatabase();
    await migrate(db, { migrationsFolder: migrationsUpTo(6) }); // 0000–0005
    await db.execute(sql`INSERT INTO users (uid, username, username_lower, password_hash, display_name) VALUES (100600, 'veteran', 'veteran', 'x', 'Veteran')`);
    const before = await rows<{ uid: number; balance: string }>(sql`SELECT u.uid, w.balance FROM users u LEFT JOIN wallets w ON w.user_id = u.id ORDER BY 1`);
    await runMigrations(db);
    expect(await rows(sql`SELECT u.uid, w.balance FROM users u LEFT JOIN wallets w ON w.user_id = u.id ORDER BY 1`)).toEqual(before);
    const tables = await rows<{ id: string; game: string; status: string }>(sql`SELECT id, game, status FROM game_tables ORDER BY sort`);
    expect(tables).toEqual([
      { id: 'taixiu-1', game: 'taixiu', status: 'open' },
      { id: 'roulette-1', game: 'roulette', status: 'open' },
    ]);
    // Re-running is a no-op.
    await runMigrations(db);
    expect((await rows(sql`SELECT 1 FROM game_tables`)).length).toBe(2);
  });
});

describe('0007_progression_rank upgrade', () => {
  it('adds levels and ranks without touching existing players, mail or ledger', async () => {
    await resetDatabase();
    await migrate(db, { migrationsFolder: migrationsUpTo(7) }); // 0000–0006
    await db.execute(sql`INSERT INTO users (uid, username, username_lower, password_hash, display_name) VALUES (100700, 'old', 'old', 'x', 'Old')`);
    await db.execute(sql`INSERT INTO mail_messages (user_id, kind, subject) SELECT id, 'system', 'Hello' FROM users WHERE uid = 100700`);
    const before = await rows(sql`SELECT u.uid, m.subject, m.claimed_at FROM users u JOIN mail_messages m ON m.user_id = u.id ORDER BY 1`);
    await runMigrations(db);
    expect(await rows(sql`SELECT u.uid, m.subject, m.claimed_at FROM users u JOIN mail_messages m ON m.user_id = u.id ORDER BY 1`)).toEqual(before);
    expect(await rows(sql`SELECT reward_key FROM mail_messages`)).toEqual([{ reward_key: null }]);
    // Players without a progress row are level 1; history rows cannot be rewritten.
    expect(await rows(sql`SELECT 1 FROM player_progress`)).toEqual([]);
    await db.execute(sql`INSERT INTO exp_events (user_id, source, source_key, amount, level_before, level_after) SELECT id, 'admin', 'k', 5, 1, 1 FROM users WHERE uid = 100700`);
    await expect(db.execute(sql`UPDATE exp_events SET amount = 999`)).rejects.toThrow();
  });
});

describe('0008_rewards_cosmetics upgrade', () => {
  it('keeps inventories and seasons, makes owned items permanent, seeds the Vương Giả set', async () => {
    await resetDatabase();
    await migrate(db, { migrationsFolder: migrationsUpTo(8) }); // 0000–0007
    await db.execute(sql`INSERT INTO users (uid, username, username_lower, password_hash, display_name, frame) VALUES (100800, 'keeper', 'keeper', 'x', 'Keeper', 'ruby')`);
    await db.execute(sql`INSERT INTO inventory_items (user_id, item_id, kind, source) SELECT id, 'ruby', 'frame', 'shop' FROM users WHERE uid = 100800`);
    await db.execute(sql`INSERT INTO rank_seasons (name, status, starts_at, ends_at, rules, rewards) VALUES ('Old', 'active', now(), now() + interval '1 day', '{}', '{"tiers":{},"top":{}}')`);
    await runMigrations(db);
    expect(await rows(sql`SELECT i.item_id, i.expires_at, u.frame FROM inventory_items i JOIN users u ON u.id = i.user_id`)).toEqual([{ item_id: 'ruby', expires_at: null, frame: 'ruby' }]);
    const s = await rows<{ rewards: { brackets: Record<string, unknown[]> } }>(sql`SELECT rewards FROM rank_seasons`);
    expect(s[0]!.rewards.brackets.top1).toHaveLength(6);
    expect((await rows(sql`SELECT 1 FROM catalog_items WHERE id LIKE 'vuong_gia_%' AND NOT tradable AND price_silver IS NULL`)).length).toBe(4);
  });
});

describe('0020–0022 social, missions and support upgrade', () => {
  it('keeps friendships, guilds, claims and tickets; back-fills who wrote each ticket message', async () => {
    await resetDatabase();
    await migrate(db, { migrationsFolder: migrationsUpTo(20) }); // 0000–0019: the live schema before this release
    await db.execute(sql`INSERT INTO users (uid, username, username_lower, password_hash, display_name, account_type) VALUES (1000, 'keyo_support', 'keyo_support', '!', 'Keyo Support', 'system_support')`);
    await db.execute(sql`INSERT INTO users (uid, username, username_lower, password_hash, display_name) VALUES
      (100900, 'lead', 'lead', 'x', 'Lead'), (100901, 'mate', 'mate', 'x', 'Mate'), (100902, 'agent', 'agent', 'x', 'Agent')`);
    // The 0019 trigger attached Support as everyone's friend; real friendships exist too.
    await db.execute(sql`INSERT INTO friendships (user_id, friend_id) SELECT a.id, b.id FROM users a, users b WHERE a.uid = 100900 AND b.uid = 100901`);
    await db.execute(sql`INSERT INTO guilds (name, owner_id, points) SELECT 'Old Guild', id, 1234 FROM users WHERE uid = 100900`);
    await db.execute(sql`INSERT INTO guild_members (user_id, guild_id, role) SELECT u.id, g.id, 'owner' FROM users u, guilds g WHERE u.uid = 100900`);
    await db.execute(sql`INSERT INTO quest_claims (user_id, quest_id, period_key) SELECT id, 'daily_play', '2026-10-01' FROM users WHERE uid = 100901`);
    await db.execute(sql`INSERT INTO support_tickets (user_id, category, subject) SELECT id, 'game', 'Old ticket' FROM users WHERE uid = 100901`);
    await db.execute(sql`INSERT INTO support_ticket_messages (ticket_id, author_id, body) SELECT t.id, t.user_id, 'help me' FROM support_tickets t`);
    await db.execute(sql`INSERT INTO support_ticket_messages (ticket_id, author_id, body) SELECT t.id, u.id, 'we are on it' FROM support_tickets t, users u WHERE u.uid = 100902`);
    const before = await rows<{ f: string; s: string; g: string; m: string; c: string }>(sql`
      SELECT (SELECT count(*) FROM friendships) AS f, (SELECT count(*) FROM friendships fr JOIN users u ON u.id = fr.friend_id WHERE u.uid = 1000) AS s,
             (SELECT count(*) FROM guild_members) AS g, (SELECT count(*) FROM support_ticket_messages) AS m, (SELECT count(*) FROM quest_claims) AS c`);
    expect(Number(before[0]!.s)).toBeGreaterThan(0);

    await runMigrations(db);
    const after = await rows<typeof before[0]>(sql`
      SELECT (SELECT count(*) FROM friendships) AS f, (SELECT count(*) FROM friendships fr JOIN users u ON u.id = fr.friend_id WHERE u.uid = 1000) AS s,
             (SELECT count(*) FROM guild_members) AS g, (SELECT count(*) FROM support_ticket_messages) AS m, (SELECT count(*) FROM quest_claims) AS c`);
    expect(after).toEqual(before);
    expect(await rows(sql`SELECT name, points, description, join_policy, disbanded_at FROM guilds`)).toEqual([{ name: 'Old Guild', points: '1234', description: '', join_policy: 'open', disbanded_at: null }]);
    expect(await rows(sql`SELECT body, from_staff FROM support_ticket_messages ORDER BY created_at, from_staff`)).toEqual([
      { body: 'help me', from_staff: false },
      { body: 'we are on it', from_staff: true },
    ]);
    expect(await rows(sql`SELECT vip_exp FROM quest_claims`)).toEqual([{ vip_exp: 0 }]);
    // New players are no longer attached to Keyo Support.
    await db.execute(sql`INSERT INTO users (uid, username, username_lower, password_hash, display_name) VALUES (100903, 'fresh', 'fresh', 'x', 'Fresh')`);
    expect(await rows(sql`SELECT 1 FROM friendships f JOIN users u ON u.id = f.user_id WHERE u.uid = 100903`)).toEqual([]);
  });
});

describe('0025_rank_mythic upgrade', () => {
  it('moves stacked Chiến Thần I RP into Thần Thoại, keeping every total RP and everyone else as they were', async () => {
    await resetDatabase();
    await migrate(db, { migrationsFolder: migrationsUpTo(25) }); // 0000–0024: the schema before Thần Thoại
    await db.execute(sql`INSERT INTO users (uid, username, username_lower, password_hash, display_name) VALUES
      (101000, 'top', 'top', 'x', 'Top'), (101001, 'full', 'full', 'x', 'Full'), (101002, 'climb', 'climb', 'x', 'Climb'), (101003, 'low', 'low', 'x', 'Low')`);
    const [season] = await rows<{ id: number }>(sql`INSERT INTO rank_seasons (name, starts_at, ends_at, status, rules, rewards) VALUES ('S1', now(), now() + interval '60 days', 'active', '{"winRp":25,"lossRp":20,"softResetDivisions":5}'::jsonb, '{}'::jsonb) RETURNING id`);
    for (const [uid, division, rp] of [
      [101000, 39, 450],
      [101001, 39, 200],
      [101002, 39, 150],
      [101003, 12, 80],
    ] as const) {
      await db.execute(sql`INSERT INTO player_ranks (season_id, user_id, division, rp, streak, peak_division) SELECT ${season!.id}, id, ${division}, ${rp}, 0, ${division} FROM users WHERE uid = ${uid}`);
    }
    const total = sql`SELECT u.uid, pr.division * 200 + pr.rp AS total FROM player_ranks pr JOIN users u ON u.id = pr.user_id ORDER BY u.uid`;
    const before = await rows(total);
    await runMigrations(db);
    expect(await rows(total)).toEqual(before);
    expect(await rows(sql`SELECT u.uid::int AS uid, pr.division, pr.rp, pr.peak_division FROM player_ranks pr JOIN users u ON u.id = pr.user_id ORDER BY u.uid`)).toEqual([
      { uid: 101000, division: 40, rp: 250, peak_division: 40 },
      { uid: 101001, division: 40, rp: 0, peak_division: 40 },
      { uid: 101002, division: 39, rp: 150, peak_division: 39 },
      { uid: 101003, division: 12, rp: 80, peak_division: 12 },
    ]);
    await expect(db.execute(sql`UPDATE player_ranks SET division = 41`)).rejects.toThrow();
  });
});

describe('0026_social_profile and 0027_private_rooms upgrade', () => {
  it('marks every existing table official and keeps seats, stacks and friendships as they were', async () => {
    await resetDatabase();
    await migrate(db, { migrationsFolder: migrationsUpTo(26) }); // 0000–0025
    await db.execute(sql`INSERT INTO users (uid, username, username_lower, password_hash, display_name) VALUES (101100, 'sitter', 'sitter', 'x', 'Sitter'), (101101, 'pal', 'pal', 'x', 'Pal')`);
    await db.execute(sql`INSERT INTO card_seats (table_id, seat, user_id, stack) SELECT 'poker-1', 2, id, 4321 FROM users WHERE uid = 101100`);
    await db.execute(sql`INSERT INTO bj_seats (table_id, seat, user_id) SELECT 'bj-1', 1, id FROM users WHERE uid = 101101`);
    await db.execute(sql`INSERT INTO friendships (user_id, friend_id) SELECT a.id, b.id FROM users a, users b WHERE a.uid = 101100 AND b.uid = 101101`);
    const snapshot = sql`SELECT (SELECT json_agg(json_build_object('t', table_id, 's', seat, 'k', stack) ORDER BY table_id) FROM card_seats) AS cards,
      (SELECT json_agg(json_build_object('t', table_id, 's', seat) ORDER BY table_id) FROM bj_seats) AS bj, (SELECT count(*) FROM friendships) AS friends,
      (SELECT count(*) FROM card_tables) AS card_tables, (SELECT count(*) FROM bj_tables) AS bj_tables`;
    const before = await rows(snapshot);
    await runMigrations(db);
    expect(await rows(snapshot)).toEqual(before);
    expect(await rows(sql`SELECT DISTINCT kind FROM card_tables UNION SELECT DISTINCT kind FROM bj_tables`)).toEqual([{ kind: 'official' }]);
    for (const table of ['game_rooms', 'room_access', 'player_follows', 'profile_likes', 'player_blocks', 'player_reports', 'profile_settings']) {
      expect(await rows(sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}`)).toEqual([{ n: 0 }]);
    }
    // A private room must carry a password hash, and a follow cannot point at oneself.
    await expect(db.execute(sql`INSERT INTO game_rooms (id, engine, table_id, game, name, owner_id, visibility, stake) SELECT 'card:r-00000001', 'card', 'x', 'poker', 'Bad', id, 'private', 100 FROM users WHERE uid = 101100`)).rejects.toThrow();
    await expect(db.execute(sql`INSERT INTO player_follows (follower_id, followee_id) SELECT id, id FROM users WHERE uid = 101100`)).rejects.toThrow();
  });
});

describe('0029–0031 VIP configuration, profile photos, gift shop and charm upgrade', () => {
  it('keeps every VIP EXP, level, wallet, frame and avatar; adds empty gift/charm tables; rollback files undo cleanly', async () => {
    await resetDatabase();
    await migrate(db, { migrationsFolder: migrationsUpTo(29) }); // 0000–0028: the schema live servers run before this release
    await db.execute(sql`INSERT INTO users (uid, username, username_lower, password_hash, display_name) VALUES
      (1002, 'keyo_gm', 'keyo_gm', 'x', 'Keyo GM'), (101200, 'vip_a', 'vip_a', 'x', 'A'), (101201, 'vip_b', 'vip_b', 'x', 'B'), (101202, 'vip_c', 'vip_c', 'x', 'C')`);
    await db.execute(sql`UPDATE users SET frame = 'royal', avatar = 7, avatar_item = NULL WHERE uid = 101200`);
    await db.execute(sql`INSERT INTO wallets (user_id, balance, gold) SELECT id, uid * 3, uid % 97 FROM users`);
    await db.execute(sql`INSERT INTO vip_progress (user_id, exp, last_claim_date) SELECT id, CASE uid WHEN 101200 THEN 0 WHEN 101201 THEN 12000 WHEN 101202 THEN 999999 ELSE 4999 END, '2026-10-01' FROM users`);
    const snapshot = sql`SELECT
      (SELECT json_agg(json_build_object('u', u.uid, 'exp', vp.exp, 'claim', vp.last_claim_date) ORDER BY u.uid) FROM vip_progress vp JOIN users u ON u.id = vp.user_id) AS vip,
      (SELECT json_agg(json_build_object('u', uid, 'f', frame, 'a', avatar, 'i', avatar_item) ORDER BY uid) FROM users) AS look,
      (SELECT json_agg(json_build_object('b', balance, 'g', gold) ORDER BY user_id) FROM wallets) AS wallets`;
    const before = await rows(snapshot);
    await runMigrations(db);
    expect(await rows(snapshot)).toEqual(before);
    // Same levels as the code table gave: 0 → 1, 4,999 → 4, 12,000 → 7, 999,999 → 15.
    expect(await rows(sql`SELECT u.uid::int AS uid, keyo_vip_level(vp.exp, vp.override_level, vp.override_until) AS level FROM vip_progress vp JOIN users u ON u.id = vp.user_id ORDER BY u.uid`)).toEqual([
      { uid: 1002, level: 4 },
      { uid: 101200, level: 1 },
      { uid: 101201, level: 7 },
      { uid: 101202, level: 15 },
    ]);
    expect(await rows(sql`SELECT count(*)::int AS n, max(level) AS top FROM vip_levels`)).toEqual([{ n: 15, top: 15 }]);
    for (const table of ['vip_events', 'avatar_uploads', 'gift_catalog', 'gift_transactions', 'charm_points', 'charm_ledger']) {
      expect(await rows(sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}`)).toEqual([{ n: 0 }]);
    }
    // Re-running is a no-op (nothing re-seeded, nothing changed).
    await runMigrations(db);
    expect(await rows(sql`SELECT count(*)::int AS n FROM vip_levels`)).toEqual([{ n: 15 }]);
    expect(await rows(snapshot)).toEqual(before);
    // Rollback files restore the 0028 shape and keep the same data.
    for (const f of ['0031_gift_shop_charm', '0030_avatar_uploads', '0029_vip_config']) {
      await db.execute(sql.raw(readFileSync(resolve(__dirname, `../drizzle/rollback/${f}.down.sql`), 'utf8')));
    }
    expect(await rows(snapshot)).toEqual(before);
    expect(await rows(sql`SELECT to_regclass('vip_levels') AS a, to_regclass('gift_transactions') AS b, to_regclass('avatar_uploads') AS c`)).toEqual([{ a: null, b: null, c: null }]);
  });
});

describe('0032 Keyo Captain dual Owner upgrade', () => {
  it('makes UID 1000 the second Owner without touching accounts, balances or other roles; rollback restores the single Owner', async () => {
    await resetDatabase();
    await migrate(db, { migrationsFolder: migrationsUpTo(32) }); // 0000–0031
    await bootstrapRoles(db);
    await db.execute(sql`INSERT INTO users (uid, username, username_lower, password_hash, display_name, account_type) VALUES
      (1000, 'keyo_support', 'keyo_support', '!disabled', 'Keyo Support', 'system_support'),
      (1002, 'keyo_gm', 'keyo_gm', 'x', 'Keyo GM', 'player'),
      (1005, 'voxtan', 'voxtan', 'y', 'Voxtan', 'player'),
      (101300, 'p1', 'p1', 'z', 'P1', 'player')`);
    await db.execute(sql`INSERT INTO wallets (user_id, balance, gold) SELECT id, uid * 7, uid % 89 FROM users`);
    await db.execute(sql`INSERT INTO user_roles (user_id, role_id) SELECT id, 'owner' FROM users WHERE uid = 1002`);
    await db.execute(sql`INSERT INTO user_roles (user_id, role_id) SELECT id, 'super_admin' FROM users WHERE uid = 1005`);
    await db.execute(sql`INSERT INTO support_tickets (user_id, category, subject) SELECT id, 'account', 'Cũ' FROM users WHERE uid = 101300`);
    // Before 0032 a second Owner is impossible.
    await expect(db.execute(sql`INSERT INTO user_roles (user_id, role_id) SELECT id, 'owner' FROM users WHERE uid = 1000`)).rejects.toThrow();

    const snapshot = sql`SELECT
      (SELECT json_agg(json_build_object('u', uid, 't', account_type, 'p', password_hash, 's', status, 'id', id) ORDER BY uid) FROM users) AS users,
      (SELECT json_agg(json_build_object('b', balance, 'g', gold) ORDER BY user_id) FROM wallets) AS wallets,
      (SELECT json_agg(json_build_object('u', u.uid, 'r', r.role_id) ORDER BY u.uid, r.role_id) FROM user_roles r JOIN users u ON u.id = r.user_id WHERE NOT (u.uid = 1000 AND r.role_id = 'owner')) AS roles,
      (SELECT count(*) FROM support_tickets) AS tickets`;
    const owners = sql`SELECT u.uid::int AS uid FROM user_roles r JOIN users u ON u.id = r.user_id WHERE r.role_id = 'owner' ORDER BY u.uid`;
    const before = await rows(snapshot);

    await runMigrations(db);
    await bootstrapOwner(db);
    await bootstrapOwner(db);
    expect(await rows(snapshot)).toEqual(before);
    expect(await rows(owners)).toEqual([{ uid: 1000 }, { uid: 1002 }]);
    expect(await rows(sql`SELECT display_name FROM users WHERE uid = 1000`)).toEqual([{ display_name: 'Keyo Captain' }]);
    // Still nobody else, and an Owner role can never be removed.
    await expect(db.execute(sql`INSERT INTO user_roles (user_id, role_id) SELECT id, 'owner' FROM users WHERE uid = 1005`)).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM user_roles WHERE role_id = 'owner'`)).rejects.toThrow();
    expect(await rows(sql`SELECT count(*)::int AS n FROM account_setup_tokens`)).toEqual([{ n: 0 }]);
    expect(await rows(sql`SELECT count(*)::int AS n FROM support_tickets WHERE client_key IS NULL`)).toEqual([{ n: 1 }]);

    await runMigrations(db); // re-run: no-op
    expect(await rows(snapshot)).toEqual(before);

    // The file wraps itself in BEGIN/COMMIT for psql; the driver runs the same body in its own transaction.
    const down = readFileSync(resolve(__dirname, '../drizzle/rollback/0032_keyo_captain_dual_owner.down.sql'), 'utf8').replace(/^(BEGIN|COMMIT);$/gm, '');
    await db.transaction((tx) => tx.execute(sql.raw(down)));
    expect(await rows(snapshot)).toEqual(before);
    expect(await rows(owners)).toEqual([{ uid: 1002 }]);
    expect(await rows(sql`SELECT display_name FROM users WHERE uid = 1000`)).toEqual([{ display_name: 'Keyo Support' }]);
    expect(await rows(sql`SELECT to_regclass('account_setup_tokens') AS t`)).toEqual([{ t: null }]);
    await expect(db.execute(sql`INSERT INTO user_roles (user_id, role_id) SELECT id, 'owner' FROM users WHERE uid = 1000`)).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM user_roles WHERE role_id = 'owner'`)).rejects.toThrow();
  });
});
