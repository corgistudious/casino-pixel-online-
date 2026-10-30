import { randomUUID } from 'node:crypto';
import { ECONOMY, KEYO_SUPPORT_UID, PLAYER_UID_START } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { users } from '../src/db/schema';
import { banEnd, bootstrapSystemAccounts } from '../src/services/accounts';
import { codeIn, createOwner, createStaff, lastMail, randomIp, register, registerPending, startTestApp, TestSocket, TEST_PASSWORD, tokenIn, type TestApp } from './helpers';

let t: TestApp;
let admin: Record<string, string>;
beforeAll(async () => {
  t = await startTestApp();
  // The Owner (UID 1002) has every permission; sensitive routes also need the re-auth header it carries.
  admin = (await createOwner(t)).headers;
});
afterAll(async () => {
  await t.app.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
// Each request gets its own client address so the per-IP auth rate limit does not leak between tests.
const post = (url: string, payload: unknown, headers?: Record<string, string>) =>
  t.app.inject({ method: 'POST', url, payload: payload as object, headers, remoteAddress: randomIp() });
const auditCount = async (action: string, targetId?: string | number) => {
  const rows = await t.db.execute<{ n: string }>(
    targetId === undefined
      ? sql`SELECT count(*) AS n FROM audit_logs WHERE action = ${action}`
      : sql`SELECT count(*) AS n FROM audit_logs WHERE action = ${action} AND target_id = ${String(targetId)}`,
  );
  return Number(rows[0]!.n);
};

describe('UID allocation', () => {
  it('gives regular accounts increasing UIDs from 100000', async () => {
    const a = await registerPending(t);
    const b = await registerPending(t);
    expect(a.user.uid).toBeGreaterThanOrEqual(PLAYER_UID_START);
    expect(b.user.uid).toBeGreaterThan(a.user.uid);
  });

  it('never hands out the same UID under concurrent registration', async () => {
    const results = await Promise.all(Array.from({ length: 15 }, () => registerPending(t)));
    const uids = results.map((r) => r.user.uid);
    expect(new Set(uids).size).toBe(uids.length);
    expect(uids.every((u) => u >= PLAYER_UID_START)).toBe(true);
  });
});

describe('Keyo Support UID 1000', () => {
  it('exists once as an official system account', async () => {
    await bootstrapSystemAccounts(t.db); // second run must be a no-op
    const rows = await t.db.select().from(users).where(sql`${users.uid} = ${KEYO_SUPPORT_UID}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ displayName: 'Keyo Captain', accountType: 'system_support', isVerified: true, status: 'active' });
  });

  it('cannot be logged into, banned or granted as a custom UID', async () => {
    const login = await post('/api/auth/login', { login: 'keyo_support', password: '!disabled' });
    expect(login.statusCode).toBe(401);
    const ban = await post(`/api/admin/users/${KEYO_SUPPORT_UID}/bans`, { duration: 'permanent', reason: 'nope' }, admin);
    expect(ban.json().error.code).toBe('protected_account');
    const custom = await post('/api/admin/accounts', { uid: KEYO_SUPPORT_UID, displayName: 'Fake', password: 'Strong-pass-1', confirmPassword: 'Strong-pass-1' }, admin);
    expect(custom.json().error.code).toBe('uid_reserved');
  });

  it('reserves official display names', async () => {
    const res = await post('/api/auth/register', {
      displayName: 'Keyo Support',
      password: TEST_PASSWORD,
      confirmPassword: TEST_PASSWORD,
      acceptTerms: true,
    });

    expect(res.statusCode).not.toBe(200);
    expect(res.json().error.code).toBe('username_taken');
  });

});

describe('registration and email verification', () => {
  it('validates the form: terms, password confirmation and strength', async () => {
    const base = {
      displayName: 'FormCheck',
      email: 'form@example.test',
      password: TEST_PASSWORD,
      confirmPassword: TEST_PASSWORD,
      acceptTerms: true,
    };

    const invalidCases = [
      { acceptTerms: false },
      { confirmPassword: 'different1' },
      { password: 'short1', confirmPassword: 'short1' },
      { password: 'lettersonly', confirmPassword: 'lettersonly' },
      { email: 'nope' },
    ];

    for (const bad of invalidCases) {
      const res = await post('/api/auth/register', {
        ...base,
        ...bad,
      });

      expect(res.statusCode, JSON.stringify(bad)).toBe(400);
    }
  });

  it('rejects duplicate emails', async () => {
    const a = await registerPending(t);
    const res = await post('/api/auth/register', {
      username: `dup_${randomUUID().slice(0, 6)}`,
      displayName: 'D',
      email: a.user.email.toUpperCase(),
      password: TEST_PASSWORD,
      confirmPassword: TEST_PASSWORD,
      acceptTerms: true,
    });
    expect(res.json().error.code).toBe('email_taken');
  });

  it('activates new accounts immediately and grants the welcome reward once', async () => {
    const { token, user } = await registerPending(t);

    expect(user.status).toBe('active');
    expect(user.balance).toBe(ECONOMY.welcome.silver);

    const me = await t.app.inject({
      url: '/api/me',
      headers: auth(token),
    });

    expect(me.statusCode).toBe(200);

    const ledger = await t.db.execute<{ n: string }>(sql`
      SELECT count(*) AS n
      FROM ledger_entries
      WHERE user_id = ${user.id}
        AND reason = 'welcome'
    `);

    expect(Number(ledger[0]!.n)).toBe(1);
  });

  it('verifies by code, activates the account and grants the starter reward once', async () => {
    const { token, user } = await registerPending(t);
    const mail = await lastMail(t, user.email);
    expect(mail!.template).toBe('verify_email');
    const res = await post('/api/auth/verify-email', { code: codeIn(mail!.body_text) }, auth(token));
    expect(res.json().user).toMatchObject({ status: 'active', emailVerified: true, balance: ECONOMY.welcome.silver });
    expect((await lastMail(t, user.email))!.template).toBe('email_verified');
    // A second verification path cannot pay the starter reward twice.
    const again = await post('/api/auth/verify-email', { code: codeIn(mail!.body_text) }, auth(token));
    expect(again.json().error.code).toBe('invalid_token');
    const ledger = await t.db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM ledger_entries WHERE user_id = ${user.id} AND reason = 'welcome'`);
    expect(Number(ledger[0]!.n)).toBe(1);
  });

  it('verifies by link token without a session, and the link works only once', async () => {
    const { token, user } = await registerPending(t);
    const link = tokenIn((await lastMail(t, user.email))!.body_text);
    expect((await post('/api/auth/verify-email', { token: link })).statusCode).toBe(200);
    expect((await post('/api/auth/verify-email', { token: link })).json().error.code).toBe('invalid_token');
    const me = await t.app.inject({ url: '/api/me', headers: auth(token) });
    expect(me.json().user.status).toBe('active');
  });

  it('stores only hashes of tokens and codes', async () => {
    const { user } = await registerPending(t);
    const body = (await lastMail(t, user.email))!.body_text;
    const rows = await t.db.execute<{ token_hash: string; code_hash: string }>(sql`SELECT token_hash, code_hash FROM email_tokens WHERE user_id = ${user.id}`);
    expect(rows[0]!.token_hash).not.toBe(tokenIn(body));
    expect(rows[0]!.code_hash).not.toContain(codeIn(body));
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('locks a code after 5 wrong attempts', async () => {
    const { token, user } = await registerPending(t);
    const real = codeIn((await lastMail(t, user.email))!.body_text);
    const wrong = real === '000000' ? '111111' : '000000';
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await post('/api/auth/verify-email', { code: wrong }, auth(token))).json().error.code);
    expect(codes.slice(0, 4).every((c) => c === 'invalid_token')).toBe(true);
    expect(codes[4]).toBe('too_many_attempts');
    expect((await post('/api/auth/verify-email', { code: real }, auth(token))).statusCode).not.toBe(200);
  });

  it('limits resending (cooldown)', async () => {
    const { token } = await registerPending(t);
    const res = await post('/api/auth/resend-verification', {}, auth(token));
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('too_soon');
  });
});

describe('login security', () => {
  it('logs in with username or email', async () => {
    const { user } = await register(t);
    expect((await post('/api/auth/login', { login: user.username, password: TEST_PASSWORD })).statusCode).toBe(200);
    expect((await post('/api/auth/login', { login: user.email.toUpperCase(), password: TEST_PASSWORD })).statusCode).toBe(200);
  });

  it('locks the account for 15 minutes after 5 failed attempts', async () => {
    const { user } = await register(t);
    for (let i = 0; i < 5; i++) await post('/api/auth/login', { login: user.username, password: 'wrong-pass1' });
    const locked = await post('/api/auth/login', { login: user.username, password: TEST_PASSWORD });
    expect(locked.json().error.code).toBe('invalid_credentials');
    expect(await auditCount('account.locked', user.uid)).toBe(1);
  });

  it('upgrades legacy scrypt hashes to Argon2id on login', async () => {
    const { user } = await register(t);
    const legacy = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$';
    // Build a real legacy hash with the old algorithm.
    const { scryptSync } = await import('node:crypto');
    const salt = Buffer.alloc(16, 7);
    const key = scryptSync('legacyPass1', salt, 64, { N: 16384, r: 8, p: 1 });
    void legacy;
    await t.db.execute(sql`UPDATE users SET password_hash = ${`scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`} WHERE id = ${user.id}`);
    expect((await post('/api/auth/login', { login: user.username, password: 'legacyPass1' })).statusCode).toBe(200);
    const [row] = await t.db.execute<{ password_hash: string }>(sql`SELECT password_hash FROM users WHERE id = ${user.id}`);
    expect(row!.password_hash.startsWith('$argon2id$')).toBe(true);
  });
});

describe('password reset', () => {
  it('answers identically for unknown emails and sends nothing', async () => {
    const res = await post('/api/auth/forgot-password', { email: 'nobody@example.test' });
    expect(res.json()).toEqual({ ok: true });
    expect(await lastMail(t, 'nobody@example.test')).toBeUndefined();
  });

  it('resets with the emailed code, revokes sessions and alerts the user', async () => {
    const { token, user } = await register(t);
    await post('/api/auth/forgot-password', { email: user.email });
    const mail = await lastMail(t, user.email);
    expect(mail!.template).toBe('reset_password');
    const res = await post('/api/auth/reset-password', { email: user.email, code: codeIn(mail!.body_text), password: 'newPassw0rd', confirmPassword: 'newPassw0rd' });
    expect(res.statusCode).toBe(200);
    expect((await t.app.inject({ url: '/api/me', headers: auth(token) })).statusCode).toBe(401);
    expect((await post('/api/auth/login', { login: user.username, password: 'newPassw0rd' })).statusCode).toBe(200);
    expect((await post('/api/auth/login', { login: user.username, password: TEST_PASSWORD })).statusCode).toBe(401);
    expect((await lastMail(t, user.email))!.template).toBe('password_changed');
  });

  it('accepts the reset link once', async () => {
    const { user } = await register(t);
    await post('/api/auth/forgot-password', { email: user.email });
    const link = tokenIn((await lastMail(t, user.email))!.body_text);
    const body = { token: link, password: 'linkPassw0rd', confirmPassword: 'linkPassw0rd' };
    expect((await post('/api/auth/reset-password', body)).statusCode).toBe(200);
    expect((await post('/api/auth/reset-password', body)).json().error.code).toBe('invalid_token');
  });
});

describe('custom UID accounts', () => {
  const PW = 'Special-pass-42';
  const body = (uid: number, extra: Record<string, unknown> = {}) => ({ uid, displayName: 'VIP Khách', password: PW, confirmPassword: PW, ...extra });

  it('creates an active player from UID, display name and password; it signs in by UID at once, no email, no test flag, no role', async () => {
    const uid = 4242;
    const res = await post('/api/admin/accounts', body(uid), admin);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toEqual({ uid, displayName: 'VIP Khách', status: 'active', replayed: false });
    expect(res.body).not.toContain(PW);
    const [row] = await t.db.select().from(users).where(sql`${users.uid} = ${uid}`);
    expect(row).toMatchObject({ username: `uid_${uid}`, email: null, emailVerifiedAt: null, isTest: false, status: 'active', accountType: 'player' });
    expect(row!.passwordHash).not.toContain(PW);
    const roles = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM user_roles WHERE user_id = ${row!.id}`);
    expect(roles[0]!.n).toBe(0);
    // Wallet + fairness seed exist; no starter reward (special-account policy) and nothing else credited.
    const [w] = await t.db.execute<{ balance: string; gold: string; seeds: number }>(sql`
      SELECT w.balance, w.gold, (SELECT count(*)::int FROM fair_seeds s WHERE s.user_id = w.user_id) AS seeds FROM wallets w WHERE w.user_id = ${row!.id}`);
    expect(w).toMatchObject({ balance: '0', gold: '0' });
    expect(w!.seeds).toBeGreaterThan(0);
    // Audit: who, which UID, when — never the password.
    const audits = await t.db.execute<{ details: unknown; actor_id: string | null }>(sql`SELECT details, actor_id FROM audit_logs WHERE action = 'uid.custom_create' AND target_id = ${String(uid)}`);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actor_id).not.toBeNull();
    expect(JSON.stringify(audits)).not.toContain(PW);
    // No mail is sent on creation.
    const mails = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM email_outbox o JOIN users u ON u.email_lower = lower(o.to_address) WHERE u.uid = ${uid}`);
    expect(mails[0]!.n).toBe(0);

    const login = await post('/api/auth/login', { login: String(uid), password: PW });
    expect(login.statusCode).toBe(200);
    expect(login.json().user).toMatchObject({ uid, status: 'active', email: null, emailVerified: false, permissions: [] });
    // Plays straight away (no verification gate): the daily check-in works like for any player.
    expect((await post('/api/me/checkin', {}, auth(login.json().token))).statusCode).not.toBe(403);
  });

  it('links and verifies an email after sign-in; the email only works for sign-in once verified', async () => {
    const uid = 4343;
    await post('/api/admin/accounts', body(uid), admin);
    const token = (await post('/api/auth/login', { login: String(uid), password: PW })).json().token as string;
    const email = `c${randomUUID().slice(0, 6)}@example.test`;
    expect((await post('/api/auth/link-email', { email, password: 'wrong-pass-1' }, auth(token))).json().error.code).toBe('invalid_credentials');
    const linked = await post('/api/auth/link-email', { email, password: PW }, auth(token));
    expect(linked.json().user).toMatchObject({ email, emailVerified: false });
    // Unverified email cannot be used to sign in.
    expect((await post('/api/auth/login', { login: email, password: PW })).statusCode).toBe(401);
    // Wrong codes count towards the attempt limit.
    expect((await post('/api/auth/verify-email', { code: '000000' }, auth(token))).json().error.code).toMatch(/invalid_token|too_many_attempts/);
    const code = codeIn((await lastMail(t, email))!.body_text);
    const verified = await post('/api/auth/verify-email', { code }, auth(token));
    expect(verified.json().user).toMatchObject({ emailVerified: true });
    expect((await post('/api/auth/login', { login: email, password: PW })).statusCode).toBe(200);
    expect((await post('/api/auth/login', { login: String(uid), password: PW })).statusCode).toBe(200);
    // Still no starter reward for special accounts.
    expect(Number((await t.db.execute<{ b: string }>(sql`SELECT balance AS b FROM wallets w JOIN users u ON u.id = w.user_id WHERE u.uid = ${uid}`))[0]!.b)).toBe(0);
    // An email used by another account cannot be linked.
    await post('/api/admin/accounts', body(4344), admin);
    const other = (await post('/api/auth/login', { login: '4344', password: PW })).json().token as string;
    expect((await post('/api/auth/link-email', { email, password: PW }, auth(other))).json().error.code).toBe('email_taken');
  });

  it('refuses taken, reserved and out-of-range UIDs, mismatched or weak passwords, missing permission', async () => {
    await post('/api/admin/accounts', body(4545), admin);
    expect((await post('/api/admin/accounts', body(4545, { displayName: 'Other' }), admin)).json().error.code).toBe('uid_taken');
    for (const uid of [1000, 1002]) expect((await post('/api/admin/accounts', body(uid), admin)).json().error.code).toBe('uid_reserved');
    for (const uid of [0, 100_000, 1.5]) expect((await post('/api/admin/accounts', body(uid), admin)).statusCode).toBe(400);
    expect((await post('/api/admin/accounts', body(4546, { confirmPassword: 'Different-pass-1' }), admin)).statusCode).toBe(400);
    for (const weak of ['short1', 'onlyletters', '12345678']) expect((await post('/api/admin/accounts', body(4547, { password: weak, confirmPassword: weak }), admin)).statusCode).toBe(400);
    expect((await post('/api/admin/accounts', body(4548, { displayName: 'Keyo Captain' }), admin)).json().error.code).toBe('username_taken');
    // Old fields are not part of the contract any more and change nothing.
    const legacy = await post('/api/admin/accounts', body(4549, { username: 'chosen', email: 'x@example.test', isTest: true }), admin);
    expect(legacy.statusCode).toBe(200);
    const [row] = await t.db.select().from(users).where(sql`${users.uid} = 4549`);
    expect(row).toMatchObject({ username: 'uid_4549', email: null, isTest: false });
    const player = await register(t);
    expect((await post('/api/admin/accounts', body(777), auth(player.token))).json().error.code).toBe('forbidden');
    const [n] = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM users WHERE uid IN (4546, 4547, 4548, 777)`);
    expect(n!.n).toBe(0);
  });

  it('two simultaneous requests for one UID create one account; a retry with the same key returns it', async () => {
    const results = await Promise.all([post('/api/admin/accounts', body(4646), admin), post('/api/admin/accounts', body(4646), admin)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const key = randomUUID();
    const first = await post('/api/admin/accounts', body(4747, { idempotencyKey: key }), admin);
    const again = await post('/api/admin/accounts', body(4747, { idempotencyKey: key }), admin);
    expect(first.json()).toMatchObject({ uid: 4747, replayed: false });
    expect(again.json()).toMatchObject({ uid: 4747, replayed: true });
    const [n] = await t.db.execute<{ n: number; w: number }>(sql`SELECT count(*)::int AS n, (SELECT count(*)::int FROM wallets w JOIN users u ON u.id = w.user_id WHERE u.uid IN (4646, 4747)) AS w FROM users WHERE uid IN (4646, 4747)`);
    expect(n).toEqual({ n: 2, w: 2 });
    expect((await post('/api/admin/accounts', body(4747, { idempotencyKey: key, displayName: 'Changed' }), admin)).json().error.code).toBe('idempotency_conflict');
  });

  it('normal sign-up is unchanged', async () => {
    // Regular sign-up still sends its verification email and stays unverified until the code is entered.
    const pending = await registerPending(t);
    expect(pending.user.email).toBeTruthy();
    expect((await lastMail(t, pending.user.email))!.template).toBe('verify_email');
    const [row] = await t.db.select().from(users).where(sql`${users.uid} = ${pending.user.uid}`);
    expect(row!.emailVerifiedAt).toBeNull();
  });
});

describe('bans', () => {
  it('computes day, month, year and permanent durations', () => {
    const start = new Date('2026-01-31T00:00:00Z');
    expect(banEnd(start, { unit: 'day', amount: 3 })!.toISOString()).toBe('2026-02-03T00:00:00.000Z');
    expect(banEnd(start, { unit: 'year', amount: 1 })!.toISOString()).toBe('2027-01-31T00:00:00.000Z');
    expect(banEnd(start, 'permanent')).toBeNull();
  });

  it('blocks login with the end date, expires automatically, keeps balances, and can be revoked', async () => {
    const { token, user } = await register(t);
    const res = await post(`/api/admin/users/${user.uid}/bans`, { duration: { unit: 'day', amount: 7 }, reason: 'cheating', evidence: 'round 123' }, admin);
    const banId = res.json().ban.id as string;
    const login = await post('/api/auth/login', { login: user.username, password: TEST_PASSWORD });
    expect(login.json().error.code).toBe('banned');
    expect(new Date(login.json().error.endsAt).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    // Expire it by moving the end into the past.
    await t.db.execute(sql`UPDATE bans SET ends_at = now() - interval '1 second' WHERE id = ${banId}`);
    expect((await t.app.inject({ url: '/api/me', headers: auth(token) })).json().user.balance).toBe(ECONOMY.welcome.silver);
    // Re-ban permanently, then revoke.
    const perm = await post(`/api/admin/users/${user.uid}/bans`, { duration: 'permanent', reason: 'repeat' }, admin);
    expect((await t.app.inject({ url: '/api/me', headers: auth(token) })).statusCode).toBe(403);
    await post(`/api/admin/bans/${perm.json().ban.id}/revoke`, { reason: 'appeal accepted' }, admin);
    expect((await t.app.inject({ url: '/api/me', headers: auth(token) })).statusCode).toBe(200);
    expect(await auditCount('ban.create', user.uid)).toBe(2);
    expect(await auditCount('ban.revoke')).toBeGreaterThanOrEqual(1);
  });

  it('can extend a ban and disconnects the player immediately', async () => {
    const { token, user } = await register(t);
    const s = await TestSocket.connect(t.port, token);
    const closed = s.waitClose();
    const res = await post(`/api/admin/users/${user.uid}/bans`, { duration: { unit: 'day', amount: 1 }, reason: 'spam' }, admin);
    expect(await closed).toBe(4001);
    const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const ext = await t.app.inject({ method: 'PATCH', url: `/api/admin/bans/${res.json().ban.id}`, payload: { endsAt: until }, headers: admin });
    expect(new Date(ext.json().ban.endsAt).toISOString()).toBe(until);
  });
});

describe('account deletion', () => {
  it('re-authenticates, then an approved request anonymises the account and keeps the ledger', async () => {
    const { token, user } = await register(t);
    const wrong = await post('/api/me/deletion', { password: 'wrongPass1', confirm: true }, auth(token));
    expect(wrong.json().error.code).toBe('invalid_credentials');
    const req = await post('/api/me/deletion', { password: TEST_PASSWORD, reason: 'leaving', confirm: true }, auth(token));
    expect(req.json().request.status).toBe('pending');
    const dup = await post('/api/me/deletion', { password: TEST_PASSWORD, confirm: true }, auth(token));
    expect(dup.json().error.code).toBe('deletion_pending');

    const list = await t.app.inject({ url: '/api/admin/deletion-requests', headers: admin });
    const mine = (list.json().requests as { id: string; uid: number }[]).find((r) => r.uid === user.uid)!;
    await post(`/api/admin/deletion-requests/${mine.id}/decide`, { approve: true, note: 'verified owner' }, admin);

    const [row] = await t.db.select().from(users).where(sql`${users.id} = ${user.id}`);
    expect(row).toMatchObject({ status: 'deleted', email: null, displayName: 'Deleted player', uid: user.uid });
    expect(row!.username).toBe(`deleted_${user.uid}`);
    expect((await t.app.inject({ url: '/api/me', headers: auth(token) })).statusCode).toBe(401);
    const ledger = await t.db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM ledger_entries WHERE user_id = ${user.id}`);
    expect(Number(ledger[0]!.n)).toBeGreaterThan(0);
    // The UID is not reused by later registrations.
    const next = await registerPending(t);
    expect(next.user.uid).not.toBe(user.uid);
  });

  it('can be cancelled while pending', async () => {
    const { token } = await register(t);
    await post('/api/me/deletion', { password: TEST_PASSWORD, confirm: true }, auth(token));
    expect((await t.app.inject({ method: 'DELETE', url: '/api/me/deletion', headers: auth(token) })).statusCode).toBe(200);
    expect((await t.app.inject({ url: '/api/me/deletion', headers: auth(token) })).json().request).toBeNull();
  });
});

