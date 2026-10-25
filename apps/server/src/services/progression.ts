import { EXP_MAX, GAMEPLAY_EXP, gameplayExp, levelFromExp, type MailAttachment, type ProgressEvent } from '@casino/shared';
import { and, asc, desc, eq, gt, lte, sql } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../db/client';
import { expEvents, levelRewards, playerProgress, users } from '../db/schema';
import type { RealtimeHub } from '../realtime/hub';
import { deliverReward } from './rewards';

export interface ExpGrant {
  source: 'gameplay' | 'admin' | 'event' | 'achievement' | 'quest';
  /** Unique per player: the same key never gives EXP twice (e.g. `round:<id>`). */
  sourceKey: string;
  amount: number;
  actorId?: string | null;
  note?: string | null;
}

export interface ExpResult extends ProgressEvent {
  /** Level-reward mails delivered by this change. */
  rewardMails: number;
}

/**
 * Adds (or, for staff corrections, removes) EXP. Runs inside the caller's transaction so EXP is
 * committed together with the round/action that earned it. The player's progress row is locked,
 * the (player, key) pair is unique, gameplay EXP respects the daily cap, EXP never goes below 0
 * or above level 999, and every newly reached level with a configured reward gets its mail once.
 */
export async function addExp(tx: Tx, userId: string, grant: ExpGrant): Promise<ExpResult | null> {
  if (!Number.isSafeInteger(grant.amount) || grant.amount === 0) return null;
  await tx.insert(playerProgress).values({ userId }).onConflictDoNothing();
  const [row] = await tx.select().from(playerProgress).where(eq(playerProgress.userId, userId)).for('update');
  const [{ today }] = (await tx.execute(sql`SELECT (now() AT TIME ZONE 'UTC')::date::text AS today`)) as unknown as [{ today: string }];

  let amount = grant.amount;
  const expToday = row!.expDay === today ? row!.expToday : 0;
  if (grant.source === 'gameplay') amount = Math.min(amount, GAMEPLAY_EXP.dailyCap - expToday);
  const before = levelFromExp(row!.exp);
  const exp = Math.min(EXP_MAX, Math.max(0, row!.exp + amount));
  amount = exp - row!.exp;
  if (amount === 0) return null;
  const after = levelFromExp(exp);

  const inserted = await tx
    .insert(expEvents)
    .values({ userId, source: grant.source, sourceKey: grant.sourceKey, amount, levelBefore: before.level, levelAfter: after.level, actorId: grant.actorId ?? null, note: grant.note ?? null })
    .onConflictDoNothing()
    .returning({ id: expEvents.id });
  if (!inserted.length) return null; // already granted for this key

  await tx
    .update(playerProgress)
    .set({
      exp,
      level: after.level,
      expToday: grant.source === 'gameplay' ? expToday + amount : expToday,
      expDay: today,
      updatedAt: new Date(),
    })
    .where(eq(playerProgress.userId, userId));

  const levelsGained: number[] = [];
  let rewardMails = 0;
  if (after.level > before.level) {
    for (let l = before.level + 1; l <= after.level; l++) levelsGained.push(l);
    const rewards = await tx
      .select()
      .from(levelRewards)
      .where(and(gt(levelRewards.level, before.level), lte(levelRewards.level, after.level), eq(levelRewards.enabled, true)))
      .orderBy(asc(levelRewards.level));
    for (const r of rewards) {
      const id = await deliverReward(tx, {
        userId,
        key: `level:${r.level}`,
        kind: 'reward',
        text: {
          vi: { subject: `Phần thưởng đạt cấp ${r.level}`, body: `Chúc mừng bạn đã đạt cấp ${r.level}! Nhận phần thưởng đính kèm bên dưới.` },
          en: { subject: `Level ${r.level} reward`, body: `Congratulations on reaching level ${r.level}! Claim the attached reward below.` },
        },
        attachments: r.attachments as MailAttachment[],
      });
      if (id) rewardMails += 1;
    }
  }
  return { expGained: amount, level: after, levelsGained, rewardMails };
}

/** EXP for one settled game round (once per round). */
export function awardGameplayExp(tx: Tx, userId: string, roundKey: string, bet: number) {
  return addExp(tx, userId, { source: 'gameplay', sourceKey: `round:${roundKey}`, amount: gameplayExp(bet) });
}

export async function levelOf(db: DbOrTx, userId: string) {
  const [row] = await db.select({ exp: playerProgress.exp }).from(playerProgress).where(eq(playerProgress.userId, userId));
  return levelFromExp(row?.exp ?? 0);
}

/** Level ladder: highest EXP first, earliest to get there wins ties. Active players only. */
export async function levelLadder(db: DbOrTx, limit = 100) {
  const rows = await db
    .select({ uid: users.uid, displayName: users.displayName, avatar: users.avatar, frame: users.frame, avatarItem: users.avatarItem, exp: playerProgress.exp, level: playerProgress.level })
    .from(playerProgress)
    .innerJoin(users, eq(users.id, playerProgress.userId))
    .where(
      and(
        eq(users.accountType, 'player'),
        eq(users.status, 'active'),
        sql`NOT EXISTS (SELECT 1 FROM bans b WHERE b.user_id = ${users.id} AND b.revoked_at IS NULL AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now()))`,
      ),
    )
    .orderBy(desc(playerProgress.exp), asc(playerProgress.updatedAt))
    .limit(limit);
  return rows.map((r, i) => ({ position: i + 1, ...r }));
}

export async function recentExpEvents(db: DbOrTx, userId: string, limit = 50) {
  return db.select().from(expEvents).where(eq(expEvents.userId, userId)).orderBy(desc(expEvents.id)).limit(limit);
}

/** Pushes the EXP gain (and the mailbox badge when level rewards arrived) after commit. */
export function notifyProgress(hub: RealtimeHub, userId: string, p: ExpResult) {
  const { rewardMails, ...event } = p;
  hub.sendToUser(userId, { type: 'event', event: 'progress', data: event });
  if (rewardMails) hub.sendToUser(userId, { type: 'event', event: 'mail', data: {} });
}
