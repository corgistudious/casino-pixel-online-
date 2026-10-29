import { randomUUID } from 'node:crypto';
import { KEYO_OWNER_UID, KEYO_SUPPORT_UID } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { planReset } from '../src/maintenance/testData';
import { createOwnerAccount } from '../src/services/accounts';
import { createOwner, createStaff, randomIp, register, startTestApp, TEST_PASSWORD, TestSocket, type TestApp } from './helpers';

let t: TestApp;
let owner: Awaited<ReturnType<typeof createOwner>>;
let superAdmin: Awaited<ReturnType<typeof createStaff>>;
let admin: Awaited<ReturnType<typeof createStaff>>;
let moderator: Awaited<ReturnType<typeof createStaff>>;
let support: Awaited<ReturnType<typeof createStaff>>;

beforeAll(async () => {
  t = await startTestApp();
  owner = await createOwner(t);
  superAdmin = await createStaff(t, 'super_admin');
  admin = await createStaff(t, 'admin');
  moderator = await createStaff(t, 'moderator');
  support = await createStaff(t, 'support');
});
afterAll(async () => {
  await t.app.close();
});

const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown) =>
  t.app.inject({ method, url, headers, payload: payload as object, remoteAddress: randomIp() });
const code = (res: { json: () => { error?: { code?: string } } }) => res.json().error?.code;
const grantBody = (amount: number) => ({ amount, reason: 'security test', idempotencyKey: randomUUID() });

describe('Owner (UID 1002)', () => {
  it('holds the owner role and every permission, assigned on the server', async () => {
    const me = (await call('GET', '/api/admin/me', owner.headers)).json();
    expect(me.roles).toContain('owner');
    expect(me.permissions).toContain('system.settings');
    expect(me.grantableRoles).toEqual(['super_admin', 'admin', 'moderator', 'support']);
  });

  it('cannot be banned, demoted, deleted or duplicated through the API', async () => {
    expect(code(await call('POST', `/api/admin/users/${KEYO_OWNER_UID}/bans`, superAdmin.headers, { duration: 'permanent', reason: 'takeover' }))).toBe('protected_account');
    expect(code(await call('DELETE', `/api/admin/users/${KEYO_OWNER_UID}/roles/owner`, superAdmin.headers))).toBe('protected_account');
    expect(code(await call('DELETE', `/api/admin/users/${KEYO_OWNER_UID}/roles/owner`, owner.headers))).toBe('protected_account');
    expect(code(await call('POST', '/api/me/deletion', { authorization: `Bearer ${owner.token}` }, { password: TEST_PASSWORD, confirm: true }))).toBe('protected_account');
    expect(code(await call('POST', '/api/admin/accounts', owner.headers, { uid: KEYO_OWNER_UID, displayName: 'GM', password: 'Strong-pass-1', confirmPassword: 'Strong-pass-1' }))).toBe('uid_reserved');
  });

  it('the Owner role can be neither granted to anyone else nor moved', async () => {
    const victim = await register(t);
    expect(code(await call('POST', `/api/admin/users/${victim.user.uid}/roles`, owner.headers, { roleId: 'owner' }))).toBe('protected_account');
    expect(code(await call('POST', `/api/admin/users/${victim.user.uid}/roles`, superAdmin.headers, { roleId: 'owner' }))).toBe('protected_account');
  });

  it('is protected by the database even against direct SQL', async () => {
    await expect(t.db.execute(sql`DELETE FROM user_roles WHERE role_id = 'owner'`)).rejects.toThrow();
    await expect(t.db.execute(sql`UPDATE user_roles SET user_id = ${admin.user.id} WHERE role_id = 'owner'`)).rejects.toThrow();
    await expect(t.db.execute(sql`INSERT INTO user_roles (user_id, role_id) VALUES (${admin.user.id}, 'owner')`)).rejects.toThrow();
    await expect(t.db.execute(sql`UPDATE users SET status = 'deleted' WHERE uid = ${KEYO_OWNER_UID}`)).rejects.toThrow();
    await expect(t.db.execute(sql`UPDATE users SET uid = 5555 WHERE uid = ${KEYO_OWNER_UID}`)).rejects.toThrow();
    await expect(t.db.execute(sql`DELETE FROM users WHERE uid = ${KEYO_OWNER_UID}`)).rejects.toThrow();
    await expect(t.db.execute(sql`INSERT INTO bans (user_id, reason) VALUES (${owner.user.id}, 'x')`)).rejects.toThrow();
  });

  it('is never test data, so reset:test-data can never remove it', async () => {
    await expect(t.db.execute(sql`UPDATE users SET is_test = true WHERE uid = ${KEYO_OWNER_UID}`)).rejects.toThrow();
    const [row] = await t.db.execute<{ is_test: boolean }>(sql`SELECT is_test FROM users WHERE uid = ${KEYO_OWNER_UID}`);
    expect(row!.is_test).toBe(false);
    const plan = await planReset(t.db);
    expect(plan.keptAccounts).toBeGreaterThanOrEqual(2);
  });

  it('the server-shell owner bootstrap refuses to create a second UID 1002', async () => {
    await expect(createOwnerAccount(t.db, { username: 'gm_two', displayName: 'GM', email: 'gm2@example.test' }, { appUrl: 'http://x' })).rejects.toMatchObject({ code: 'uid_taken' });
  });

  it('a client cannot claim to be the Owner: rights follow the authenticated account only', async () => {
    const player = await register(t);
    const res = await call('GET', '/api/admin/overview', { authorization: `Bearer ${player.token}`, 'x-uid': String(KEYO_OWNER_UID) });
    expect(res.statusCode).toBe(403);
  });
});

