import { randomUUID } from 'node:crypto';
import { GIFT_PRICE_PROPOSAL, KEYO_OWNER_UID, KEYO_SUPPORT_UID } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uncoveredForeignKeys } from '../src/maintenance/testData';
import { bootstrapOwner } from '../src/services/rbac';
import { createOwner, createStaff, randomIp, reauthHeaders, register, startTestApp, TEST_PASSWORD, type TestApp } from './helpers';

let t: TestApp;
let owner: Awaited<ReturnType<typeof createOwner>>;
beforeAll(async () => {
  t = await startTestApp();
  owner = await createOwner(t);
});
afterAll(async () => {
  await t.app.close();
});

type Headers = Record<string, string>;
const call = (method: 'GET' | 'POST' | 'DELETE', url: string, headers: Headers = {}, payload?: object) =>
  t.app.inject({ method, url, headers, payload, remoteAddress: randomIp() });
const code = (res: { json: () => { error?: { code: string } } }) => res.json().error?.code;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const rows = <T>(q: ReturnType<typeof sql>) => t.db.execute(q) as unknown as Promise<T[]>;
const ownerUids = async () => (await rows<{ uid: string }>(sql`SELECT u.uid FROM user_roles r JOIN users u ON u.id = r.user_id WHERE r.role_id = 'owner' ORDER BY u.uid`)).map((r) => Number(r.uid));
const login = (loginName: string, password: string) => call('POST', '/api/auth/login', {}, { login: loginName, password });
/** Every refusal an Owner target can produce (the acting Owner on itself gets self_action_forbidden). */
const REFUSED = ['protected_account', 'self_action_forbidden', 'forbidden', 'system_account'];
const CAPTAIN_PASSWORD = `Cap-${randomUUID()}`;

