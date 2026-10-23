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
  type PublicUser,
  type RegisterInput,
  type UpdateProfileInput,
} from '@casino/shared';
import { desc, eq, sql } from 'drizzle-orm';
import { dummyPasswordHash, hashPassword, verifyPassword } from '../auth/password';
import type { Db, DbOrTx } from '../db/client';
import { users, wallets } from '../db/schema';
import { fail } from '../errors';
import { createActiveSeed } from './fair';
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
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    locale: user.locale as Locale,
    avatar: user.avatar,
    role: user.role as PublicUser['role'],
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

export async function registerUser(db: Db, input: RegisterInput, admins: Set<string>): Promise<UserRow> {
  const passwordHash = await hashPassword(input.password);
  const usernameLower = input.username.toLowerCase();
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          username: input.username,
          usernameLower,
          passwordHash,
          displayName: input.displayName ?? input.username,
          locale: input.locale ?? 'vi',
          role: admins.has(usernameLower) ? 'admin' : 'player',
        })
        .returning();
      await tx.insert(wallets).values({ userId: user!.id, balance: 0 });
      await applyDelta(tx, user!.id, ECONOMY.welcome.silver, 'welcome');
      await applyDelta(tx, user!.id, ECONOMY.welcome.gold, 'welcome', null, 'gold');
      await createActiveSeed(tx, user!.id);
      return user!;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw fail('username_taken');
    throw err;
  }
}

export async function authenticate(db: Db, username: string, password: string, admins: Set<string>): Promise<UserRow> {
  const [user] = await db.select().from(users).where(eq(users.usernameLower, username.toLowerCase()));
  if (!user) {
    await verifyPassword(password, await dummyPasswordHash());
    throw fail('invalid_credentials');
  }
  if (!(await verifyPassword(password, user.passwordHash))) throw fail('invalid_credentials');
  if (user.banned) throw fail('banned');
  if (admins.has(user.usernameLower) && user.role !== 'admin') {
    const [promoted] = await db.update(users).set({ role: 'admin' }).where(eq(users.id, user.id)).returning();
    return promoted!;
  }
  return user;
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
        AND w.balance < ${ECONOMY.rescueThreshold}
        AND (u.last_rescue_at IS NULL OR u.last_rescue_at < now() - ${cooldown}::interval)
        AND NOT EXISTS (SELECT 1 FROM game_rounds r WHERE r.user_id = u.id AND r.status = 'active')
      RETURNING u.id
    `);
    if (updated.length === 0) throw fail('rescue_not_available');
    return applyDelta(tx, userId, ECONOMY.rescueAmount, 'rescue');
  });
}

export async function leaderboard(db: Db, limit = 50): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
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
    .where(eq(users.banned, false))
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
