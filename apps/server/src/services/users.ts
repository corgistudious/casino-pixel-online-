import {
  checkinDate,
  checkinDayEnd,
  checkinProgress,
  checkinReward,
  ECONOMY,
  type Badge,
  type CheckinResult,
  type LeaderboardEntry,
  type Locale,
  type AccountStatus,
  type PublicUser,
  type UpdateProfileInput,
} from '@casino/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { users, wallets } from '../db/schema';
import { userPermissions } from './rbac';
import { fail } from '../errors';
import { ownedFrames } from './shop';
import { applyDelta, getWallet } from './wallet';

export type UserRow = typeof users.$inferSelect;

export function badgesOf(user: { isVerified: boolean; isPartner: boolean }): Badge[] {
  const badges: Badge[] = [];
  if (user.isVerified) badges.push('verified');
  if (user.isPartner) badges.push('partner');
  return badges;
}

export async function toPublicUser(db: DbOrTx, user: UserRow, now = new Date()): Promise<PublicUser> {
  const wallet = await getWallet(db, user.id);
  const progress = checkinProgress(user.checkinStreak, user.lastCheckinDate, checkinDate(now));
  const permissions = await userPermissions(db, user.id);
  return {
    id: user.id,
    uid: user.uid,
    username: user.username,
    email: user.email,
    emailVerified: !!user.emailVerifiedAt,
    status: user.status as AccountStatus,
    accountType: user.accountType as PublicUser['accountType'],
    permissions,
    displayName: user.displayName,
    locale: user.locale as Locale,
    avatar: user.avatar,
    role: permissions.includes('admin.access') ? 'admin' : 'player',
    badges: badgesOf(user),
    balance: wallet.balance,
    gold: wallet.gold,
    frame: user.frame,
    ownedFrames: await ownedFrames(db, user.id),
    createdAt: user.createdAt.toISOString(),
    checkin: { ...progress, dayEndsAt: checkinDayEnd(now).toISOString() },
  };
}

export async function findUser(db: DbOrTx, id: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

export async function updateProfile(db: Db, userId: string, input: UpdateProfileInput): Promise<UserRow> {
  const patch: Partial<typeof users.$inferInsert> = {};
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.locale !== undefined) patch.locale = input.locale;
  if (input.avatar !== undefined) patch.avatar = input.avatar;
  if (Object.keys(patch).length === 0) return (await findUser(db, userId))!;
  const [row] = await db.update(users).set(patch).where(eq(users.id, userId)).returning();
  return row!;
}

/** Claims today's check-in reward. The user row lock serializes concurrent claims. */
export async function claimCheckin(db: Db, userId: string, now = new Date()): Promise<Omit<CheckinResult, 'user'> & { user: UserRow }> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
    if (!user) throw fail('unauthorized');
    const today = checkinDate(now);
    const progress = checkinProgress(user.checkinStreak, user.lastCheckinDate, today);
    if (progress.claimedToday) throw fail('checkin_done');
    const day = progress.nextDay;
    const reward = checkinReward(day);
    const [updated] = await tx
      .update(users)
      .set({ checkinStreak: day, lastCheckinDate: today })
      .where(eq(users.id, userId))
      .returning();
    if (reward.silver > 0) await applyDelta(tx, userId, reward.silver, 'checkin');
    if (reward.gold > 0) await applyDelta(tx, userId, reward.gold, 'checkin', null, 'gold');
    return { day, reward, user: updated! };
  });
}

export async function claimRescue(db: Db, userId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const cooldown = `${Math.floor(ECONOMY.rescueCooldownMs / 1000)} seconds`;
    const updated = await tx.execute(sql`
      UPDATE users u SET last_rescue_at = now()
      FROM wallets w
      WHERE u.id = ${userId} AND w.user_id = u.id
        -- available silver plus silver held in unfinished rounds must be below the threshold
        AND w.balance + coalesce((SELECT sum(r.bet) FROM game_rounds r WHERE r.user_id = u.id AND r.status = 'active'), 0) < ${ECONOMY.rescueThreshold}
        AND (u.last_rescue_at IS NULL OR u.last_rescue_at < now() - ${cooldown}::interval)
      RETURNING u.id
    `);
    if (updated.length === 0) throw fail('rescue_not_available');
    return applyDelta(tx, userId, ECONOMY.rescueAmount, 'rescue');
  });
}

export async function leaderboard(db: Db, limit = 50): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      uid: users.uid,
      username: users.username,
      displayName: users.displayName,
      avatar: users.avatar,
      frame: users.frame,
      isVerified: users.isVerified,
      isPartner: users.isPartner,
      balance: wallets.balance,
    })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(
      and(
        eq(users.accountType, 'player'),
        eq(users.status, 'active'),
        sql`NOT EXISTS (SELECT 1 FROM bans b WHERE b.user_id = ${users.id} AND b.revoked_at IS NULL AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now()))`,
      ),
    )
    .orderBy(desc(wallets.balance), users.createdAt)
    .limit(limit);
  return rows.map(({ isVerified, isPartner, ...r }, i) => ({ rank: i + 1, ...r, badges: badgesOf({ isVerified, isPartner }) }));
}

export function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  // drizzle wraps driver errors in `cause`
  for (let i = 0; i < 3 && e; i++) {
    if ((e as { code?: string }).code === '23505') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