describe('Keyo Support (UID 1000)', () => {
  it('cannot be banned, deleted, re-typed, flagged as test or have its UID changed', async () => {
    expect(code(await call('POST', `/api/admin/users/${KEYO_SUPPORT_UID}/bans`, owner.headers, { duration: 'permanent', reason: 'abuse' }))).toBe('protected_account');
    await expect(t.db.execute(sql`UPDATE users SET account_type = 'player' WHERE uid = ${KEYO_SUPPORT_UID}`)).rejects.toThrow();
    await expect(t.db.execute(sql`UPDATE users SET status = 'restricted' WHERE uid = ${KEYO_SUPPORT_UID}`)).rejects.toThrow();
    await expect(t.db.execute(sql`UPDATE users SET uid = 1001 WHERE uid = ${KEYO_SUPPORT_UID}`)).rejects.toThrow();
    await expect(t.db.execute(sql`DELETE FROM users WHERE uid = ${KEYO_SUPPORT_UID}`)).rejects.toThrow();
  });

  it('cannot receive staff roles (it is not a personal admin account)', async () => {
    expect(code(await call('POST', `/api/admin/users/${KEYO_SUPPORT_UID}/roles`, owner.headers, { roleId: 'support' }))).toBe('system_account');
  });
});

describe('role permissions', () => {
  it('Admin cannot add or remove Cxu, issue badges or assign special UIDs', async () => {
    const target = await register(t);
    expect(code(await call('POST', `/api/admin/users/${target.user.uid}/grant`, admin.headers, grantBody(100)))).toBe('forbidden');
    expect(code(await call('POST', `/api/admin/users/${target.user.uid}/badges`, admin.headers, { verified: true }))).toBe('forbidden');
    expect(code(await call('GET', '/api/admin/uids/special', admin.headers))).toBe('forbidden');
  });

  it('Moderator cannot touch resources, bans, audit or personal data', async () => {
    const target = await register(t);
    expect(code(await call('POST', `/api/admin/users/${target.user.uid}/grant`, moderator.headers, grantBody(100)))).toBe('forbidden');
    expect(code(await call('POST', `/api/admin/users/${target.user.uid}/badges`, moderator.headers, { partner: true }))).toBe('forbidden');
    expect(code(await call('POST', `/api/admin/users/${target.user.uid}/bans`, moderator.headers, { duration: 'permanent', reason: 'abuse' }))).toBe('forbidden');
    expect(code(await call('GET', '/api/admin/audit', moderator.headers))).toBe('forbidden');
    const detail = (await call('GET', `/api/admin/users/${target.user.uid}`, moderator.headers)).json();
    expect(detail.user.email).toBeNull();
    const search = (await call('GET', `/api/admin/users?q=${encodeURIComponent(target.user.email)}`, moderator.headers)).json();
    expect(search.users).toHaveLength(0);
  });

  it('Support cannot ban, grant or change roles', async () => {
    const target = await register(t);
    expect(code(await call('POST', `/api/admin/users/${target.user.uid}/bans`, support.headers, { duration: 'permanent', reason: 'abuse' }))).toBe('forbidden');
    expect(code(await call('POST', `/api/admin/users/${target.user.uid}/grant`, support.headers, grantBody(5)))).toBe('forbidden');
    expect(code(await call('POST', `/api/admin/users/${target.user.uid}/roles`, support.headers, { roleId: 'support' }))).toBe('forbidden');
  });

  it('players never reach admin routes', async () => {
    const player = await register(t);
    expect((await call('GET', '/api/admin/me', { authorization: `Bearer ${player.token}` })).statusCode).toBe(403);
  });
});

