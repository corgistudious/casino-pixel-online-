import { KEYO_SUPPORT_UID, type MailAttachment, type MailKind, type MailMessage } from '@casino/shared';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '../db/client';
import { mailBatches, mailMessages, users } from '../db/schema';
import { fail } from '../errors';
import { audit } from './audit';
import { grantItem, itemsExist } from './catalog';
import { applyDelta, getWallet } from './wallet';

type MailRow = typeof mailMessages.$inferSelect;

export function toMail(row: MailRow): MailMessage {
  return {
    id: row.id,
    kind: row.kind as MailKind,
    subject: row.subject,
    body: row.body,
    attachments: row.attachments as MailAttachment[],
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    claimResult: (row.claimResult as MailMessage['claimResult']) ?? null,
  };
}

/** Expired mail stays visible this long (attachments can no longer be claimed), then drops out of the list. */
const EXPIRED_VISIBLE_DAYS = 30;

const visible = (userId: string) =>
  and(
    eq(mailMessages.userId, userId),
    isNull(mailMessages.deletedAt),
    sql`(${mailMessages.expiresAt} IS NULL OR ${mailMessages.expiresAt} > now() - make_interval(days => ${EXPIRED_VISIBLE_DAYS}))`,
  );

export async function listMail(db: DbOrTx, userId: string, limit = 100): Promise<MailMessage[]> {
  const rows = await db.select().from(mailMessages).where(visible(userId)).orderBy(desc(mailMessages.createdAt)).limit(limit);
  return rows.map(toMail);
}

export async function unreadCount(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<string>`count(*)` })
    .from(mailMessages)
    .where(and(visible(userId), isNull(mailMessages.readAt)));
  return Number(row?.n ?? 0);
}

export async function markRead(db: Db, userId: string, mailId: string): Promise<MailMessage> {
  const [row] = await db
    .update(mailMessages)
    .set({ readAt: sql`coalesce(${mailMessages.readAt}, now())` })
    .where(and(eq(mailMessages.id, mailId), eq(mailMessages.userId, userId), isNull(mailMessages.deletedAt)))
    .returning();
  if (!row) throw fail('not_found');
  return toMail(row);
}

/**
 * Claims one mail's attachments. The row is locked and `claimed_at` set in the same transaction
 * as the ledger entries and item grants, so a retry (double tap, reconnect) can never pay twice
 * and a dropped connection never loses the reward: either everything committed or nothing did.
 */
async function claimInTx(tx: Tx, userId: string, mailId: string) {
  const [mail] = await tx
    .select()
    .from(mailMessages)
    .where(and(eq(mailMessages.id, mailId), eq(mailMessages.userId, userId), isNull(mailMessages.deletedAt)))
    .for('update');
  if (!mail) throw fail('not_found');
  if (mail.claimedAt) throw fail('mail_claimed');
  if (mail.expiresAt && mail.expiresAt <= new Date()) throw fail('mail_expired');
  const attachments = mail.attachments as MailAttachment[];
  if (!attachments.length) throw fail('bad_request', 'nothing to claim');
  const ref = `mail:${mail.id}`;
  const result: { index: number; outcome: 'granted' | 'already_owned' }[] = [];
  for (const [index, a] of attachments.entries()) {
    if (a.type === 'item') {
      result.push({ index, outcome: await grantItem(tx, userId, a.itemId, 'mail', ref) });
    } else {
      await applyDelta(tx, userId, a.amount, 'mail', null, a.type, ref);
      result.push({ index, outcome: 'granted' });
    }
  }
  const [updated] = await tx
    .update(mailMessages)
    .set({ claimedAt: new Date(), readAt: mail.readAt ?? new Date(), claimResult: result })
    .where(eq(mailMessages.id, mail.id))
    .returning();
  return toMail(updated!);
}

export async function claimMail(db: Db, userId: string, mailId: string) {
  const mail = await db.transaction((tx) => claimInTx(tx, userId, mailId));
  return { mail, wallet: await getWallet(db, userId) };
}

/** Claims every claimable mail; each one in its own transaction so one bad mail does not block the rest. */
export async function claimAll(db: Db, userId: string) {
  const open = await db
    .select({ id: mailMessages.id })
    .from(mailMessages)
    .where(
      and(
        visible(userId),
        isNull(mailMessages.claimedAt),
        sql`jsonb_array_length(${mailMessages.attachments}) > 0`,
        sql`(${mailMessages.expiresAt} IS NULL OR ${mailMessages.expiresAt} > now())`,
      ),
    );
  const claimed: MailMessage[] = [];
  for (const { id } of open) {
    try {
      claimed.push(await db.transaction((tx) => claimInTx(tx, userId, id)));
    } catch (err) {
      // Claimed concurrently (another device) or expired in between: skip it.
      if (!(err instanceof Error && 'code' in err && ['mail_claimed', 'mail_expired'].includes((err as { code: string }).code))) throw err;
    }
  }
  return { claimed, wallet: await getWallet(db, userId) };
}