describe('dual Owner', () => {
  it('UID 1000 and UID 1002 are the only Owners; bootstrap is idempotent and leaves other staff alone', async () => {
    const superAdmin = await createStaff(t, 'super_admin');
    await bootstrapOwner(t.db);
    await bootstrapOwner(t.db);
    expect(await ownerUids()).toEqual([KEYO_SUPPORT_UID, KEYO_OWNER_UID]);
    const roles = await rows<{ role_id: string }>(sql`SELECT role_id FROM user_roles WHERE user_id = ${superAdmin.user.id}::uuid`);
    expect(roles.map((r) => r.role_id)).toEqual(['super_admin']);
    const [captain] = await rows<{ account_type: string; display_name: string; status: string }>(sql`SELECT account_type, display_name, status FROM users WHERE uid = ${KEYO_SUPPORT_UID}`);
    expect(captain).toEqual({ account_type: 'system_support', display_name: 'Keyo Captain', status: 'active' });
  });

  it('no API or direct write can create a third Owner or remove one', async () => {
    const p = await register(t);
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/roles`, owner.headers, { roleId: 'owner' }))).toBe('protected_account');
    await expect(t.db.execute(sql`INSERT INTO user_roles (user_id, role_id) VALUES (${p.user.id}::uuid, 'owner')`)).rejects.toThrow();
    await expect(t.db.execute(sql`DELETE FROM user_roles WHERE role_id = 'owner'`)).rejects.toThrow();
    for (const uid of [KEYO_SUPPORT_UID, KEYO_OWNER_UID]) {
      expect(code(await call('DELETE', `/api/admin/users/${uid}/roles/owner`, owner.headers))).toBe('protected_account');
    }
    expect(await ownerUids()).toEqual([KEYO_SUPPORT_UID, KEYO_OWNER_UID]);
  });

  it('neither another Owner nor a Super Admin can ban, reset, unlink, demote, grant or adjust an Owner', async () => {
    const superAdmin = await createStaff(t, 'super_admin');
    for (const actor of [owner.headers, superAdmin.headers]) {
      for (const uid of [KEYO_SUPPORT_UID, KEYO_OWNER_UID]) {
        expect(REFUSED).toContain(code(await call('POST', `/api/admin/users/${uid}/bans`, actor, { duration: 'permanent', reason: 'try it' })));
        expect(REFUSED).toContain(code(await call('POST', `/api/admin/users/${uid}/password`, actor, { password: 'Another-pass-123', reason: 'try it' })));
        expect(REFUSED).toContain(code(await call('POST', `/api/admin/users/${uid}/email/unlink`, actor, { reason: 'try it' })));
        expect(REFUSED).toContain(code(await call('POST', `/api/admin/users/${uid}/roles`, actor, { roleId: 'moderator' })));
        expect(REFUSED).toContain(
          code(await call('POST', `/api/admin/users/${uid}/grant`, actor, { amount: 1_000, currency: 'silver', reason: 'try it', idempotencyKey: randomUUID() })),
        );
        expect(REFUSED).toContain(
          code(await call('POST', `/api/admin/users/${uid}/progression`, actor, { expDelta: 1_000, reason: 'try it', idempotencyKey: randomUUID() })),
        );
      }
      expect(REFUSED).toContain(code(await call('POST', `/api/admin/users/${KEYO_SUPPORT_UID}/badges`, actor, { partner: true })));
    }
    // Super Admin cannot touch the Owner's VIP or Charm either.
    expect(code(await call('POST', `/api/admin/vip/players/${KEYO_OWNER_UID}`, superAdmin.headers, { action: 'exp_add', amount: 10, reason: 'try it', idempotencyKey: randomUUID() }))).toBe('protected_account');
    const bans = await rows<{ n: number }>(sql`SELECT count(*)::int AS n FROM bans b JOIN users u ON u.id = b.user_id WHERE u.uid IN (${KEYO_SUPPORT_UID}, ${KEYO_OWNER_UID})`);
    expect(bans[0]!.n).toBe(0);
  });
});

describe('Keyo Captain sign-in', () => {
  it('has no usable password until an Owner issues a one-time link; login by UID is refused meanwhile', async () => {
    expect(code(await login(String(KEYO_SUPPORT_UID), '!disabled'))).toBe('invalid_credentials');
    expect(code(await login('keyo_support', '!disabled'))).toBe('invalid_credentials');
    expect((await call('GET', '/api/admin/captain', bearer(owner.token))).json()).toEqual({ passwordSet: false, owner: true });
  });

  it('only a re-authenticated Owner can issue the link; it is one-time, hashed, audited without the token', async () => {
    const superAdmin = await createStaff(t, 'super_admin');
    const player = await register(t);
    expect(code(await call('POST', '/api/admin/captain/setup-link', superAdmin.headers))).toBe('forbidden');
    expect(code(await call('POST', '/api/admin/captain/setup-link', bearer(player.token)))).toBe('forbidden');
    expect(code(await call('POST', '/api/admin/captain/setup-link', bearer(owner.token)))).toBe('reauth_required');

    const first = await call('POST', '/api/admin/captain/setup-link', owner.headers);
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    const old = first.json().token as string;
    // A new link invalidates the previous one.
    const second = (await call('POST', '/api/admin/captain/setup-link', await reauthHeaders(t, owner.token))).json();
    const token = second.token as string;
    expect(new Date(second.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(30 * 60 * 1000 + 1000);
    expect(code(await call('POST', '/api/auth/captain-setup', {}, { token: old, password: CAPTAIN_PASSWORD, confirmPassword: CAPTAIN_PASSWORD }))).toBe('invalid_token');

    const stored = await rows<{ token_hash: string }>(sql`SELECT token_hash FROM account_setup_tokens`);
    expect(stored.every((r) => r.token_hash !== token && r.token_hash.length === 64)).toBe(true);
    const audits = await rows<{ details: unknown }>(sql`SELECT details FROM audit_logs WHERE action = 'captain.setup_link_issued'`);
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits)).not.toContain(token);

    // Mismatched confirmation is rejected before anything happens.
    expect((await call('POST', '/api/auth/captain-setup', {}, { token, password: CAPTAIN_PASSWORD, confirmPassword: 'different-123' })).statusCode).toBe(400);
    expect((await call('POST', '/api/auth/captain-setup', {}, { token, password: CAPTAIN_PASSWORD, confirmPassword: CAPTAIN_PASSWORD })).statusCode).toBe(200);
    // Used once only.
    expect(code(await call('POST', '/api/auth/captain-setup', {}, { token, password: 'Second-try-123', confirmPassword: 'Second-try-123' }))).toBe('invalid_token');
    expect((await call('GET', '/api/admin/captain', bearer(owner.token))).json().passwordSet).toBe(true);
    // Once a password exists no Owner can issue another link.
    expect(code(await call('POST', '/api/admin/captain/setup-link', await reauthHeaders(t, owner.token)))).toBe('protected_account');
    const log = JSON.stringify(await rows(sql`SELECT action, details FROM audit_logs WHERE action LIKE 'captain.%'`));
    expect(log).not.toContain(CAPTAIN_PASSWORD);
  });

  it('expired links are refused', async () => {
    const [captain] = await rows<{ id: string }>(sql`SELECT id FROM users WHERE uid = ${KEYO_SUPPORT_UID}`);
    const token = `expired-${randomUUID()}`;
    const { createHash } = await import('node:crypto');
    await t.db.execute(sql`INSERT INTO account_setup_tokens (user_id, token_hash, created_by, expires_at)
      VALUES (${captain!.id}::uuid, ${createHash('sha256').update(token).digest('hex')}, ${owner.user.id}::uuid, now() - interval '1 minute')`);
    expect(code(await call('POST', '/api/auth/captain-setup', {}, { token, password: 'Whatever-123', confirmPassword: 'Whatever-123' }))).toBe('invalid_token');
  });

  it('then signs in by UID with its own password, keeps Owner rights, changes its password and is still locked out by brute force', async () => {
    const res = await login(String(KEYO_SUPPORT_UID), CAPTAIN_PASSWORD);
    expect(res.statusCode).toBe(200);
    const token = res.json().token as string;
    expect(res.json().user).toMatchObject({ uid: KEYO_SUPPORT_UID, displayName: 'Keyo Captain' });
    const me = (await call('GET', '/api/admin/me', bearer(token))).json();
    expect(me.roles).toContain('owner');
    // Same economy as everyone: a wallet, no free money.
    expect((await call('GET', '/api/me', bearer(token))).statusCode).toBe(200);
    // Keyo Captain cannot issue a link for itself.
    expect(['forbidden', 'self_action_forbidden']).toContain(code(await call('POST', '/api/admin/captain/setup-link', await reauthHeaders(t, token, CAPTAIN_PASSWORD))));
    // Keyo Captain cannot demote or reset UID 1002 either.
    const captainHeaders = await reauthHeaders(t, token, CAPTAIN_PASSWORD);
    expect(code(await call('DELETE', `/api/admin/users/${KEYO_OWNER_UID}/roles/owner`, captainHeaders))).toBe('protected_account');
    expect(code(await call('POST', `/api/admin/users/${KEYO_OWNER_UID}/password`, captainHeaders, { password: 'Another-pass-123', reason: 'try it' }))).toBe('protected_account');
    expect(code(await call('POST', `/api/admin/users/${KEYO_OWNER_UID}/bans`, captainHeaders, { duration: 'permanent', reason: 'try it' }))).toBe('protected_account');

    // Change password: wrong current refused; success signs out the old token and returns a new one.
    expect(code(await call('POST', '/api/me/password', bearer(token), { currentPassword: 'wrong-one', password: 'Brand-new-123', confirmPassword: 'Brand-new-123' }))).toBe('invalid_credentials');
    const changed = await call('POST', '/api/me/password', bearer(token), { currentPassword: CAPTAIN_PASSWORD, password: 'Brand-new-123', confirmPassword: 'Brand-new-123' });
    expect(changed.statusCode).toBe(200);
    expect((await call('GET', '/api/me', bearer(token))).statusCode).toBe(401);
    expect((await call('GET', '/api/me', bearer(changed.json().token))).statusCode).toBe(200);
    expect(code(await login(String(KEYO_SUPPORT_UID), CAPTAIN_PASSWORD))).toBe('invalid_credentials');
    expect((await login(String(KEYO_SUPPORT_UID), 'Brand-new-123')).statusCode).toBe(200);

    // "Sign out everywhere" ends every session.
    const session = (await login(String(KEYO_SUPPORT_UID), 'Brand-new-123')).json().token as string;
    expect((await call('POST', '/api/auth/logout-all', bearer(session))).statusCode).toBe(200);
    expect((await call('GET', '/api/me', bearer(session))).statusCode).toBe(401);

    // Brute force: five wrong passwords lock the account even for the right one.
    for (let i = 0; i < 5; i++) await login(String(KEYO_SUPPORT_UID), `wrong-${i}`);
    expect(code(await login(String(KEYO_SUPPORT_UID), 'Brand-new-123'))).toBe('invalid_credentials');
    await t.db.execute(sql`UPDATE users SET locked_until = NULL, failed_logins = 0 WHERE uid = ${KEYO_SUPPORT_UID}`);
  });

  it('cannot send normal direct messages or friend requests', async () => {
    const res = await login(String(KEYO_SUPPORT_UID), 'Brand-new-123');
    if (res.statusCode !== 200) throw new Error(res.body);
    const token = res.json().token as string;
    const p = await register(t);
    expect(code(await call('POST', `/api/chat/dm/${p.user.uid}`, bearer(token), { body: 'hello' }))).toBe('support_only');
    expect(code(await call('POST', '/api/friends/request', bearer(token), { uid: p.user.uid }))).toBe('official_account');
  });

  it('any account changing its own password needs the current one; other players are unaffected', async () => {
    const p = await register(t);
    expect(code(await call('POST', '/api/me/password', bearer(p.token), { currentPassword: TEST_PASSWORD, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD }))).toBe('bad_request');
    const ok = await call('POST', '/api/me/password', bearer(p.token), { currentPassword: TEST_PASSWORD, password: 'Player-new-123', confirmPassword: 'Player-new-123' });
    expect(ok.statusCode).toBe(200);
    expect((await login(p.user.username, 'Player-new-123')).statusCode).toBe(200);
    const audit = await rows<{ n: number }>(sql`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'account.password_changed' AND target_id = ${String(p.user.uid)}`);
    expect(audit[0]!.n).toBe(1);
  });
});

describe('Gift Shop to Keyo Captain', () => {
  it('debits once and adds Charm once, even when retried', async () => {
    const rose = GIFT_PRICE_PROPOSAL.find((g) => g.id === 'rose')!;
    const put = await t.app.inject({ method: 'PUT', url: '/api/admin/gifts/rose', headers: owner.headers, payload: { ...rose, iconAsset: null, startsAt: null, endsAt: null, onSale: true }, remoteAddress: randomIp() });
    expect(put.statusCode).toBe(200);
    const p = await register(t);
    await t.db.execute(sql`UPDATE users SET created_at = now() - interval '5 days' WHERE id = ${p.user.id}::uuid`);
    const [captain] = await rows<{ id: string }>(sql`SELECT id FROM users WHERE uid = ${KEYO_SUPPORT_UID}`);
    const charm = async () => Number((await rows<{ c: string }>(sql`SELECT coalesce((SELECT total FROM charm_points WHERE user_id = ${captain!.id}::uuid), 0) AS c`))[0]!.c);
    const before = await charm();
    const balance = async () => Number((await rows<{ b: string }>(sql`SELECT balance AS b FROM wallets WHERE user_id = ${p.user.id}::uuid`))[0]!.b);
    const start = await balance();
    const body = { id: randomUUID(), uid: KEYO_SUPPORT_UID, giftId: 'rose', expectedPrice: 500 };
    const first = await call('POST', '/api/gifts/send', bearer(p.token), body);
    if (first.statusCode !== 200) throw new Error(first.body);
    const retry = await call('POST', '/api/gifts/send', bearer(p.token), body);
    expect(retry.json().replayed).toBe(true);
    expect(await balance()).toBe(start - 500);
    expect((await charm()) - before).toBe(5);
  });
});

describe('support tickets', () => {
  it('a retried create with the same requestId makes one ticket; another player cannot read it', async () => {
    const [a, b] = [await register(t), await register(t)];
    const body = { category: 'account', subject: 'Không đăng nhập được', message: 'Tôi không đăng nhập được từ hôm qua.', requestId: randomUUID() };
    const [x, y] = await Promise.all([call('POST', '/api/support/tickets', bearer(a.token), body), call('POST', '/api/support/tickets', bearer(a.token), body)]);
    expect(x.statusCode).toBe(200);
    expect(y.statusCode).toBe(200);
    expect(x.json().id).toBe(y.json().id);
    const n = await rows<{ n: number }>(sql`SELECT count(*)::int AS n FROM support_tickets WHERE user_id = ${a.user.id}::uuid`);
    expect(n[0]!.n).toBe(1);
    expect((await call('GET', `/api/support/tickets/${x.json().id}`, bearer(b.token))).statusCode).toBe(404);
  });
});

describe('maintenance', () => {
  it('reset:test-data covers every foreign key to users, the new setup tokens included', async () => {
    expect(await uncoveredForeignKeys(t.db)).toEqual([]);
  });
});
