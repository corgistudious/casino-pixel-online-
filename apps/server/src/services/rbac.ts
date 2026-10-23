import { DEFAULT_ROLES, type Permission } from '@casino/shared';
import { eq, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { rolePermissions, roles, userRoles } from '../db/schema';
import { fail } from '../errors';

/** Seeds default roles and their permissions. Idempotent; never removes admin-added permissions. */
export async function bootstrapRoles(db: Db): Promise<void> {
  for (const [id, role] of Object.entries(DEFAULT_ROLES)) {
    await db
      .insert(roles)
      .values({ id, name: role.name, description: role.description, system: true })
      .onConflictDoUpdate({ target: roles.id, set: { system: true } });
    if (role.permissions.length) {
      await db
        .insert(rolePermissions)
        .values(role.permissions.map((permission) => ({ roleId: id, permission })))
        .onConflictDoNothing();
    }
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
  return rows.map((r) => r.roleId);
}

export async function requirePermission(db: DbOrTx, userId: string, permission: Permission): Promise<void> {
  const perms = await userPermissions(db, userId);
  if (!perms.includes(permission)) throw fail('forbidden');
}

export async function grantRole(db: DbOrTx, userId: string, roleId: string, grantedBy: string | null): Promise<void> {
  await db.insert(userRoles).values({ userId, roleId, grantedBy }).onConflictDoNothing();
}
