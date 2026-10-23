import { createHash, randomBytes, randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { emailTokens } from '../db/schema';
import { fail } from '../errors';

export type TokenPurpose = 'verify_email' | 'reset_password' | 'activate';

export const TOKEN_TTL_MS = 30 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_PER_DAY = 5;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/** Codes are bound to the token row's user so a code alone cannot be replayed elsewhere. */
const codeHash = (userId: string, purpose: string, code: string) => sha(`${userId}:${purpose}:${code}`);

/** Issues a link token and a 6-digit code. Older open tokens of the same purpose are invalidated. */
export async function issueToken(db: DbOrTx, userId: string, purpose: TokenPurpose, email: string, now = new Date()) {
  const [latest] = await db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose)))
    .orderBy(desc(emailTokens.createdAt))
    .limit(1);
  if (latest && now.getTime() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) throw fail('too_soon');
  const [{ n }] = (await db.execute<{ n: string }>(sql`
    SELECT count(*) AS n FROM email_tokens WHERE user_id = ${userId} AND purpose = ${purpose} AND created_at > ${new Date(now.getTime() - 86_400_000).toISOString()}
  `)) as unknown as [{ n: string }];
  if (Number(n) >= MAX_PER_DAY) throw fail('too_many_attempts');

  await db
    .update(emailTokens)
    .set({ usedAt: now })
    .where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt)));
  const token = randomBytes(32).toString('base64url');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db.insert(emailTokens).values({
    userId,
    purpose,
    email,
    tokenHash: sha(token),
    codeHash: codeHash(userId, purpose, code),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
  });
  return { token, code };
}

/** Consumes a link token. Returns the token row or throws invalid_token. */
export async function consumeLinkToken(db: DbOrTx, purpose: TokenPurpose, token: string, now = new Date()) {
  const [row] = await db
    .update(emailTokens)
    .set({ usedAt: now })
    .where(and(eq(emailTokens.tokenHash, sha(token)), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, now)))
    .returning();
  if (!row) throw fail('invalid_token');
  return row;
}

/** Consumes the user's open code for a purpose; each wrong guess counts towards the attempt limit. */
export async function consumeCode(db: DbOrTx, userId: string, purpose: TokenPurpose, code: string, now = new Date()) {
  const [row] = await db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, now)))
    .orderBy(desc(emailTokens.createdAt))
    .limit(1)
    .for('update');
  if (!row) throw fail('invalid_token');
  if (row.attempts >= MAX_CODE_ATTEMPTS) throw fail('too_many_attempts');
  if (row.codeHash !== codeHash(userId, purpose, code)) {
    const attempts = row.attempts + 1;
    await db.update(emailTokens).set({ attempts, ...(attempts >= MAX_CODE_ATTEMPTS ? { usedAt: now } : {}) }).where(eq(emailTokens.id, row.id));
    throw fail(attempts >= MAX_CODE_ATTEMPTS ? 'too_many_attempts' : 'invalid_token');
  }
  const [used] = await db.update(emailTokens).set({ usedAt: now }).where(and(eq(emailTokens.id, row.id), isNull(emailTokens.usedAt))).returning();
  if (!used) throw fail('invalid_token');
  return used;
}