describe('privilege escalation', () => {
  it('nobody can grant roles to themselves', async () => {
    expect(code(await call('POST', `/api/admin/users/${admin.user.uid}/roles`, admin.headers, { roleId: 'super_admin' }))).toBe('forbidden');
    expect(code(await call('POST', `/api/admin/users/${superAdmin.user.uid}/roles`, superAdmin.headers, { roleId: 'admin' }))).toBe('forbidden');
  });

  it('roles can only be granted strictly below the actor rank', async () => {
    const p = await register(t);
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/roles`, superAdmin.headers, { roleId: 'super_admin' }))).toBe('forbidden');
    expect((await call('POST', `/api/admin/users/${p.user.uid}/roles`, superAdmin.headers, { roleId: 'moderator' })).statusCode).toBe(200);
    expect((await call('POST', `/api/admin/users/${p.user.uid}/roles`, owner.headers, { roleId: 'super_admin' })).statusCode).toBe(200);
  });

  it('nobody can change the roles of someone at or above their rank', async () => {
    const peer = await createStaff(t, 'super_admin');
    expect(code(await call('DELETE', `/api/admin/users/${peer.user.uid}/roles/super_admin`, superAdmin.headers))).toBe('forbidden');
    expect(code(await call('POST', `/api/admin/users/${superAdmin.user.uid}/roles`, admin.headers, { roleId: 'support' }))).toBe('forbidden');
    expect((await call('DELETE', `/api/admin/users/${peer.user.uid}/roles/super_admin`, owner.headers)).statusCode).toBe(200);
  });

  it('staff cannot ban or delete staff of equal or higher rank', async () => {
    const otherAdmin = await createStaff(t, 'admin');
    expect(code(await call('POST', `/api/admin/users/${otherAdmin.user.uid}/bans`, admin.headers, { duration: 'permanent', reason: 'abuse' }))).toBe('forbidden');
    expect(code(await call('POST', `/api/admin/users/${superAdmin.user.uid}/bans`, admin.headers, { duration: 'permanent', reason: 'abuse' }))).toBe('forbidden');
    expect(code(await call('POST', `/api/admin/users/${admin.user.uid}/bans`, admin.headers, { duration: 'permanent', reason: 'self' }))).toBe('forbidden');
  });

  it('a lower-ranked admin cannot lift a ban issued by a Super Admin', async () => {
    const p = await register(t);
    const ban = (await call('POST', `/api/admin/users/${p.user.uid}/bans`, superAdmin.headers, { duration: 'permanent', reason: 'fraud' })).json().ban;
    expect(code(await call('POST', `/api/admin/bans/${ban.id}/revoke`, admin.headers, { reason: 'please' }))).toBe('forbidden');
    expect((await call('POST', `/api/admin/bans/${ban.id}/revoke`, superAdmin.headers, { reason: 'appeal ok' })).statusCode).toBe(200);
  });

  it('revoking a role takes effect immediately and closes open sockets', async () => {
    const mod = await createStaff(t, 'moderator');
    const ws = await TestSocket.connect(t.port, mod.token);
    const closed = ws.waitClose();
    expect((await call('DELETE', `/api/admin/users/${mod.user.uid}/roles/moderator`, superAdmin.headers)).statusCode).toBe(200);
    expect(await closed).toBe(4001);
    expect((await call('GET', '/api/admin/me', { authorization: `Bearer ${mod.token}` })).statusCode).toBe(403);
  });
});

describe('re-authentication for sensitive actions', () => {
  it('is required for grants, role changes and special UIDs', async () => {
    const p = await register(t);
    const plain = { authorization: `Bearer ${owner.token}` };
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/grant`, plain, grantBody(10)))).toBe('reauth_required');
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/roles`, plain, { roleId: 'support' }))).toBe('reauth_required');
    expect(code(await call('POST', '/api/admin/accounts', plain, { uid: 321, displayName: 'X', password: 'Strong-pass-1', confirmPassword: 'Strong-pass-1' }))).toBe('reauth_required');
  });

  it('a step-up token belongs to one account and is not a session token', async () => {
    const p = await register(t);
    const stolen = superAdmin.headers['x-keyo-reauth']!;
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/grant`, { authorization: `Bearer ${owner.token}`, 'x-keyo-reauth': stolen }, grantBody(10)))).toBe('reauth_required');
    expect((await call('GET', '/api/me', { authorization: `Bearer ${stolen}` })).statusCode).toBe(401);
  });

  it('a wrong password is refused and audited', async () => {
    const res = await call('POST', '/api/auth/reauth', { authorization: `Bearer ${owner.token}` }, { password: 'wrong-pass-1' });
    expect(code(res)).toBe('invalid_credentials');
    const [row] = await t.db.execute<{ c: string }>(sql`SELECT count(*) AS c FROM audit_logs WHERE action = 'auth.reauth_failed'`);
    expect(Number(row!.c)).toBeGreaterThanOrEqual(1);
  });
});