/** Hides a mail. Mail with unclaimed, still-claimable attachments cannot be deleted (no accidental loss). */
export async function deleteMail(db: Db, userId: string, mailId: string) {
  const [row] = await db
    .update(mailMessages)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(mailMessages.id, mailId),
        eq(mailMessages.userId, userId),
        isNull(mailMessages.deletedAt),
        sql`(${mailMessages.claimedAt} IS NOT NULL OR jsonb_array_length(${mailMessages.attachments}) = 0 OR (${mailMessages.expiresAt} IS NOT NULL AND ${mailMessages.expiresAt} <= now()))`,
      ),
    )
    .returning({ id: mailMessages.id });
  if (!row) throw fail('bad_request', 'claim the attachments first');
}

export interface SendMailInput {
  target: { uids: number[] } | { all: true };
  kind: MailKind;
  subject: string;
  body: string;
  attachments: MailAttachment[];
  expiresInDays: number | null;
}

/**
 * Sends one mail per recipient in a single transaction (INSERT … SELECT for "all"), recorded as a
 * batch and audited. Attachments are only promises here: the ledger moves when each player claims.
 */
export async function sendMail(tx: Tx, actorId: string, input: SendMailInput, ip?: string) {
  const itemIds = [...new Set(input.attachments.flatMap((a) => (a.type === 'item' ? [a.itemId] : [])))];
  const known = await itemsExist(tx, itemIds);
  const missing = itemIds.filter((id) => !known.has(id));
  if (missing.length) throw fail('item_not_found', missing.join(', '));
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null;

  let recipients: string[] | null = null;
  if ('uids' in input.target) {
    const uids = [...new Set(input.target.uids)];
    const rows = await tx
      .select({ id: users.id, uid: users.uid })
      .from(users)
      .where(and(inArray(users.uid, uids), eq(users.accountType, 'player'), sql`${users.status} <> 'deleted'`));
    const found = new Set(rows.map((r) => r.uid));
    const unknown = uids.filter((u) => !found.has(u));
    if (unknown.length) throw fail('not_found', `unknown UID(s): ${unknown.join(', ')}`);
    recipients = rows.map((r) => r.id);
  }

  const [batch] = await tx
    .insert(mailBatches)
    .values({
      createdBy: actorId,
      kind: input.kind,
      subject: input.subject,
      body: input.body,
      attachments: input.attachments,
      target: 'uids' in input.target ? { uids: input.target.uids } : { all: true },
      recipients: 0,
      expiresAt,
    })
    .returning();
  const attachmentsJson = JSON.stringify(input.attachments);
  // Players only: system accounts (Keyo Support) and deleted accounts never receive mail.
  const inserted = await tx.execute(sql`
    INSERT INTO mail_messages (user_id, kind, subject, body, attachments, batch_id, created_by, expires_at)
    SELECT u.id, ${input.kind}, ${input.subject}, ${input.body}, ${attachmentsJson}::jsonb, ${batch!.id}, ${actorId}, ${expiresAt?.toISOString() ?? null}::timestamptz
    FROM users u
    WHERE u.account_type = 'player' AND u.status <> 'deleted' AND u.uid <> ${KEYO_SUPPORT_UID}
      ${recipients ? sql`AND u.id IN (${sql.join(recipients.map((id) => sql`${id}`), sql`, `)})` : sql``}`);
  const count = inserted.count;
  await tx.update(mailBatches).set({ recipients: count }).where(eq(mailBatches.id, batch!.id));
  await audit(tx, {
    actorId,
    action: 'mail.send',
    targetType: 'mail_batch',
    targetId: batch!.id,
    details: { kind: input.kind, subject: input.subject, attachments: input.attachments, recipients: count, target: 'uids' in input.target ? input.target.uids : 'all' },
    ip,
  });
  return { batchId: batch!.id, recipients: count, recipientIds: recipients };
}

export async function listBatches(db: DbOrTx, limit = 50) {
  return db
    .select({
      id: mailBatches.id,
      kind: mailBatches.kind,
      subject: mailBatches.subject,
      attachments: mailBatches.attachments,
      target: mailBatches.target,
      recipients: mailBatches.recipients,
      expiresAt: mailBatches.expiresAt,
      createdAt: mailBatches.createdAt,
      senderUid: users.uid,
      senderName: users.username,
      claimed: sql<string>`(SELECT count(*) FROM mail_messages m WHERE m.batch_id = ${mailBatches.id} AND m.claimed_at IS NOT NULL)`,
    })
    .from(mailBatches)
    .leftJoin(users, eq(users.id, mailBatches.createdBy))
    .orderBy(desc(mailBatches.createdAt))
    .limit(limit);
}
