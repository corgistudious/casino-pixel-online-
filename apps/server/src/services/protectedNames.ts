/**
 * Protect official Keyo Game identities from impersonation.
 * Applied to player display names during registration and rename.
 *
 * Existing player names are not modified.
 */

const RESERVED_EXACT = new Set([
  'keyo',
  'keyogame',
  'keyosupport',
  'keyoadmin',
  'keyoowner',
  'keyomoderator',
  'keyostaff',
  'keyoofficial',
  'support',
  'admin',
  'administrator',
  'moderator',
  'official',
  'system',
  'gamesupport',
  'customersupport',
]);

export function normalizeProtectedName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_.-]+/g, '');
}

export function isProtectedDisplayName(name: string): boolean {
  const normalized = normalizeProtectedName(name);

  if (RESERVED_EXACT.has(normalized)) return true;

  // Prevent obvious impersonation of official Keyo identities.
  if (/^keyo(support|admin|owner|moderator|staff|official)\d*$/.test(normalized)) {
    return true;
  }

  return false;
}
