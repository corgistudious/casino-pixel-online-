import { z } from 'zod';

/**
 * One account name per player: it is both the display name and the @username (the "@" is only
 * shown, never stored). Rules: 3–20 characters, Latin letters, digits and "_", with at least one
 * letter (an all-digit name would read as a UID at sign-in). Uniqueness is case-insensitive and is
 * enforced by the server and the database.
 */
export const ACCOUNT_NAME_MIN = 3;
export const ACCOUNT_NAME_MAX = 20;
const PATTERN = /^[A-Za-z0-9_]+$/;

export function accountNameProblem(raw: string): 'name_invalid' | null {
  const name = raw.trim();
  if (name.length < ACCOUNT_NAME_MIN || name.length > ACCOUNT_NAME_MAX) return 'name_invalid';
  if (!PATTERN.test(name) || !/[A-Za-z]/.test(name)) return 'name_invalid';
  return null;
}

export const accountNameSchema = z
  .string()
  .trim()
  .refine((v) => accountNameProblem(v) === null, { message: 'name_invalid' });
