import { accountNameProblem, PROTECTED_UIDS } from '@casino/shared';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { assertNameFree, nameColumns } from './accountName';
import { audit } from './audit';
import { isProtectedDisplayName } from './protectedNames';

/**
 * Accounts created before names were unified can still have a technical @username (player_…,
 * uid_…) next to the display name they chose. This plans — and only on --execute applies — the safe
 * part of the clean-up: an account whose display name is a valid, non-reserved and unique account
 * name gets that name as its @username too. Nobody's visible name changes. Accounts whose display
 * name cannot be an account name keep both names until they (or staff) rename; protected accounts
 * (Keyo Captain 1000, Owner 1002) are never changed automatically.
 */
type Row = { id: string; uid: number; username: string; display_name: string };
export type NameIssue = 'invalid' | 'reserved' | 'duplicate';

export interface NameSyncPlan {
  players: number;
  synced: number;
  unsynced: number;
  /** Will get @username = display name. */
  syncable: { uid: number; username: string; displayName: string }[];
  /** Must pick a new name (free rename / staff rename) before both can match. */
  needsChoice: { uid: number; username: string; displayName: string; issue: NameIssue }[];
  /** Protected accounts: listed, never changed by this tool. */
  protectedAccounts: { uid: number; username: string; displayName: string }[];
}

export async function planNameSync(db: Db): Promise<NameSyncPlan> {
  const all = await db.execute<Row & { synced: boolean }>(sql`
    SELECT id, uid::int AS uid, username, display_name, (username = display_name) AS synced
    FROM users WHERE account_type = 'player' AND status <> 'deleted' ORDER BY uid`);
  // Every name in use (case-insensitive) → how many accounts use it, as username or display name.
  const taken = new Map<string, Set<string>>();
  const note = (name: string, id: string) => taken.set(name.toLowerCase(), (taken.get(name.toLowerCase()) ?? new Set()).add(id));
  const everyone = await db.execute<{ id: string; username: string; display_name: string; status: string }>(sql`SELECT id, username, display_name, status FROM users`);
  for (const u of everyone) {
    note(u.username, u.id);
    if (u.status !== 'deleted') note(u.display_name, u.id);
  }
  const plan: NameSyncPlan = { players: all.length, synced: 0, unsynced: 0, syncable: [], needsChoice: [], protectedAccounts: [] };
  for (const r of all) {
    if (r.synced) {
      plan.synced++;
      continue;
    }
    plan.unsynced++;
    const entry = { uid: r.uid, username: r.username, displayName: r.display_name };
    if ((PROTECTED_UIDS as readonly number[]).includes(r.uid)) plan.protectedAccounts.push(entry);
    else if (accountNameProblem(r.display_name)) plan.needsChoice.push({ ...entry, issue: 'invalid' });
    else if (isProtectedDisplayName(r.display_name)) plan.needsChoice.push({ ...entry, issue: 'reserved' });
    else if ([...(taken.get(r.display_name.toLowerCase()) ?? [])].some((id) => id !== r.id)) plan.needsChoice.push({ ...entry, issue: 'duplicate' });
    else plan.syncable.push(entry);
  }
  return plan;
}

/**
 * Applies the plan's syncable part in one transaction (all or nothing). Each name is re-checked at
 * execution time; one that became taken in the meantime is skipped and reported. Audited per
 * account. Visible names, UIDs, sessions, wallets and everything else stay as they are.
 */
export async function executeNameSync(db: Db, operator: string): Promise<{ synced: number; skipped: { uid: number; reason: string }[] }> {
  const plan = await planNameSync(db);
  return db.transaction(async (tx) => {
    let synced = 0;
    const skipped: { uid: number; reason: string }[] = [];
    for (const e of plan.syncable) {
      const [row] = await tx.select().from(users).where(eq(users.uid, e.uid)).for('update');
      if (!row || row.displayName !== e.displayName || row.username !== e.username) {
        skipped.push({ uid: e.uid, reason: 'changed' });
        continue;
      }
      try {
        await assertNameFree(tx, e.displayName, row.id);
      } catch {
        skipped.push({ uid: e.uid, reason: 'taken' });
        continue;
      }
      await tx.update(users).set(nameColumns(e.displayName)).where(eq(users.id, row.id));
      await audit(tx, { action: 'account.name_sync', targetType: 'user', targetId: e.uid, details: { from: e.username, to: e.displayName, operator } });
      synced++;
    }
    return { synced, skipped };
  });
}
