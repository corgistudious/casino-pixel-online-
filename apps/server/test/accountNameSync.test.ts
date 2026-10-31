import { KEYO_OWNER_UID, KEYO_SUPPORT_UID } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOwner, createStaff, randomIp, register, startTestApp, TEST_PASSWORD, type TestApp } from './helpers';

/**
 * One account name per player: display name = username (@name). Register, admin create, rename by
 * card and admin rename write both together; the database trigger refuses any other write.
 */
let t: TestApp;
let owner: Awaited<ReturnType<typeof createOwner>>;
let superAdmin: Awaited<ReturnType<typeof createStaff>>;
let admin: Awaited<ReturnType<typeof createStaff>>;

beforeAll(async () => {
  t = await startTestApp();
  owner = await createOwner(t);
  superAdmin = await createStaff(t, 'super_admin');
  admin = await createStaff(t, 'admin');
});
afterAll(async () => {
  await t.app.close();
});

const call = (method: 'GET' | 'POST', url: string, headers: Record<string, string> = {}, payload?: unknown) =>
  t.app.inject({ method, url, headers, payload: payload as object, remoteAddress: randomIp() });
const code = (res: { json: () => { error?: { code?: string } } }) => res.json().error?.code;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const names = async (uid: number) =>
  (await t.db.execute<{ username: string; username_lower: string; display_name: string }>(sql`SELECT username, username_lower, display_name FROM users WHERE uid = ${uid}`))[0]!;
