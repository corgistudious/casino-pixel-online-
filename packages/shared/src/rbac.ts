/** Permission catalogue. Roles live in the database; these strings are what code checks. */
export const PERMISSIONS = [
  'admin.access',
  'users.read',
  'users.manage',
  'users.ban',
  'uid.assign',
  'roles.manage',
  'audit.read',
  'deletion.manage',
  'economy.read',
  'economy.grant',
  'badges.manage',
  'mail.read',
  'support.manage',
  'content.moderate',
  'system.settings',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Default roles seeded (idempotently) at start-up. Admins can add more roles. */
export const DEFAULT_ROLES: Record<string, { name: string; description: string; permissions: readonly Permission[] }> = {
  super_admin: { name: 'Super Admin', description: 'Full access', permissions: PERMISSIONS },
  admin: {
    name: 'Admin',
    description: 'Day-to-day administration without role management',
    permissions: PERMISSIONS.filter((p) => p !== 'roles.manage' && p !== 'system.settings'),
  },
  moderator: {
    name: 'Moderator',
    description: 'Bans, reports and content moderation',
    permissions: ['admin.access', 'users.read', 'users.ban', 'audit.read', 'content.moderate'],
  },
  support_agent: {
    name: 'Support Agent',
    description: 'Support tickets and account help',
    permissions: ['admin.access', 'users.read', 'support.manage', 'mail.read'],
  },
  finance: {
    name: 'Finance',
    description: 'Ledger review and approved grants',
    permissions: ['admin.access', 'users.read', 'economy.read', 'economy.grant', 'audit.read'],
  },
};

/** Keyo Support system account. */
export const KEYO_SUPPORT_UID = 1000;
export const SPECIAL_UID_MAX = 99_999;
export const PLAYER_UID_START = 100_000;
