import { resolveDurations, type Locale, type MailAttachment, type MailKind } from '@casino/shared';
import { eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { users } from '../db/schema';
import { fail } from '../errors';
import { itemsExist } from './catalog';

/**
 * Unified reward delivery. Every automatic reward (level milestones, season rewards, giftcodes,
 * achievements, VIP, events) becomes one mail with attachments, keyed by `key`:
 * - the (player, key) pair is unique in the database, so a reward is delivered at most once,
 *   even when two requests or instances race;
 * - nothing is credited here: Cxu move through the ledger and items through the inventory only
 *   when the player claims the mail (see mailbox.claimInTx), which is itself exactly-once.
 */
export interface RewardDelivery {
  userId: string;
  /** Stable identity of the reward, e.g. `level:50`, `season:3:tier`, `giftcode:<id>`. */
  key: string;
  kind: MailKind;
  /** Subject and body per language; the player's language is used. */
  text: Record<Locale, { subject: string; body: string }>;
  attachments: MailAttachment[];
  expiresInDays?: number | null;
  actorId?: string | null;
}

/** Delivers the reward; returns the mail id, or null when this reward was already delivered. */
export async function deliverReward(tx: Tx, r: RewardDelivery): Promise<string | null> {
  if (!r.attachments.length) return null;
  // Timed items given as a duration count from delivery (callers may resolve them earlier, e.g. season start).
  const attachments = resolveDurations(r.attachments, new Date());
  const itemIds = [...new Set(attachments.flatMap((a) => (a.type === 'item' ? [a.itemId] : [])))];
  if (itemIds.length) {
    const known = await itemsExist(tx, itemIds);
    const missing = itemIds.filter((id) => !known.has(id));
    if (missing.length) throw fail('item_not_found', missing.join(', '));
  }
  const [user] = await tx.select({ locale: users.locale }).from(users).where(eq(users.id, r.userId));
  if (!user) throw fail('not_found');
  const text = r.text[(user.locale as Locale) in r.text ? (user.locale as Locale) : 'vi'];
  const expiresAt = r.expiresInDays ? new Date(Date.now() + r.expiresInDays * 86_400_000).toISOString() : null;
  const rows = (await tx.execute(sql`
    INSERT INTO mail_messages (user_id, kind, subject, body, attachments, created_by, expires_at, reward_key)
    VALUES (${r.userId}, ${r.kind}, ${text.subject}, ${text.body}, ${JSON.stringify(attachments)}::jsonb, ${r.actorId ?? null}, ${expiresAt}::timestamptz, ${r.key})
    ON CONFLICT (user_id, reward_key) WHERE reward_key IS NOT NULL DO NOTHING
    RETURNING id`)) as unknown as { id: string }[];
  return rows[0]?.id ?? null;
}
