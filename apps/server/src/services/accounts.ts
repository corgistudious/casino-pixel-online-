import { isProtectedDisplayName } from './protectedNames';
import { randomUUID } from 'node:crypto';
import { ECONOMY, KEYO_OWNER_UID, KEYO_SUPPORT_UID, PROTECTED_UIDS, SPECIAL_UID_MAX, type RegisterInput } from '@casino/shared';
import { and, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import { dummyPasswordHash, hashPassword, needsRehash, UNUSABLE_PASSWORD, verifyPassword } from '../auth/password';
import type { Db, DbOrTx } from '../db/client';
import { accountDeletionRequests, bans, users, wallets } from '../db/schema';
import { AppError, fail } from '../errors';
import { enqueueMail } from '../mail/mailer';
import { audit } from './audit';
import { consumeCode, consumeLinkToken, issueToken, type TokenPurpose } from './emailTokens';
import { createActiveSeed } from './fair';
import { assertOutranks, bootstrapOwner, isProtected, rankOf } from './rbac';
import { isUniqueViolation, type UserRow } from './users';
import { applyDelta } from './wallet';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/** Names players cannot register (case-insensitive). */
const RESERVED_USERNAMES = new Set(['keyo', 'keyo_support', 'keyosupport', 'support', 'admin', 'administrator', 'system', 'moderator', 'official']);

export interface AccountContext {
  appUrl: string;
  ip?: string;
}

const link = (ctx: AccountContext, route: string, token: string) => `${ctx.appUrl.replace(/\/$/, '')}/#/${route}?token=${encodeURIComponent(token)}`;

function constraintOf(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 3 && e; i++) {
    const c = (e as { constraint_name?: string; constraint?: string }).constraint_name ?? (e as { constraint?: string }).constraint;
    if (c) return c;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

async function createWalletAndSeed(tx: DbOrTx, userId: string) {
  await tx.insert(wallets).values({ userId, balance: 0 });
  await createActiveSeed(tx, userId);
}

// ---------------------------------------------------------------- registration & verification

export async function registerAccount(db: Db, input: RegisterInput, ctx: AccountContext): Promise<UserRow> {
  if (isProtectedDisplayName(input.displayName)) throw fail('username_taken');

  const username = `player_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const usernameLower = username.toLowerCase();
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          username,
          usernameLower,
          passwordHash,
          displayName: input.displayName,
          email: input.email,
          emailLower: input.email?.toLowerCase() ?? null,
          status: 'active',
          termsAcceptedAt: new Date(),
          locale: input.locale ?? 'vi',
        })
        .returning();
      await createWalletAndSeed(tx, user!.id);
      // Grant the welcome reward once in the registration transaction.
      if (ECONOMY.welcome.silver > 0) {
        await applyDelta(tx, user!.id, ECONOMY.welcome.silver, 'welcome');
      }
      await tx.update(users)
        .set({ starterGrantedAt: new Date() })
        .where(eq(users.id, user!.id));
      if (user!.emailLower) {
        const { token, code } = await issueToken(tx, user!.id, 'verify_email', user!.emailLower);
        await enqueueMail(tx, user!.email!, 'verify_email', user!.locale, { name: user!.displayName, code }, link(ctx, 'verify-email', token));
      }
      await audit(tx, { actorId: user!.id, action: 'account.register', targetType: 'user', targetId: user!.uid, ip: ctx.ip });
      return user!;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw fail(constraintOf(err)?.includes('email') ? 'email_taken' : 'username_taken');
    throw err;
  }
}

/** Marks the email verified, activates the account and grants the one-time starter reward. */
async function completeVerification(db: Db, userId: string, email: string, ctx: AccountContext): Promise<UserRow> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
    if (!user || user.emailLower !== email) throw fail('invalid_token');
    const now = new Date();
    const patch: Partial<typeof users.$inferInsert> = { emailVerifiedAt: user.emailVerifiedAt ?? now };
    if (user.status === 'pending_verification' || user.status === 'restricted') patch.status = 'active';
    const grantStarter = !user.starterGrantedAt;
    if (grantStarter) patch.starterGrantedAt = now;
    const [updated] = await tx.update(users).set(patch).where(eq(users.id, userId)).returning();
    if (grantStarter && ECONOMY.welcome.silver > 0) await applyDelta(tx, userId, ECONOMY.welcome.silver, 'welcome');
    await enqueueMail(tx, user.email!, 'email_verified', user.locale, { name: user.displayName });
    await audit(tx, { actorId: userId, action: 'account.email_verified', targetType: 'user', targetId: user.uid, details: { starter: grantStarter }, ip: ctx.ip });
    return updated!;
  });
}

/** Verifies with the emailed link token (no session needed). */
export async function verifyEmailByToken(db: Db, token: string, ctx: AccountContext): Promise<UserRow> {
  const row = await consumeLinkToken(db, 'verify_email', token);
  return completeVerification(db, row.userId, row.email, ctx);
}

/** Verifies with the 6-digit code from a signed-in session. */
export async function verifyEmailByCode(db: Db, user: UserRow, code: string, ctx: AccountContext): Promise<UserRow> {
  if (!user.emailLower) throw fail('bad_request');
  const row = await consumeCode(db, user.id, 'verify_email', code);
  return completeVerification(db, user.id, row.email, ctx);
}

export async function resendVerification(db: Db, user: UserRow, ctx: AccountContext): Promise<void> {
  if (!user.emailLower) throw fail('bad_request');
  if (user.emailVerifiedAt) throw fail('bad_request', 'already verified');
  await db.transaction(async (tx) => {
    const { token, code } = await issueToken(tx, user.id, 'verify_email', user.emailLower!);
    await enqueueMail(tx, user.email!, 'verify_email', user.locale, { name: user.displayName, code }, link(ctx, 'verify-email', token));
  });
}

/** Legacy accounts without an email link one; changing a verified email goes through Support. */
export async function linkEmail(db: Db, user: UserRow, email: string, password: string, ctx: AccountContext): Promise<UserRow> {
  if (user.emailVerifiedAt) throw fail('forbidden');
  if (!(await verifyPassword(password, user.passwordHash))) throw fail('invalid_credentials');
  try {
    return await db.transaction(async (tx) => {
      const [updated] = await tx.update(users).set({ email, emailLower: email.toLowerCase() }).where(eq(users.id, user.id)).returning();
      const { token, code } = await issueToken(tx, user.id, 'verify_email', email.toLowerCase());
      await enqueueMail(tx, email, 'verify_email', user.locale, { name: user.displayName, code }, link(ctx, 'verify-email', token));
      await audit(tx, { actorId: user.id, action: 'account.email_linked', targetType: 'user', targetId: user.uid, ip: ctx.ip });
      return updated!;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw fail('email_taken');
    throw err;
  }
}

// ---------------------------------------------------------------- login & bans

export async function activeBan(db: DbOrTx, userId: string, now = new Date()) {
  const [ban] = await db
    .select()
    .from(bans)
    .where(
      and(
        eq(bans.userId, userId),
        isNull(bans.revokedAt),
        lte(bans.startsAt, now),
        or(isNull(bans.endsAt), gt(bans.endsAt, now)),
      ),
    )
    .orderBy(sql`${bans.endsAt} DESC NULLS FIRST`)
    .limit(1);
  return ban ?? null;
}

export class BannedError extends AppError {
  constructor(public readonly endsAt: Date | null, public readonly reason: string) {
    super('banned', 403);
  }
}

export async function login(db: Db, loginName: string, password: string, ctx: AccountContext): Promise<UserRow> {
  const key = loginName.toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(key.includes('@') ? and(eq(users.emailLower, key), sql`${users.emailVerifiedAt} IS NOT NULL`) : /^\d+$/.test(key) ? eq(users.uid, Number(key)) : eq(users.usernameLower, key));
  const now = new Date();
  if (!user || user.accountType !== 'player' || user.status === 'deleted' || user.status === 'pending_activation') {
    await verifyPassword(password, await dummyPasswordHash());
    throw fail('invalid_credentials');
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    await verifyPassword(password, await dummyPasswordHash());
    throw fail('invalid_credentials');
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await db
      .update(users)
      .set(failed >= MAX_FAILED_LOGINS ? { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MS) } : { failedLogins: failed })
      .where(eq(users.id, user.id));
    if (failed >= MAX_FAILED_LOGINS) await audit(db, { action: 'account.locked', targetType: 'user', targetId: user.uid, ip: ctx.ip });
    throw fail('invalid_credentials');
  }
  const ban = await activeBan(db, user.id, now);
  if (ban) throw new BannedError(ban.endsAt, ban.reason);

  const patch: Partial<typeof users.$inferInsert> = { failedLogins: 0, lockedUntil: null };
  if (needsRehash(user.passwordHash)) patch.passwordHash = await hashPassword(password);
  const [updated] = await db.update(users).set(patch).where(eq(users.id, user.id)).returning();
  return updated!;
}

export type BanDuration = { unit: 'day' | 'month' | 'year'; amount: number } | 'permanent';

export function banEnd(start: Date, duration: BanDuration): Date | null {
  if (duration === 'permanent') return null;
  const d = new Date(start);
  if (duration.unit === 'day') d.setUTCDate(d.getUTCDate() + duration.amount);
  else if (duration.unit === 'month') d.setUTCMonth(d.getUTCMonth() + duration.amount);
  else d.setUTCFullYear(d.getUTCFullYear() + duration.amount);
  return d;
}

export async function findByUid(db: DbOrTx, uid: number): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.uid, uid));
  return row;
}

export async function banUser(db: Db, actorId: string, uid: number, input: { duration: BanDuration; reason: string; evidence?: string }, ip?: string) {
  return db.transaction(async (tx) => {
    const target = await findByUid(tx, uid);
    if (!target) throw fail('not_found');
    if (isProtected(target)) throw fail('protected_account');
    if (target.accountType !== 'player') throw fail('system_account');
    // Staff can only ban accounts ranked below them (players have rank 0).
    await assertOutranks(tx, actorId, target);
    const startsAt = new Date();
    const [ban] = await tx
      .insert(bans)
      .values({ userId: target.id, reason: input.reason, evidence: input.evidence ?? null, issuedBy: actorId, startsAt, endsAt: banEnd(startsAt, input.duration) })
      .returning();
    await audit(tx, { actorId, action: 'ban.create', targetType: 'user', targetId: uid, details: { banId: ban!.id, duration: input.duration, reason: input.reason }, ip });
    return { ban: ban!, userId: target.id };
  });
}

/** Lifting or changing a ban needs rank over the banned account and at least the rank of whoever issued it. */
async function assertCanChangeBan(tx: DbOrTx, actorId: string, banId: string) {
  const [row] = await tx
    .select({ issuedBy: bans.issuedBy, userId: bans.userId, uid: users.uid })
    .from(bans)
    .innerJoin(users, eq(users.id, bans.userId))
    .where(eq(bans.id, banId));
  if (!row) throw fail('not_found');
  await assertOutranks(tx, actorId, { id: row.userId, uid: row.uid });
  if (row.issuedBy && row.issuedBy !== actorId && (await rankOf(tx, row.issuedBy)) > (await rankOf(tx, actorId))) throw fail('forbidden');
}

export async function revokeBan(db: Db, actorId: string, banId: string, reason: string, ip?: string) {
  return db.transaction(async (tx) => {
    await assertCanChangeBan(tx, actorId, banId);
    const [ban] = await tx
      .update(bans)
      .set({ revokedAt: new Date(), revokedBy: actorId, revokeReason: reason })
      .where(and(eq(bans.id, banId), isNull(bans.revokedAt)))
      .returning();
    if (!ban) throw fail('not_found');
    await audit(tx, { actorId, action: 'ban.revoke', targetType: 'ban', targetId: banId, details: { reason }, ip });
    return ban;
  });
}

/** Changes the end of an active ban (extend or shorten); `null` makes it permanent. */
export async function updateBanEnd(db: Db, actorId: string, banId: string, endsAt: Date | null, ip?: string) {
  return db.transaction(async (tx) => {
    await assertCanChangeBan(tx, actorId, banId);
    const [ban] = await tx.update(bans).set({ endsAt }).where(and(eq(bans.id, banId), isNull(bans.revokedAt))).returning();
    if (!ban) throw fail('not_found');
    await audit(tx, { actorId, action: 'ban.update', targetType: 'ban', targetId: banId, details: { endsAt: endsAt?.toISOString() ?? 'permanent' }, ip });
    return ban;
  });
}

// ---------------------------------------------------------------- password reset & activation

/** Always succeeds from the caller's point of view so emails cannot be enumerated. */
export async function forgotPassword(db: Db, email: string, ctx: AccountContext): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.emailLower, email.toLowerCase()));
  if (!user || !user.emailVerifiedAt || user.accountType !== 'player' || user.status === 'deleted') return;
  try {
    await db.transaction(async (tx) => {
      const { token, code } = await issueToken(tx, user.id, 'reset_password', user.emailLower!);
      await enqueueMail(tx, user.email!, 'reset_password', user.locale, { name: user.displayName, code }, link(ctx, 'reset-password', token));
      await audit(tx, { action: 'account.password_reset_requested', targetType: 'user', targetId: user.uid, ip: ctx.ip });
    });
  } catch (err) {
    // Resend limits are not reported, to keep the response identical for every email.
    if (!(err instanceof AppError)) throw err;
  }
}

/** Sets a new password from a reset or activation token/code. Revokes every existing session. */
export async function setPasswordWithToken(
  db: Db,
  purpose: Extract<TokenPurpose, 'reset_password' | 'activate'>,
  input: { token?: string; email?: string; code?: string; password: string },
  ctx: AccountContext,
): Promise<UserRow> {
  let row;
  if (input.token) row = await consumeLinkToken(db, purpose, input.token);
  else {
    const [user] = await db.select().from(users).where(eq(users.emailLower, (input.email ?? '').toLowerCase()));
    if (!user) throw fail('invalid_token');
    row = await consumeCode(db, user.id, purpose, input.code ?? '');
  }
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, row.userId)).for('update');
    if (!user || user.emailLower !== row.email || user.status === 'deleted') throw fail('invalid_token');
    const patch: Partial<typeof users.$inferInsert> = {
      passwordHash,
      tokenVersion: user.tokenVersion + 1,
      failedLogins: 0,
      lockedUntil: null,
    };
    if (purpose === 'activate') {
      patch.status = 'active';
      patch.emailVerifiedAt = user.emailVerifiedAt ?? new Date();
    }
    const [updated] = await tx.update(users).set(patch).where(eq(users.id, user.id)).returning();
    await enqueueMail(tx, user.email!, 'password_changed', user.locale, { name: user.displayName });
    await audit(tx, { actorId: user.id, action: purpose === 'activate' ? 'account.activated' : 'account.password_reset', targetType: 'user', targetId: user.uid, ip: ctx.ip });
    return updated!;
  });
}

// ---------------------------------------------------------------- custom UID accounts (admin)

export async function createCustomUidAccount(
  db: Db,
  actorId: string,
  input: { uid: number; username: string; displayName: string; email: string; isTest?: boolean },
  ctx: AccountContext,
): Promise<UserRow> {
  if (!Number.isInteger(input.uid) || input.uid < 1 || input.uid > SPECIAL_UID_MAX) throw fail('bad_request');
  // Keyo Support (1000) and the Owner (1002) are never assigned through the API.
  if (PROTECTED_UIDS.includes(input.uid)) throw fail('uid_reserved');
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          uid: input.uid,
          username: input.username,
          usernameLower: input.username.toLowerCase(),
          displayName: input.displayName,
          email: input.email,
          emailLower: input.email.toLowerCase(),
          passwordHash: UNUSABLE_PASSWORD,
          status: 'pending_activation',
          // Pre-activated by an admin: the starter reward is not part of special accounts.
          starterGrantedAt: new Date(),
          // Special UIDs are deliberate assignments, so they are official unless the admin marks them as test.
          isTest: input.isTest ?? false,
        })
        .returning();
      await createWalletAndSeed(tx, user!.id);
      const { token, code } = await issueToken(tx, user!.id, 'activate', user!.emailLower!);
      await enqueueMail(tx, user!.email!, 'activate_account', user!.locale, { name: user!.displayName, uid: String(user!.uid), code }, link(ctx, 'activate', token));
      await audit(tx, { actorId, action: 'uid.custom_create', targetType: 'user', targetId: input.uid, details: { username: input.username, isTest: input.isTest ?? false }, ip: ctx.ip });
      return user!;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const c = constraintOf(err) ?? '';
      throw fail(c.includes('uid') ? 'uid_taken' : c.includes('email') ? 'email_taken' : 'username_taken');
    }
    throw err;
  }
}

// ---------------------------------------------------------------- deletion

export async function requestDeletion(db: Db, user: UserRow, password: string, reason: string | undefined, ctx: AccountContext) {
  if (isProtected(user)) throw fail('protected_account');
  if (user.accountType !== 'player') throw fail('system_account');
  if (!(await verifyPassword(password, user.passwordHash))) throw fail('invalid_credentials');
  try {
    return await db.transaction(async (tx) => {
      const [req] = await tx.insert(accountDeletionRequests).values({ userId: user.id, reason: reason ?? null }).returning();
      await audit(tx, { actorId: user.id, action: 'account.deletion_requested', targetType: 'user', targetId: user.uid, ip: ctx.ip });
      return req!;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw fail('deletion_pending');
    throw err;
  }
}

export async function pendingDeletion(db: DbOrTx, userId: string) {
  const [req] = await db
    .select()
    .from(accountDeletionRequests)
    .where(and(eq(accountDeletionRequests.userId, userId), eq(accountDeletionRequests.status, 'pending')));
  return req ?? null;
}

export async function cancelDeletion(db: Db, user: UserRow, ctx: AccountContext) {
  return db.transaction(async (tx) => {
    const [req] = await tx
      .update(accountDeletionRequests)
      .set({ status: 'cancelled', decidedAt: new Date() })
      .where(and(eq(accountDeletionRequests.userId, user.id), eq(accountDeletionRequests.status, 'pending')))
      .returning();
    if (!req) throw fail('not_found');
    await audit(tx, { actorId: user.id, action: 'account.deletion_cancelled', targetType: 'user', targetId: user.uid, ip: ctx.ip });
  });
}

/**
 * Approving anonymises personal data (name, email, password) and closes the account.
 * Ledger, game history and audit records are kept; the UID is never reused.
 */
export async function decideDeletion(db: Db, actorId: string, requestId: string, approve: boolean, note: string, ip?: string) {
  return db.transaction(async (tx) => {
    const [req] = await tx
      .update(accountDeletionRequests)
      .set({ status: approve ? 'completed' : 'rejected', decidedBy: actorId, decisionNote: note, decidedAt: new Date() })
      .where(and(eq(accountDeletionRequests.id, requestId), eq(accountDeletionRequests.status, 'pending')))
      .returning();
    if (!req) throw fail('not_found');
    const [user] = await tx.select().from(users).where(eq(users.id, req.userId)).for('update');
    if (!user) throw fail('not_found');
    if (approve) {
      if (user.accountType !== 'player') throw fail('system_account');
      await assertOutranks(tx, actorId, user);
      if (user.email && user.emailVerifiedAt) await enqueueMail(tx, user.email, 'account_deleted', user.locale, { name: user.displayName });
      const anon = `deleted_${user.uid}`;
      await tx
        .update(users)
        .set({
          username: anon,
          usernameLower: anon,
          displayName: 'Deleted player',
          email: null,
          emailLower: null,
          passwordHash: UNUSABLE_PASSWORD,
          status: 'deleted',
          deletedAt: new Date(),
          tokenVersion: user.tokenVersion + 1,
          avatar: 0,
          isVerified: false,
          isPartner: false,
        })
        .where(eq(users.id, user.id));
    }
    await audit(tx, { actorId, action: approve ? 'account.deleted' : 'account.deletion_rejected', targetType: 'user', targetId: user.uid, details: { requestId, note }, ip });
    return { approved: approve, userId: user.id };
  });
}

export async function listDeletionRequests(db: Db, status = 'pending') {
  return db
    .select({ id: accountDeletionRequests.id, uid: users.uid, username: users.username, reason: accountDeletionRequests.reason, status: accountDeletionRequests.status, createdAt: accountDeletionRequests.createdAt })
    .from(accountDeletionRequests)
    .innerJoin(users, eq(users.id, accountDeletionRequests.userId))
    .where(eq(accountDeletionRequests.status, status))
    .orderBy(desc(accountDeletionRequests.createdAt))
    .limit(100);
}

// ---------------------------------------------------------------- system accounts

/** Creates Keyo Support (UID 1000) once. Safe to run on every start. */
export async function bootstrapSystemAccounts(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.uid, KEYO_SUPPORT_UID));
    if (existing) return;
    const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.usernameLower, 'keyo_support'));
    const username = taken ? 'keyo_support_1000' : 'keyo_support';
    const [user] = await tx
      .insert(users)
      .values({
        uid: KEYO_SUPPORT_UID,
        username,
        usernameLower: username,
        displayName: 'Keyo Support',
        passwordHash: UNUSABLE_PASSWORD,
        accountType: 'system_support',
        status: 'active',
        isVerified: true,
        starterGrantedAt: new Date(),
        // The official support account is never test data, in any mode.
        isTest: false,
      })
      .onConflictDoNothing()
      .returning();
    if (!user) return;
    await createWalletAndSeed(tx, user.id);
    await audit(tx, { action: 'system.keyo_support_created', targetType: 'user', targetId: KEYO_SUPPORT_UID });
  });
}

// ---------------------------------------------------------------- test accounts (test mode only)

/** Mailbox domain for generated test accounts; `.invalid` can never receive real mail (RFC 2606). */
export const TEST_EMAIL_DOMAIN = 'test.keyo.invalid';

/**
 * Creates a ready-to-play TEST account (verified, starter reward credited) for the test phase.
 * The users trigger rejects it outright if the database is already in production mode.
 */
export async function createTestAccount(db: Db, input: { username: string; password: string }, actor: string): Promise<UserRow> {
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const email = `${input.username.toLowerCase()}@${TEST_EMAIL_DOMAIN}`;
    const now = new Date();
    const [user] = await tx
      .insert(users)
      .values({
        username: input.username,
        usernameLower: input.username.toLowerCase(),
        passwordHash,
        displayName: input.username,
        email,
        emailLower: email,
        emailVerifiedAt: now,
        status: 'active',
        termsAcceptedAt: now,
        starterGrantedAt: now,
        isTest: true,
      })
      .returning();
    await createWalletAndSeed(tx, user!.id);
    if (ECONOMY.welcome.silver > 0) await applyDelta(tx, user!.id, ECONOMY.welcome.silver, 'welcome');
    await audit(tx, { action: 'account.test_create', targetType: 'user', targetId: user!.uid, details: { operator: actor } });
    return user!;
  });
}

// ---------------------------------------------------------------- owner account (server shell only)

/**
 * Creates the Owner account (UID 1002) when it does not exist yet. Run from the maintenance CLI
 * on the server, never through the API. The account has no usable password: the owner receives
 * an activation email and chooses one. The Owner role is attached immediately.
 */
export async function createOwnerAccount(db: Db, input: { username: string; displayName: string; email: string }, ctx: AccountContext): Promise<UserRow> {
  const user = await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.uid, KEYO_OWNER_UID));
    if (existing) throw fail('uid_taken');
    const [row] = await tx
      .insert(users)
      .values({
        uid: KEYO_OWNER_UID,
        username: input.username,
        usernameLower: input.username.toLowerCase(),
        displayName: input.displayName,
        email: input.email,
        emailLower: input.email.toLowerCase(),
        passwordHash: UNUSABLE_PASSWORD,
        status: 'pending_activation',
        starterGrantedAt: new Date(),
        isTest: false,
      })
      .returning();
    await createWalletAndSeed(tx, row!.id);
    const { token, code } = await issueToken(tx, row!.id, 'activate', row!.emailLower!);
    await enqueueMail(tx, row!.email!, 'activate_account', row!.locale, { name: row!.displayName, uid: String(row!.uid), code }, link(ctx, 'activate', token));
    await audit(tx, { action: 'system.owner_created', targetType: 'user', targetId: KEYO_OWNER_UID, ip: ctx.ip });
    return row!;
  });
  await bootstrapOwner(db);
  return user;
}
