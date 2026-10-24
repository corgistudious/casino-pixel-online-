/**
 * Permission catalogue. Roles live in the database; these strings are what the server checks.
 * Read and write access are separate permissions wherever the data is sensitive.
 */
export const PERMISSIONS = [
  'admin.access',
  'dashboard.read',
  'users.read',
  /** Email addresses, login/security history. */
  'users.pii',
  'users.ban',
  'staff.read',
  /** Grant/revoke staff roles strictly below the actor's own rank. */
  'staff.manage',
  'uid.assign',
  'audit.read',
  'deletion.manage',
  'economy.read',
  /** Add/remove Cxu (silver and gold). Owner and Super Admin only. */
  'economy.grant',
  'items.read',
  'items.manage',
  'items.grant',
  'badges.manage',
  'mail.read',
  'mail.send',
  'support.read',
  'support.reply',
  'support.manage',
  'chat.moderate',
  'reports.manage',
  'market.manage',
  'bank.read',
  'events.manage',
  'rooms.manage',
  'game.config',
  'system.errors',
  /** Global configuration and emergency switches. Owner only. */
  'system.settings',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_IDS = ['owner', 'super_admin', 'admin', 'moderator', 'support'] as const;
export type RoleId = (typeof ROLE_IDS)[number];

/**
 * Built-in roles. They are code-defined: at start-up the database is synced to exactly these
 * permissions. `rank` decides who may manage whom: staff can only grant or revoke roles ranked
 * strictly below their own highest role, and only on accounts ranked below them.
 */
export const DEFAULT_ROLES: Record<RoleId, { name: string; description: string; rank: number; permissions: readonly Permission[] }> = {
  owner: {
    name: 'Owner',
    description: 'Keyo GM (UID 1002). Full access, cannot be removed through the API',
    rank: 100,
    permissions: PERMISSIONS,
  },
  super_admin: {
    name: 'Super Admin',
    description: 'Runs the whole game within what the Owner allows; manages Admin, Moderator and Support',
    rank: 80,
    permissions: PERMISSIONS.filter((p) => p !== 'system.settings'),
  },
  admin: {
    name: 'Admin',
    description: 'Players, bans, tickets and appeals. No resource or role management',
    rank: 60,
    permissions: [
      'admin.access',
      'dashboard.read',
      'users.read',
      'users.pii',
      'users.ban',
      'staff.read',
      'deletion.manage',
      'support.read',
      'support.reply',
      'support.manage',
      'reports.manage',
      'chat.moderate',
      'rooms.manage',
    ],
  },
  moderator: {
    name: 'Moderator',
    description: 'Chat and community content moderation',
    rank: 40,
    permissions: ['admin.access', 'dashboard.read', 'users.read', 'chat.moderate', 'reports.manage'],
  },
  support: {
    name: 'Support',
    description: 'Answers and routes support tickets',
    rank: 20,
    permissions: ['admin.access', 'users.read', 'support.read', 'support.reply'],
  },
};

/** Rank of a custom (non built-in) role: below every built-in staff role. */
export const CUSTOM_ROLE_RANK = 10;

export function roleRank(roleId: string): number {
  return (DEFAULT_ROLES as Record<string, { rank: number }>)[roleId]?.rank ?? CUSTOM_ROLE_RANK;
}

/** Highest rank among a set of roles (0 = regular player). */
export function topRank(roleIds: readonly string[]): number {
  return roleIds.reduce((max, r) => Math.max(max, roleRank(r)), 0);
}

/** Keyo Support system account. */
export const KEYO_SUPPORT_UID = 1000;
/** Keyo GM / Owner account. */
export const KEYO_OWNER_UID = 1002;
/** Accounts that can never be banned, deleted, demoted or have their UID changed. */
export const PROTECTED_UIDS: readonly number[] = [KEYO_SUPPORT_UID, KEYO_OWNER_UID];
export const SPECIAL_UID_MAX = 99_999;
export const PLAYER_UID_START = 100_000;
