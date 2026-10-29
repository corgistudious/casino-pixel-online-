import { DEFAULT_ROLES, isOwnerUid, KEYO_OWNER_UID, OWNER_UIDS, PROTECTED_UIDS, roleRank, topRank, type Permission, type RoleId } from '@casino/shared';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { rolePermissions, roles, userRoles, users } from '../db/schema';
import { fail } from '../errors';
import { audit } from './audit';
import type { UserRow } from './users';

/**
 * Makes the built-in roles match the code exactly (names, permissions). Built-in roles are
 * code-defined, so a permission removed here is removed from the database too. Custom roles
 * are left alone. Idempotent; runs at every start.
 */
export async function bootstrapRoles(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [id, role] of Object.entries(DEFAULT_ROLES)) {
      await tx
        .insert(roles)
        .values({ id, name: role.name, description: role.description, system: true })
        .onConflictDoUpdate({ target: roles.id, set: { name: role.name, description: role.description, system: true } });
      await tx.delete(rolePermissions).where(and(eq(rolePermissions.roleId, id), notInArray(rolePermissions.permission, [...role.permissions])));
      await tx
        .insert(rolePermissions)
        .values(role.permissions.map((permission) => ({ roleId: id, permission })))
        .onConflictDoNothing();
    }
  });
}

/**
 * Gives the Owner role to UID 1000 (Keyo Captain) and UID 1002 (Keyo GM) when those accounts exist.
 * Idempotent; the database lets only these two UIDs hold the role and never lets it be removed.
 * No other account is ever made Owner here.
 */
export async function bootstrapOwner(db: Db): Promise<void> {
  for (const uid of OWNER_UIDS) {
    const [owner] = await db
      .select({ id: users.id, status: users.status, accountType: users.accountType, uid: users.uid })
      .from(users)
      .where(eq(users.uid, uid));
    if (!owner || owner.status === 'deleted') continue;
    // UID 1000 is the official system account; UID 1002 must be a regular player account.
    if (uid === KEYO_OWNER_UID ? owner.accountType !== 'player' : owner.accountType !== 'system_support' && owner.accountType !== 'player') continue;
    const existing = await db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(and(eq(userRoles.userId, owner.id), eq(userRoles.roleId, 'owner')))
      .limit(1);
    if (existing.length > 0) continue;
    // Do not bypass database Owner protection if the role is missing.
    const inserted = await db.insert(userRoles).values({ userId: owner.id, roleId: 'owner' }).onConflictDoNothing().returning();
    if (inserted.length) await audit(db, { action: 'system.owner_role_assigned', targetType: 'user', targetId: uid });
  }
}

export async function userPermissions(db: DbOrTx, userId: string): Promise<string[]> {
  const rows = await db.execute<{ permission: string }>(sql`
    SELECT DISTINCT rp.permission FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = ${userId}
    ORDER BY rp.permission
  `);
  return rows.map((r) => r.permission);
}

export async function userRoleIds(db: DbOrTx, userId: string): Promise<string[]> {
  const rows = await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.roleId).sort((a, b) => roleRank(b) - roleRank(a));
}

export async function requirePermission(db: DbOrTx, userId: string, permission: Permission): Promise<void> {
  const perms = await userPermissions(db, userId);
  if (!perms.includes(permission)) throw fail('forbidden');
}

/** Low-level insert used by bootstraps and data fixes; staff actions go through grantStaffRole. */
export async function grantRole(db: DbOrTx, userId: string, roleId: string, grantedBy: string | null): Promise<void> {
  const existing = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
    .limit(1);

  if (existing.length > 0) return;

  await db.insert(userRoles).values({ userId, roleId, grantedBy }).onConflictDoNothing();
}

export async function rankOf(db: DbOrTx, userId: string): Promise<number> {
  return topRank(await userRoleIds(db, userId));
}

export function isProtected(user: Pick<UserRow, 'uid'>): boolean {
  return PROTECTED_UIDS.includes(Number(user.uid));
}

/**
 * The actor may act on the target account only when it outranks it. Protected accounts
 * (Keyo Support, Owner) are never valid targets for restrictive actions.
 */
