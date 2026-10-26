import { HIGH_TRUST_ROLES } from '@casino/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { hashPassword } from '../auth/password';
import type { Db, DbOrTx } from '../db/client';
import { emailTokens, users } from '../db/schema';
import { fail } from '../errors';
import { audit } from './audit';
import { assertOutranks, userRoleIds } from './rbac';
import type { UserRow } from './users';

/**
 * Account-takeover-grade staff actions: setting another account's password and removing its email.
 *
 * Checked here, not only by the route guard:
 * - the actor holds a built-in Owner or Super Admin role (a custom role can never qualify);
 * - the target is a regular player account, never Keyo Support (UID 1000) or the Owner (UID 1002);
 * - the actor outranks the target, so a Super Admin cannot act on another Super Admin;
 * - the actor's own account goes through its own settings, not the admin tools.
 */
async function loadTarget(tx: DbOrTx, actorId: string, uid: number): Promise<UserRow> {
  const roles = await userRoleIds(tx, actorId);
  if (!roles.some((r) => (HIGH_TRUST_ROLES as readonly string[]).includes(r))) throw fail('forbidden');
  const [target] = await tx.select().from(users).where(eq(users.uid, uid)).for('update');
  if (!target || target.status === 'deleted') throw fail('not_found');
  if (target.id === actorId) throw fail('self_action_forbidden');
  await assertOutranks(tx, actorId, target);
  if (target.accountType !== 'player') throw fail('system_account');
  return target;
}

/** "ab***@g***.com": enough for staff to recognise the address without exposing it in full. */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local.slice(0, Math.min(2, local.length))}***@${host.slice(0, 1)}***${tld}`;
}

/** Invalidates every open verification / reset / activation token of the account. */
async function burnEmailTokens(tx: DbOrTx, userId: string) {
  await tx.update(emailTokens).set({ usedAt: new Date() }).where(and(eq(emailTokens.userId, userId), isNull(emailTokens.usedAt)));
}

/**
 * Sets a new password. Every session and token of the target is revoked (token version bump),
 * open reset links stop working, and the failed-login lock is cleared. The password itself is
 * never logged or returned.
 */
export async function adminResetPassword(db: Db, actorId: string, uid: number, password: string, reason: string, ip?: string) {
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const target = await loadTarget(tx, actorId, uid);
    await tx
      .update(users)
      .set({ passwordHash, tokenVersion: sql`${users.tokenVersion} + 1`, failedLogins: 0, lockedUntil: null })
      .where(eq(users.id, target.id));
    await burnEmailTokens(tx, target.id);
    await audit(tx, { actorId, action: 'user.password_reset', targetType: 'user', targetId: uid, details: { reason }, ip });
    return { userId: target.id };
  });
}

/**
 * Removes the linked email. Account, wallet, items and progress are untouched. Open email tokens
 * are burnt, so an old verification or reset link cannot be used afterwards; linking a new email
 * goes through the normal flow, which needs the new address verified.
 */
export async function adminUnlinkEmail(db: Db, actorId: string, uid: number, reason: string, ip?: string) {
  return db.transaction(async (tx) => {
    const target = await loadTarget(tx, actorId, uid);
    if (!target.email) throw fail('email_not_linked');
    // Admin-created accounts activate through their email; without one they could never activate.
    if (target.status === 'pending_activation') throw fail('forbidden');
    await tx.update(users).set({ email: null, emailLower: null, emailVerifiedAt: null }).where(eq(users.id, target.id));
    await burnEmailTokens(tx, target.id);
    await audit(tx, {
      actorId,
      action: 'user.email_unlink',
      targetType: 'user',
      targetId: uid,
      details: { reason, email: maskEmail(target.email), wasVerified: !!target.emailVerifiedAt },
      ip,
    });
    return { userId: target.id };
  });
}