const userCount = async () => Number((await t.db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM users`))[0]!.n);
const registerAs = (displayName: string) =>
  call('POST', '/api/auth/register', {}, { displayName, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD, acceptTerms: true });
const giveCards = (userId: string, n: number) =>
  t.db.execute(sql`INSERT INTO keyo_rename_cards(user_id, quantity) VALUES (${userId}::uuid, ${n}) ON CONFLICT (user_id) DO UPDATE SET quantity = ${n}`);
const cards = async (userId: string) => Number((await t.db.execute<{ q: number }>(sql`SELECT COALESCE((SELECT quantity FROM keyo_rename_cards WHERE user_id = ${userId}::uuid), 0) AS q`))[0]!.q);
/** Spend the free rename so the next one needs a card. */
const useFreeRename = (userId: string) =>
  t.db.execute(sql`INSERT INTO keyo_rename_state(user_id, free_used, last_renamed_at) VALUES (${userId}::uuid, true, now()) ON CONFLICT (user_id) DO UPDATE SET free_used = true, last_renamed_at = now()`);
/** An account created before names were unified (the trigger is bypassed only to build the fixture). */
async function legacyAccount(uid: number, username: string, displayName: string) {
  await t.db.execute(sql`ALTER TABLE users DISABLE TRIGGER users_name_sync`);
  try {
    await t.db.execute(sql`INSERT INTO users (uid, username, username_lower, password_hash, display_name, status) VALUES (${uid}, ${username}, ${username.toLowerCase()}, '!', ${displayName}, 'active')`);
  } finally {
    await t.db.execute(sql`ALTER TABLE users ENABLE TRIGGER users_name_sync`);
  }
}

describe('registration', () => {
  it('one name becomes both the display name and the @username', async () => {
    const res = await registerAs('KeyoPlayer');
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ username: 'KeyoPlayer', displayName: 'KeyoPlayer' });
    expect(await names(res.json().user.uid)).toEqual({ username: 'KeyoPlayer', username_lower: 'keyoplayer', display_name: 'KeyoPlayer' });
    // Signs in with the name, the UID or (when verified) the email; the session works as before.
    const login = await call('POST', '/api/auth/login', {}, { login: 'keyoplayer', password: TEST_PASSWORD });
    expect(login.statusCode).toBe(200);
  });

  it('refuses a taken name (case-insensitive), invalid names and official names, creating nothing', async () => {
    const before = await userCount();
    expect(code(await registerAs('KEYOPLAYER'))).toBe('username_taken');
    for (const bad of ['ab', 'a'.repeat(21), 'Tên Có Dấu', 'with space', '12345', 'bad-dash', 'emoji😀']) {
      const res = await registerAs(bad);
      expect(res.statusCode, bad).toBe(400);
      expect(code(res), bad).toBe('name_invalid');
    }
    for (const reserved of ['Keyo_Support', 'Administrator', 'KeyoOfficial']) expect(code(await registerAs(reserved)), reserved).toBe('name_reserved');
    expect(await userCount()).toBe(before);
  });

  it('a legacy account still showing a name blocks it for others', async () => {
    await legacyAccount(150001, 'player_legacy001', 'LegacyShown');
    expect(code(await registerAs('legacyshown'))).toBe('username_taken');
  });

  it('two simultaneous registrations of one name create exactly one account', async () => {
    const results = await Promise.all([registerAs('RaceName'), registerAs('racename'), registerAs('RACENAME')]);
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(results.filter((r) => code(r) === 'username_taken')).toHaveLength(2);
  });
});

describe('rename with the free rename or a card', () => {
  it('updates display name and @username together; the session stays valid; audited', async () => {
    const p = await register(t);
    const res = await call('POST', '/api/me/rename', bearer(p.token), { displayName: 'LemonPro', useCard: false });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ uid: p.user.uid, username: 'LemonPro', displayName: 'LemonPro' });
    expect(await names(p.user.uid)).toEqual({ username: 'LemonPro', username_lower: 'lemonpro', display_name: 'LemonPro' });
    // Same token still works (sessions are bound to the account, not the name); UID unchanged.
    const me = await call('GET', '/api/me', bearer(p.token));
    expect(me.json().user).toMatchObject({ uid: p.user.uid, username: 'LemonPro' });
    expect((await call('POST', '/api/auth/login', {}, { login: 'LemonPro', password: TEST_PASSWORD })).statusCode).toBe(200);
    const [a] = await t.db.execute<{ details: { from: { displayName: string }; to: string } }>(sql`SELECT details FROM audit_logs WHERE action = 'account.rename' AND target_id = ${String(p.user.uid)}`);
    expect(a!.details.to).toBe('LemonPro');
  });

  it('a failed rename (name taken) keeps the card and the old name', async () => {
    const p = await register(t);
    await useFreeRename(p.user.id);
    await giveCards(p.user.id, 1);
    const before = await names(p.user.uid);
    const res = await call('POST', '/api/me/rename', bearer(p.token), { displayName: 'lemonpro', useCard: true });
    expect(code(res)).toBe('username_taken');
    expect(await cards(p.user.id)).toBe(1);
    expect(await names(p.user.uid)).toEqual(before);
    // Invalid or reserved names do not use the card either.
    expect(code(await call('POST', '/api/me/rename', bearer(p.token), { displayName: 'no spaces allowed', useCard: true }))).toBe('name_invalid');
    expect(code(await call('POST', '/api/me/rename', bearer(p.token), { displayName: 'Keyo_Admin', useCard: true }))).toBe('name_reserved');
    expect(await cards(p.user.id)).toBe(1);
    // A valid name uses exactly one card.
    const ok = await call('POST', '/api/me/rename', bearer(p.token), { displayName: 'CardRenamed', useCard: true });
    expect(ok.statusCode).toBe(200);
    expect(await cards(p.user.id)).toBe(0);
  });

  it('two players racing for one name: one wins, the other keeps name and card', async () => {
    const a = await register(t);
    const b = await register(t);
    for (const p of [a, b]) {
      await useFreeRename(p.user.id);
      await giveCards(p.user.id, 1);
    }
    const [ra, rb] = await Promise.all([
      call('POST', '/api/me/rename', bearer(a.token), { displayName: 'ContestedName', useCard: true }),
      call('POST', '/api/me/rename', bearer(b.token), { displayName: 'contestedname', useCard: true }),
    ]);
    const codes = [ra.statusCode, rb.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const loser = ra.statusCode === 200 ? b : a;
    expect(await cards(loser.user.id)).toBe(1);
    const n = await names(loser.user.uid);
    expect(n.username).toBe(n.display_name);
    expect(n.username.toLowerCase()).not.toBe('contestedname');
  });

  it('a legacy account (two different names) is synchronised by its next rename', async () => {
    await legacyAccount(150002, 'player_legacy002', 'OldShown');
    // Legacy rows keep working for everything else: other column updates are not blocked.
    await t.db.execute(sql`UPDATE users SET locale = 'en', frame = 'classic' WHERE uid = 150002`);
    expect(await names(150002)).toMatchObject({ username: 'player_legacy002', display_name: 'OldShown' });
    const { renamePlayer } = await import('../src/services/rename');
    const [{ id }] = (await t.db.execute<{ id: string }>(sql`SELECT id FROM users WHERE uid = 150002`)) as unknown as [{ id: string }];
    await renamePlayer(t.db, id, 'OldShown', false);
    expect(await names(150002)).toEqual({ username: 'OldShown', username_lower: 'oldshown', display_name: 'OldShown' });
  });

  it('the Owner renames themself and keeps the Owner role', async () => {
    const res = await call('POST', '/api/me/rename', bearer(owner.token), { displayName: 'Lemon_GM', useCard: false });
    expect(res.statusCode).toBe(200);
    expect(await names(KEYO_OWNER_UID)).toEqual({ username: 'Lemon_GM', username_lower: 'lemon_gm', display_name: 'Lemon_GM' });
    const roles = await t.db.execute<{ role_id: string }>(sql`SELECT ur.role_id FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE u.uid = ${KEYO_OWNER_UID}`);
    expect(roles.map((r) => r.role_id)).toContain('owner');
    expect((await call('GET', '/api/me', bearer(owner.token))).json().user.permissions).toContain('users.rename');
  });
});

describe('admin rename', () => {
  it('Super Admin renames a player: both fields, password re-confirmed, audited with old and new names', async () => {
    const p = await register(t);
    const before = await names(p.user.uid);
    // Without the password re-confirmation the route refuses.
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/rename`, bearer(superAdmin.token), { name: 'StaffRenamed', reason: 'player request' }))).toBe('reauth_required');
    const res = await call('POST', `/api/admin/users/${p.user.uid}/rename`, superAdmin.headers, { name: 'StaffRenamed', reason: 'player request' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ uid: p.user.uid, username: 'StaffRenamed', displayName: 'StaffRenamed' });
    expect(await names(p.user.uid)).toEqual({ username: 'StaffRenamed', username_lower: 'staffrenamed', display_name: 'StaffRenamed' });
    const [a] = await t.db.execute<{ actor_id: string; details: { from: { username: string; displayName: string }; to: string; reason: string } }>(sql`SELECT actor_id, details FROM audit_logs WHERE action = 'user.rename' AND target_id = ${String(p.user.uid)}`);
    expect(a!.actor_id).toBe(superAdmin.user.id);
    expect(a!.details).toMatchObject({ from: { username: before.username, displayName: before.display_name }, to: 'StaffRenamed', reason: 'player request' });
    // The player's own session keeps working.
    expect((await call('GET', '/api/me', bearer(p.token))).json().user.username).toBe('StaffRenamed');
  });

  it('refuses without permission, on the Owner, on Keyo Support, on oneself, and for taken or invalid names', async () => {
    const p = await register(t);
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/rename`, admin.headers, { name: 'AdminTry', reason: 'test' }))).toBe('forbidden');
    expect(code(await call('POST', `/api/admin/users/${KEYO_OWNER_UID}/rename`, superAdmin.headers, { name: 'OwnerTaken', reason: 'test' }))).toBe('protected_account');
    const support = await call('POST', `/api/admin/users/${KEYO_SUPPORT_UID}/rename`, owner.headers, { name: 'SupportTaken', reason: 'test' });
    expect(['not_found', 'system_account', 'protected_account']).toContain(code(support));
    expect(code(await call('POST', `/api/admin/users/${superAdmin.user.uid}/rename`, superAdmin.headers, { name: 'SelfRename', reason: 'test' }))).toBe('self_action_forbidden');
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/rename`, superAdmin.headers, { name: 'staffrenamed', reason: 'test' }))).toBe('username_taken');
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/rename`, superAdmin.headers, { name: 'bad name', reason: 'test' }))).toBe('name_invalid');
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/rename`, superAdmin.headers, { name: 'Keyo_Captain', reason: 'test' }))).toBe('name_reserved');
    const n = await names(p.user.uid);
    expect(n.username).toBe(n.display_name);
  });
});