describe('idempotent grants', () => {
  it('a replayed request is applied once; reusing a key for another request is refused', async () => {
    const p = await register(t);
    const body = grantBody(250);
    const first = await call('POST', `/api/admin/users/${p.user.uid}/grant`, owner.headers, body);
    const second = await call('POST', `/api/admin/users/${p.user.uid}/grant`, owner.headers, body);
    expect(first.json().replayed).toBe(false);
    expect(second.json()).toMatchObject({ replayed: true, balance: first.json().balance });
    const [row] = await t.db.execute<{ c: string }>(sql`SELECT count(*) AS c FROM ledger_entries WHERE user_id = ${p.user.id} AND reason = 'admin_adjust'`);
    expect(Number(row!.c)).toBe(1);
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/grant`, owner.headers, { ...body, amount: 999 }))).toBe('idempotency_conflict');
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/grant`, superAdmin.headers, body))).toBe('idempotency_conflict');
  });

  it('concurrent duplicates still apply once', async () => {
    const p = await register(t);
    const body = grantBody(40);
    const results = await Promise.all(Array.from({ length: 5 }, () => call('POST', `/api/admin/users/${p.user.uid}/grant`, owner.headers, body)));
    expect(results.every((r) => r.statusCode === 200 || code(r) === 'idempotency_conflict')).toBe(true);
    const [row] = await t.db.execute<{ c: string }>(sql`SELECT count(*) AS c FROM ledger_entries WHERE user_id = ${p.user.id} AND reason = 'admin_adjust'`);
    expect(Number(row!.c)).toBe(1);
  });

  it('a grant needs a reason', async () => {
    const p = await register(t);
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/grant`, owner.headers, { amount: 5, idempotencyKey: randomUUID() }))).toBe('bad_request');
  });
});

describe('audit integrity', () => {
  it('audit_logs cannot be edited, deleted or truncated', async () => {
    await expect(t.db.execute(sql`UPDATE audit_logs SET action = 'x'`)).rejects.toThrow();
    await expect(t.db.execute(sql`DELETE FROM audit_logs`)).rejects.toThrow();
    await expect(t.db.execute(sql`TRUNCATE audit_logs`)).rejects.toThrow();
  });

  it('records role changes with the actor', async () => {
    const [row] = await t.db.execute<{ c: string }>(sql`SELECT count(*) AS c FROM audit_logs WHERE action IN ('role.grant', 'role.revoke') AND actor_id IS NOT NULL`);
    expect(Number(row!.c)).toBeGreaterThan(0);
  });
});

describe('legacy ADMIN_USERNAMES', () => {
  it('no longer grants anything at login', async () => {
    const t2 = await startTestApp({ ADMIN_USERNAMES: 'boss' });
    try {
      const boss = await register(t2, 'boss');
      const login = await t2.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { login: String(boss.user.uid), password: TEST_PASSWORD },
      });
      expect(login.statusCode).toBe(200);
      expect(login.json().user.permissions).toEqual([]);
      expect((await t2.app.inject({ url: '/api/admin/overview', headers: { authorization: `Bearer ${boss.token}` } })).statusCode).toBe(403);
    } finally {
      await t2.app.close();
    }
  });
});