describe('RBAC and audit', () => {
  it('an admin can ban players but cannot grant currency or manage roles; a moderator cannot ban', async () => {
    const adminStaff = await createStaff(t, 'admin');
    const mod = await createStaff(t, 'moderator');
    const target = await register(t);
    const h = adminStaff.headers;
    expect((await post(`/api/admin/users/${target.user.uid}/bans`, { duration: { unit: 'day', amount: 1 }, reason: 'test ban' }, h)).statusCode).toBe(200);
    expect((await post(`/api/admin/users/${target.user.uid}/grant`, { amount: 100, reason: 'nope', idempotencyKey: randomUUID() }, h)).json().error.code).toBe('forbidden');
    expect((await post(`/api/admin/users/${target.user.uid}/roles`, { roleId: 'support' }, h)).json().error.code).toBe('forbidden');
    expect((await post(`/api/admin/users/${target.user.uid}/bans`, { duration: 'permanent', reason: 'mod ban' }, mod.headers)).json().error.code).toBe('forbidden');
  });

  it('admin grants go through the ledger and are audited', async () => {
    const { user } = await register(t);
    const res = await post(`/api/admin/users/${user.uid}/grant`, { amount: 500, reason: 'event prize', idempotencyKey: randomUUID() }, admin);
    expect(res.json().balance).toBe(ECONOMY.welcome.silver + 500);
    const ledger = await t.db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM ledger_entries WHERE user_id = ${user.id} AND reason = 'admin_adjust'`);
    expect(Number(ledger[0]!.n)).toBe(1);
    expect(await auditCount('economy.grant', user.uid)).toBe(1);
  });

  it('special-UID registry reports the next player UID', async () => {
    const res = await t.app.inject({ url: '/api/admin/uids/special', headers: admin });
    expect(res.json().nextPlayerUid).toBeGreaterThan(PLAYER_UID_START);
    expect((res.json().special as { uid: number }[]).some((u) => u.uid === KEYO_SUPPORT_UID)).toBe(true);
  });
});

// Keep the helper import used even if a test above changes.
void hashPassword;