const outOfSync = (e: unknown) => /name_out_of_sync/.test(String((e as { cause?: { message?: string } }).cause?.message ?? (e as Error).message));

describe('database backstop', () => {
  it('refuses any write that would leave a player with two different names; deleted and system accounts exempt', async () => {
    const p = await register(t);
    await expect(t.db.execute(sql`UPDATE users SET display_name = 'OnlyDisplay' WHERE uid = ${p.user.uid}`)).rejects.toSatisfy(outOfSync);
    await expect(t.db.execute(sql`UPDATE users SET username = 'OnlyUser' WHERE uid = ${p.user.uid}`)).rejects.toSatisfy(outOfSync);
    await expect(t.db.execute(sql`INSERT INTO users (uid, username, username_lower, password_hash, display_name) VALUES (150003, 'a_b', 'a_b', '!', 'A B')`)).rejects.toSatisfy(outOfSync);
    // username_lower always follows username.
    await t.db.execute(sql`UPDATE users SET username = 'MixedCase', username_lower = 'wrong', display_name = 'MixedCase' WHERE uid = ${p.user.uid}`);
    expect((await names(p.user.uid)).username_lower).toBe('mixedcase');
    // Anonymising a deleted account and the system account keep their own names.
    await t.db.execute(sql`UPDATE users SET status = 'deleted', username = 'deleted_x1', display_name = 'Deleted player' WHERE uid = ${p.user.uid}`);
    expect(await names(KEYO_SUPPORT_UID)).toMatchObject({ display_name: 'Keyo Captain' });
  });
});

