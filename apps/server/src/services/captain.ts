import { createHash, randomBytes } from 'node:crypto';
import { KEYO_CAPTAIN_UID } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../auth/password';
import type { Db } from '../db/client';
import { fail } from '../errors';
import { audit } from './audit';
import { enqueueMail } from '../mail/mailer';
import { userRoleIds } from './rbac';
import type { UserRow } from './users';

/**
 * Keyo Captain (UID 1000) sign-in set-up. The account never has a default password: until one is
 * set, its hash is unusable and sign-in always fails. A signed-in Owner (other than Keyo Captain,
 * re-authenticated by the route) creates a one-time link valid for 30 minutes; whoever opens it
 * chooses the password. This works only while no password is set yet; afterwards the password can
 * only be changed by Keyo Captain itself (current password required). Only the SHA-256 of a link
 * is stored and the link itself is never written to logs or the audit trail.
 */
export const SETUP_TTL_MS = 30 * 60 * 1000;
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
/** A stored hash that can never match (no password set). */
export const hasUsablePassword = (hash: string) => !hash.startsWith('!');

async function captainRow(db: Db) {
  const [r] = await db.execute<{ id: string; password_hash: string; status: string }>(sql`SELECT id, password_hash, status FROM users WHERE uid = ${KEYO_CAPTAIN_UID}`);
  if (!r || r.status === 'deleted') throw fail('not_found');
  return r;
}

export async function captainStatus(db: Db) {
  const r = await captainRow(db);
  const [owner] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM user_roles WHERE user_id = ${r.id}::uuid AND role_id = 'owner'`);
  return { passwordSet: hasUsablePassword(r.password_hash), owner: owner!.n > 0 };
}

export async function issueCaptainSetupLink(db: Db, actorId: string, ip?: string): Promise<{ token: string; expiresAt: string }> {
  const roles = await userRoleIds(db, actorId);
  if (!roles.includes('owner')) throw fail('forbidden');
  return db.transaction(async (tx) => {
    const [c] = await tx.execute<{ id: string; password_hash: string }>(sql`SELECT id, password_hash FROM users WHERE uid = ${KEYO_CAPTAIN_UID} AND status <> 'deleted' FOR UPDATE`);
    if (!c) throw fail('not_found');
    if (c.id === actorId) throw fail('self_action_forbidden');
    // Only a first-time set-up: an existing password is never replaced by another Owner.
    if (hasUsablePassword(c.password_hash)) throw fail('protected_account');
    await tx.execute(sql`UPDATE account_setup_tokens SET used_at = now() WHERE user_id = ${c.id}::uuid AND used_at IS NULL`);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SETUP_TTL_MS);
    await tx.execute(sql`
      INSERT INTO account_setup_tokens (user_id, token_hash, created_by, expires_at) VALUES (${c.id}::uuid, ${sha(token)}, ${actorId}::uuid, ${expiresAt.toISOString()}::timestamptz)`);
    await audit(tx, { actorId, action: 'captain.setup_link_issued', targetType: 'user', targetId: KEYO_CAPTAIN_UID, details: { expiresAt: expiresAt.toISOString() }, ip });
    return { token, expiresAt: expiresAt.toISOString() };
  });
}

export async function completeCaptainSetup(db: Db, token: string, password: string, ip?: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const [t] = await tx.execute<{ id: string; user_id: string }>(sql`
      SELECT t.id, t.user_id FROM account_setup_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ${sha(token)} AND t.used_at IS NULL AND t.expires_at > now() AND u.uid = ${KEYO_CAPTAIN_UID}
      FOR UPDATE OF t`);
    if (!t) throw fail('invalid_token');
    const [c] = await tx.execute<{ password_hash: string; token_version: number }>(sql`SELECT password_hash, token_version FROM users WHERE id = ${t.user_id}::uuid FOR UPDATE`);
    if (!c || hasUsablePassword(c.password_hash)) throw fail('invalid_token');
    await tx.execute(sql`
      UPDATE users SET password_hash = ${passwordHash}, token_version = token_version + 1, failed_logins = 0, locked_until = NULL WHERE id = ${t.user_id}::uuid`);
    await tx.execute(sql`UPDATE account_setup_tokens SET used_at = now() WHERE id = ${t.id}::uuid`);
    await audit(tx, { action: 'captain.password_set', targetType: 'user', targetId: KEYO_CAPTAIN_UID, ip });
  });
}

/**
 * Any signed-in account changes its own password with the current one. Other sessions are signed
 * out (token version bump); the caller gets a fresh session token. Nobody can change another
 * account's password here.
 */
export async function changeOwnPassword(db: Db, user: UserRow, current: string, next: string, ip?: string): Promise<UserRow> {
  if (!hasUsablePassword(user.passwordHash) || !(await verifyPassword(current, user.passwordHash))) throw fail('invalid_credentials');
  if (current === next) throw fail('bad_request', 'new password must differ');
  const passwordHash = await hashPassword(next);
  return db.transaction(async (tx) => {
    const [u] = await tx.execute<{ token_version: number }>(sql`SELECT token_version FROM users WHERE id = ${user.id}::uuid FOR UPDATE`);
    if (!u) throw fail('unauthorized');
    await tx.execute(sql`UPDATE users SET password_hash = ${passwordHash}, token_version = token_version + 1, failed_logins = 0, locked_until = NULL WHERE id = ${user.id}::uuid`);
    if (user.email && user.emailVerifiedAt) await enqueueMail(tx, user.email, 'password_changed', user.locale, { name: user.displayName });
    await audit(tx, { actorId: user.id, action: 'account.password_changed', targetType: 'user', targetId: user.uid, ip });
    return { ...user, passwordHash, tokenVersion: user.tokenVersion + 1, failedLogins: 0, lockedUntil: null };
  });
}