export async function assertOutranks(db: DbOrTx, actorId: string, target: Pick<UserRow, 'id' | 'uid'>): Promise<void> {
  if (isProtected(target)) throw fail('protected_account');
  if (target.id === actorId) throw fail('forbidden');
  const [actorRank, targetRank] = await Promise.all([rankOf(db, actorId), rankOf(db, target.id)]);
  if (targetRank >= actorRank) throw fail('forbidden');
}

/** Roles the actor may hand out: built-in staff roles strictly below its own rank (never Owner). */
export function grantableRoles(actorRank: number): RoleId[] {
  return (Object.keys(DEFAULT_ROLES) as RoleId[]).filter((r) => r !== 'owner' && roleRank(r) < actorRank);
}

async function loadTarget(db: DbOrTx, uid: number): Promise<UserRow> {
  const [target] = await db.select().from(users).where(eq(users.uid, uid));
  if (!target) throw fail('not_found');
  return target;
}

export async function grantStaffRole(db: Db, actorId: string, uid: number, roleId: string, ip?: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    const target = await loadTarget(tx, uid);
    if (target.accountType !== 'player' || target.status === 'deleted') throw fail('system_account');
    if (roleId === 'owner') throw fail('protected_account');
    const [role] = await tx.select().from(roles).where(eq(roles.id, roleId));
    if (!role) throw fail('not_found');
    const actorRank = await rankOf(tx, actorId);
    if (target.id === actorId || roleRank(roleId) >= actorRank) throw fail('forbidden');
    // Changing the roles of someone at or above your rank is not allowed (Owner is above everyone).
    if (isOwnerUid(target.uid) || (await rankOf(tx, target.id)) >= actorRank) throw fail('forbidden');
    await tx.insert(userRoles).values({ userId: target.id, roleId, grantedBy: actorId }).onConflictDoNothing();
    await audit(tx, { actorId, action: 'role.grant', targetType: 'user', targetId: uid, details: { roleId }, ip });
    return userRoleIds(tx, target.id);
  });
}

export async function revokeStaffRole(db: Db, actorId: string, uid: number, roleId: string, ip?: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    const target = await loadTarget(tx, uid);
    if (roleId === 'owner' || isOwnerUid(target.uid)) throw fail('protected_account');
    const actorRank = await rankOf(tx, actorId);
    if (target.id === actorId || roleRank(roleId) >= actorRank || (await rankOf(tx, target.id)) >= actorRank) throw fail('forbidden');
    if (roleId === 'super_admin') {
      // Keep the game administrable: never remove the last Super Admin when there is no Owner.
      // Serialise concurrent revocations so two of them cannot both pass the check.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('keyo:revoke_super_admin'))`);
      const [counts] = await tx.execute<{ supers: string; owners: string }>(sql`
        SELECT count(*) FILTER (WHERE role_id = 'super_admin') AS supers, count(*) FILTER (WHERE role_id = 'owner') AS owners
        FROM user_roles WHERE role_id IN ('super_admin', 'owner')`);
      if (Number(counts!.owners) === 0 && Number(counts!.supers) <= 1) throw fail('last_super_admin');
    }
    const removed = await tx
      .delete(userRoles)
      .where(and(eq(userRoles.userId, target.id), eq(userRoles.roleId, roleId)))
      .returning();
    if (!removed.length) throw fail('not_found');
    await audit(tx, { actorId, action: 'role.revoke', targetType: 'user', targetId: uid, details: { roleId }, ip });
    return userRoleIds(tx, target.id);
  });
}

/** Staff members (anyone holding a role), highest rank first. */
export async function listStaff(db: DbOrTx) {
  const rows = await db
    .select({ uid: users.uid, username: users.username, displayName: users.displayName, roleId: userRoles.roleId, grantedAt: userRoles.grantedAt })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(inArray(users.status, ['active', 'pending_verification', 'pending_activation']));
  const byUid = new Map<number, { uid: number; username: string; displayName: string; roles: string[]; rank: number }>();
  for (const r of rows) {
    const entry = byUid.get(r.uid) ?? { uid: r.uid, username: r.username, displayName: r.displayName, roles: [], rank: 0 };
    entry.roles.push(r.roleId);
    entry.rank = Math.max(entry.rank, roleRank(r.roleId));
    byUid.set(r.uid, entry);
  }
  return [...byUid.values()].sort((a, b) => b.rank - a.rank || a.uid - b.uid);
}