describe('existing accounts: names-audit / names-sync', () => {
  it('plans safely, changes only valid unique display names, never protected accounts; audited; visible names unchanged', async () => {
    const { planNameSync, executeNameSync } = await import('../src/services/nameSync');
    await legacyAccount(150010, 'player_good', 'LegacyGood');
    await legacyAccount(150011, 'player_vn', 'Có Dấu');
    await legacyAccount(150012, 'player_twin1', 'Twin');
    await legacyAccount(150013, 'player_twin2', 'twin');
    await legacyAccount(150014, 'player_res', 'Keyo_Admin');
    const plan = await planNameSync(t.db);
    const uids = (xs: { uid: number }[]) => xs.map((x) => x.uid);
    expect(uids(plan.syncable)).toEqual(expect.arrayContaining([150010]));
    expect(plan.needsChoice).toEqual(expect.arrayContaining([
      expect.objectContaining({ uid: 150011, issue: 'invalid' }),
      expect.objectContaining({ uid: 150012, issue: 'duplicate' }),
      expect.objectContaining({ uid: 150013, issue: 'duplicate' }),
      expect.objectContaining({ uid: 150014, issue: 'reserved' }),
    ]));
    expect(uids(plan.syncable)).not.toContain(KEYO_OWNER_UID);
    expect(uids(plan.syncable)).not.toContain(KEYO_SUPPORT_UID);

    // Planning changed nothing.
    expect(await names(150010)).toMatchObject({ username: 'player_good', display_name: 'LegacyGood' });
    const result = await executeNameSync(t.db, 'vitest');
    expect(result.synced).toBe(plan.syncable.length);
    expect(await names(150010)).toEqual({ username: 'LegacyGood', username_lower: 'legacygood', display_name: 'LegacyGood' });
    for (const uid of [150011, 150012, 150013, 150014]) expect((await names(uid)).username).toMatch(/^player_/);
    const [a] = await t.db.execute<{ details: { from: string; to: string; operator: string } }>(sql`SELECT details FROM audit_logs WHERE action = 'account.name_sync' AND target_id = '150010'`);
    expect(a!.details).toEqual({ from: 'player_good', to: 'LegacyGood', operator: 'vitest' });
    // Idempotent: a second run has nothing left that is safe to change.
    expect((await executeNameSync(t.db, 'vitest')).synced).toBe(0);
  });
});
