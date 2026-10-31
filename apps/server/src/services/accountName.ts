import { accountNameProblem } from '@casino/shared';
import { eq, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { users } from '../db/schema';
import { fail } from '../errors';
import { audit } from './audit';
import { loadTarget } from './adminAccounts';
import { isProtectedDisplayName } from './protectedNames';

/**
 * Account names: one value is both the display name and the username (shown as @name). Every
 * path that creates or renames a player goes through here, and the database trigger
 * users_name_sync (0036) refuses any name write that would leave the two apart.
 */

/** Trims and validates a requested name: rule first (name_invalid), then official names (name_reserved). */
export function assertAccountName(raw: string): string {
  if (accountNameProblem(raw)) throw fail('name_invalid');
  const name = raw.trim();
  if (isProtectedDisplayName(name)) throw fail('name_reserved');
  return name;
}

/**
 * The name is free when no other account uses it as username, and no other live account still
 * shows it as display name (older accounts created before names were unified). Case-insensitive.
 * The unique index on username_lower settles two concurrent requests for the same name.
 */
export async function assertNameFree(tx: DbOrTx, name: string, exceptUserId?: string): Promise<void> {
  const lower = name.toLowerCase();
  const rows = await tx.execute<{ id: string }>(sql`
    SELECT id FROM users
    WHERE (username_lower = ${lower} OR (lower(display_name) = ${lower} AND status <> 'deleted'))
      ${exceptUserId ? sql`AND id <> ${exceptUserId}::uuid` : sql``}
    LIMIT 1`);
  if (rows.length) throw fail('username_taken');
}

/** Maps a unique-index race on the username to the same error as the pre-check. */
export function isUsernameClash(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 4 && e; i++) {
    const c = (e as { constraint_name?: string; constraint?: string }).constraint_name ?? (e as { constraint?: string }).constraint;
    if (c === 'users_username_lower_idx') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** The three columns written together by every rename. */
export const nameColumns = (name: string) => ({ username: name, usernameLower: name.toLowerCase(), displayName: name });

/**
 * Staff rename (Owner / Super Admin, password re-confirmed by the route). Same checks as the other
 * account-takeover-grade tools: never the actor's own account, never an account the actor does not
 * outrank (so the Owner is protected), never Keyo Support or a deleted account. No rename card or
 * cooldown is involved; the old and new names are audited.
 */
export async function adminRenamePlayer(db: Db, actorId: string, uid: number, raw: string, reason: string, ip?: string) {
  const name = assertAccountName(raw);
  try {
    return await db.transaction(async (tx) => {
      const target = await loadTarget(tx, actorId, uid);
      if (target.username === name && target.displayName === name) throw fail('bad_request');
      await assertNameFree(tx, name, target.id);
      const [row] = await tx.update(users).set(nameColumns(name)).where(eq(users.id, target.id)).returning();
      await audit(tx, {
        actorId,
        action: 'user.rename',
        targetType: 'user',
        targetId: uid,
        details: { from: { username: target.username, displayName: target.displayName }, to: name, reason },
        ip,
      });
      return row!;
    });
  } catch (err) {
    if (isUsernameClash(err)) throw fail('username_taken');
    throw err;
  }
}
