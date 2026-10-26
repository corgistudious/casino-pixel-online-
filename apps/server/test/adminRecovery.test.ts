import { KEYO_OWNER_UID, KEYO_SUPPORT_UID } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOwner, createStaff, randomIp, register, registerPending, startTestApp, TEST_PASSWORD, type TestApp } from './helpers';

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

const call = (method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown) =>
  t.app.inject({ method, url, headers, payload: payload as object, remoteAddress: randomIp() });
const code = (res: { json: () => { error?: { code?: string } } }) => res.json().error?.code;
const NEW_PASSWORD = 'NewPassw0rd!';
const login = (username: string, password: string) =>
  t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: username, password }, remoteAddress: randomIp() });

describe('admin password reset', () => {
  it('Owner and Super Admin set a new password; old sessions and reset links die; nothing secret is logged', async () => {
    for (const actor of [owner, superAdmin]) {
      const p = await register(t);
      // An open reset link from before the change must not survive it.
      await t.app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email: p.user.email }, remoteAddress: randomIp() });
      const res = await call('POST', `/api/admin/users/${p.user.uid}/password`, actor.headers, { password: NEW_PASSWORD, reason: 'account recovery ticket' });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain(NEW_PASSWORD);
      expect((await call('GET', '/api/me', { authorization: `Bearer ${p.token}` })).statusCode).toBe(401);
      expect((await login(p.user.username, TEST_PASSWORD)).statusCode).toBe(401);
      expect((await login(p.user.username, NEW_PASSWORD)).statusCode).toBe(200);
      const [open] = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM email_tokens WHERE user_id = ${p.user.id} AND used_at IS NULL`);
      expect(open!.n).toBe(0);
      const [log] = await t.db.execute<{ actor_id: string; details: unknown; created_at: string }>(
        sql`SELECT actor_id, details, created_at FROM audit_logs WHERE action = 'user.password_reset' AND target_id = ${String(p.user.uid)}`,
      );
      expect(log!.actor_id).toBe(actor.user.id);
      expect(log!.details).toEqual({ reason: 'account recovery ticket' });
    }
    const [leak] = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM audit_logs WHERE details::text LIKE ${`%${NEW_PASSWORD}%`}`);
    expect(leak!.n).toBe(0);
  });

  it('is refused to Admin, Moderator, Support and players, even with a valid re-auth', async () => {
    const p = await register(t);
    for (const actor of [admin, moderator, support]) {
      expect(code(await call('POST', `/api/admin/users/${p.user.uid}/password`, actor.headers, { password: NEW_PASSWORD, reason: 'try it' }))).toBe('forbidden');
    }
    const player = await register(t);
    expect((await call('POST', `/api/admin/users/${p.user.uid}/password`, { authorization: `Bearer ${player.token}` }, { password: NEW_PASSWORD, reason: 'try it' })).statusCode).toBe(403);
  });

  it('a permission handed to a non-built-in role is still refused (role checked, not just permission)', async () => {
    const custom = await createStaff(t, 'support');
    await t.db.execute(sql`INSERT INTO role_permissions (role_id, permission) VALUES ('support', 'users.password_reset') ON CONFLICT DO NOTHING`);
    try {
      const p = await register(t);
      expect(code(await call('POST', `/api/admin/users/${p.user.uid}/password`, custom.headers, { password: NEW_PASSWORD, reason: 'escalation' }))).toBe('forbidden');
    } finally {
      await t.db.execute(sql`DELETE FROM role_permissions WHERE role_id = 'support' AND permission = 'users.password_reset'`);
    }
  });

  it('needs a fresh password re-confirmation', async () => {
    const p = await register(t);
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/password`, { authorization: `Bearer ${owner.token}` }, { password: NEW_PASSWORD, reason: 'no reauth' }))).toBe('reauth_required');
  });

  it('protects Keyo Support, the Owner, peers and the actor itself', async () => {
    expect(code(await call('POST', `/api/admin/users/${KEYO_OWNER_UID}/password`, superAdmin.headers, { password: NEW_PASSWORD, reason: 'takeover' }))).toBe('protected_account');
    expect(code(await call('POST', `/api/admin/users/${KEYO_SUPPORT_UID}/password`, owner.headers, { password: NEW_PASSWORD, reason: 'system' }))).toBe('protected_account');
    expect(code(await call('POST', `/api/admin/users/${KEYO_OWNER_UID}/password`, owner.headers, { password: NEW_PASSWORD, reason: 'self' }))).toBe('self_action_forbidden');
    expect(code(await call('POST', `/api/admin/users/${superAdmin.user.uid}/password`, superAdmin.headers, { password: NEW_PASSWORD, reason: 'self' }))).toBe('self_action_forbidden');
    const peer = await createStaff(t, 'super_admin');
    expect(code(await call('POST', `/api/admin/users/${peer.user.uid}/password`, superAdmin.headers, { password: NEW_PASSWORD, reason: 'peer' }))).toBe('forbidden');
    // The Owner outranks a Super Admin.
    expect((await call('POST', `/api/admin/users/${peer.user.uid}/password`, owner.headers, { password: NEW_PASSWORD, reason: 'recovery' })).statusCode).toBe(200);
  });

  it('rejects weak passwords and missing reasons', async () => {
    const p = await register(t);
    expect((await call('POST', `/api/admin/users/${p.user.uid}/password`, owner.headers, { password: 'short', reason: 'weak' })).statusCode).toBe(400);
    expect((await call('POST', `/api/admin/users/${p.user.uid}/password`, owner.headers, { password: NEW_PASSWORD })).statusCode).toBe(400);
  });
});

describe('admin email unlink', () => {
  it('removes the email only: wallet, level and account stay; old tokens die; relinking needs verification', async () => {
    const p = await register(t);
    const [before] = await t.db.execute<{ balance: string }>(sql`SELECT balance FROM wallets WHERE user_id = ${p.user.id}`);
    await t.app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email: p.user.email }, remoteAddress: randomIp() });
    const detail = (await call('GET', `/api/admin/users/${p.user.uid}`, superAdmin.headers)).json();
    expect(detail.user.emailMasked).toMatch(/^.{1,2}\*\*\*@.\*\*\*/);
    expect((await call('POST', `/api/admin/users/${p.user.uid}/email/unlink`, superAdmin.headers, { reason: 'lost access to inbox' })).statusCode).toBe(200);
    const [row] = await t.db.execute<{ email: string | null; email_verified_at: string | null; status: string }>(sql`SELECT email, email_verified_at, status FROM users WHERE id = ${p.user.id}`);
    expect(row).toEqual({ email: null, email_verified_at: null, status: 'active' });
    const [after] = await t.db.execute<{ balance: string }>(sql`SELECT balance FROM wallets WHERE user_id = ${p.user.id}`);
    expect(after!.balance).toBe(before!.balance);
    const [open] = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM email_tokens WHERE user_id = ${p.user.id} AND used_at IS NULL`);
    expect(open!.n).toBe(0);
    // The session still works (only the email went away) and a new email starts unverified.
    // (The normal 60 s resend cooldown applies; step past it.)
    await t.db.execute(sql`UPDATE email_tokens SET created_at = created_at - interval '2 minutes' WHERE user_id = ${p.user.id}`);
    const relink = await call('POST', '/api/auth/link-email', { authorization: `Bearer ${p.token}` }, { email: `new_${p.user.username}@example.test`, password: TEST_PASSWORD });
    expect(relink.statusCode).toBe(200);
    expect(relink.json().user.emailVerified).toBeFalsy();
    const [log] = await t.db.execute<{ details: { email: string; reason: string } }>(sql`SELECT details FROM audit_logs WHERE action = 'user.email_unlink' AND target_id = ${String(p.user.uid)}`);
    expect(log!.details.reason).toBe('lost access to inbox');
    expect(log!.details.email).not.toBe(p.user.email);
  });

  it('refuses accounts without email, Admin and below, the Owner, Keyo Support and the actor', async () => {
    const p = await register(t);
    for (const actor of [admin, moderator, support]) {
      expect(code(await call('POST', `/api/admin/users/${p.user.uid}/email/unlink`, actor.headers, { reason: 'try it' }))).toBe('forbidden');
    }
    expect(code(await call('POST', `/api/admin/users/${KEYO_OWNER_UID}/email/unlink`, superAdmin.headers, { reason: 'takeover' }))).toBe('protected_account');
    expect(code(await call('POST', `/api/admin/users/${KEYO_SUPPORT_UID}/email/unlink`, owner.headers, { reason: 'system' }))).toBe('protected_account');
    expect(code(await call('POST', `/api/admin/users/${superAdmin.user.uid}/email/unlink`, superAdmin.headers, { reason: 'self' }))).toBe('self_action_forbidden');
    await call('POST', `/api/admin/users/${p.user.uid}/email/unlink`, owner.headers, { reason: 'first' });
    expect(code(await call('POST', `/api/admin/users/${p.user.uid}/email/unlink`, owner.headers, { reason: 'second' }))).toBe('email_not_linked');
    const pending = await registerPending(t);
    expect((await call('POST', `/api/admin/users/${pending.user.uid}/email/unlink`, owner.headers, { reason: 'unverified signup' })).statusCode).toBe(200);
  });
});
