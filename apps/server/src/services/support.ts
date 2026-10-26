import { SUPPORT_REOPEN_DAYS, type ServerMessage, type StaffTicketView, type SupportCategory, type SupportMessageView, type SupportStatus, type SupportTicketView } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { audit } from './audit';
import { userPermissions } from './rbac';

/**
 * Support Center tickets. A ticket is private to its player and to staff holding support.read
 * (reading) / support.reply (answering, status) — Support, Admin and above. Players see staff
 * replies as "Keyo Support"; staff names stay internal. Every staff status change is audited.
 */

export async function isSupportStaff(db: DbOrTx, userId: string, need: 'support.read' | 'support.reply' = 'support.read'): Promise<boolean> {
  const perms = await userPermissions(db, userId);
  return perms.includes('admin.access') && perms.includes(need);
}

type TicketRow = {
  id: string;
  user_id: string;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  last_staff_reply_at: string | null;
  last_player_reply_at: string | null;
  player_seen_at: string | null;
  staff_seen_at: string | null;
  last_message: string | null;
};

const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);
const after = (a: string | null, b: string | null) => !!a && (!b || new Date(a) > new Date(b));

function toView(r: TicketRow): SupportTicketView {
  return {
    id: r.id,
    category: r.category,
    subject: r.subject,
    status: r.status,
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    closedAt: iso(r.closed_at),
    unread: after(r.last_staff_reply_at, r.player_seen_at),
    lastMessage: r.last_message,
  };
}

const TICKET_COLUMNS = sql`t.id, t.user_id, t.category, t.subject, t.status, t.created_at, t.updated_at, t.closed_at,
  t.last_staff_reply_at, t.last_player_reply_at, t.player_seen_at, t.staff_seen_at,
  (SELECT left(m.body, 140) FROM support_ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message`;

export async function createTicket(db: Db, userId: string, input: { category: SupportCategory; subject: string; message: string }) {
  return db.transaction(async (tx) => {
    const [open] = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM support_tickets WHERE user_id = ${userId}::uuid AND status <> 'closed'`);
    if (open!.n >= 5) throw fail('too_many_attempts');
    const [t] = await tx.execute<{ id: string }>(sql`
      INSERT INTO support_tickets (user_id, category, subject, player_seen_at, staff_seen_at, last_player_reply_at)
      VALUES (${userId}::uuid, ${input.category}, ${input.subject}, now(), NULL, now()) RETURNING id`);
    await tx.execute(sql`INSERT INTO support_ticket_messages (ticket_id, author_id, body, from_staff) VALUES (${t!.id}::uuid, ${userId}::uuid, ${input.message}, false)`);
    return { id: t!.id };
  });
}

export async function myTickets(db: Db, userId: string): Promise<SupportTicketView[]> {
  const rows = await db.execute<TicketRow>(sql`SELECT ${TICKET_COLUMNS} FROM support_tickets t WHERE t.user_id = ${userId}::uuid ORDER BY t.updated_at DESC LIMIT 100`);
  return rows.map(toView);
}

export async function unreadTickets(db: Db, userId: string): Promise<number> {
  const [r] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM support_tickets
    WHERE user_id = ${userId}::uuid AND last_staff_reply_at IS NOT NULL AND (player_seen_at IS NULL OR last_staff_reply_at > player_seen_at)`);
  return r!.n;
}

async function loadTicket(db: DbOrTx, id: string, lock = false): Promise<TicketRow> {
  const [t] = await db.execute<TicketRow>(sql`SELECT ${TICKET_COLUMNS} FROM support_tickets t WHERE t.id = ${id}::uuid ${lock ? sql`FOR UPDATE OF t` : sql``}`);
  if (!t) throw fail('not_found');
  return t;
}

/** Access: the ticket's player, or support staff. Anyone else gets not_found (no existence leak). */
async function access(db: DbOrTx, userId: string, id: string, lock = false) {
  const t = await loadTicket(db, id, lock);
  if (t.user_id === userId) return { t, staff: false };
  if (await isSupportStaff(db, userId)) return { t, staff: true };
  throw fail('not_found');
}

export async function ticketDetail(db: Db, userId: string, id: string): Promise<{ ticket: SupportTicketView; messages: SupportMessageView[]; staff: boolean }> {
  const { t, staff } = await access(db, userId, id);
  const rows = await db.execute<{ id: string; from_staff: boolean; body: string; created_at: string; author_name: string; author_uid: number }>(sql`
    SELECT m.id, m.from_staff, m.body, m.created_at, u.display_name AS author_name, u.uid AS author_uid
    FROM support_ticket_messages m JOIN users u ON u.id = m.author_id
    WHERE m.ticket_id = ${id}::uuid ORDER BY m.created_at, m.id LIMIT 500`);
  await db.execute(staff ? sql`UPDATE support_tickets SET staff_seen_at = now() WHERE id = ${id}::uuid` : sql`UPDATE support_tickets SET player_seen_at = now() WHERE id = ${id}::uuid`);
  return {
    ticket: { ...toView(t), unread: false },
    messages: rows.map((m) => ({
      id: m.id,
      fromStaff: m.from_staff,
      author: m.from_staff ? (staff ? `Keyo Support · ${m.author_name} (#${m.author_uid})` : 'Keyo Support') : m.author_name,
      body: m.body,
      createdAt: iso(m.created_at)!,
    })),
    staff,
  };
}

const push = (hub: RealtimeHub, userId: string, ticketId: string) =>
  hub.sendToUser(userId, { type: 'event', event: 'support', data: { ticketId } } as unknown as ServerMessage);

export async function replyTicket(db: Db, hub: RealtimeHub, userId: string, id: string, message: string) {
  const { ownerId, staff } = await db.transaction(async (tx) => {
    const { t, staff } = await access(tx, userId, id, true);
    if (staff && !(await isSupportStaff(tx, userId, 'support.reply'))) throw fail('forbidden');
    if (t.status === 'closed') throw fail('ticket_closed');
    await tx.execute(sql`INSERT INTO support_ticket_messages (ticket_id, author_id, body, from_staff) VALUES (${id}::uuid, ${userId}::uuid, ${message}, ${staff})`);
    await tx.execute(
      staff
        ? sql`UPDATE support_tickets SET updated_at = now(), last_staff_reply_at = now(), staff_seen_at = now(), status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END, assigned_to = coalesce(assigned_to, ${userId}::uuid) WHERE id = ${id}::uuid`
        : sql`UPDATE support_tickets SET updated_at = now(), last_player_reply_at = now(), player_seen_at = now() WHERE id = ${id}::uuid`,
    );
    return { ownerId: t.user_id, staff };
  });
  if (staff) push(hub, ownerId, id);
}

/** Close (player or staff) or reopen (player within SUPPORT_REOPEN_DAYS, staff any time). */
export async function setTicketOpen(db: Db, hub: RealtimeHub, userId: string, id: string, open: boolean, ip?: string) {
  const { ownerId, staff } = await db.transaction(async (tx) => {
    const { t, staff } = await access(tx, userId, id, true);
    if (staff && !(await isSupportStaff(tx, userId, 'support.reply'))) throw fail('forbidden');
    if (open) {
      if (t.status !== 'closed') return { ownerId: t.user_id, staff };
      if (!staff && t.closed_at && Date.now() - new Date(t.closed_at).getTime() > SUPPORT_REOPEN_DAYS * 86_400_000) throw fail('ticket_closed');
      await tx.execute(sql`UPDATE support_tickets SET status = 'open', closed_at = NULL, updated_at = now() WHERE id = ${id}::uuid`);
    } else {
      if (t.status === 'closed') return { ownerId: t.user_id, staff };
      await tx.execute(sql`UPDATE support_tickets SET status = 'closed', closed_at = now(), updated_at = now() WHERE id = ${id}::uuid`);
    }
    if (staff) await audit(tx, { actorId: userId, action: open ? 'support.reopen' : 'support.close', targetType: 'ticket', targetId: id, ip });
    return { ownerId: t.user_id, staff };
  });
  if (staff) push(hub, ownerId, id);
}

// ---------------------------------------------------------------- staff queue

export async function staffTickets(db: Db, filter: { status?: SupportStatus; mine?: string; q?: string }): Promise<StaffTicketView[]> {
  const q = filter.q?.trim();
  const rows = await db.execute<TicketRow & { p_uid: number; p_name: string; a_uid: number | null; a_name: string | null }>(sql`
    SELECT ${TICKET_COLUMNS}, p.uid AS p_uid, p.display_name AS p_name, a.uid AS a_uid, a.display_name AS a_name
    FROM support_tickets t JOIN users p ON p.id = t.user_id LEFT JOIN users a ON a.id = t.assigned_to
    WHERE true
      ${filter.status ? sql`AND t.status = ${filter.status}` : sql``}
      ${filter.mine ? sql`AND t.assigned_to = ${filter.mine}::uuid` : sql``}
      ${q ? (/^\d+$/.test(q) ? sql`AND p.uid = ${Number(q)}` : sql`AND (t.subject ILIKE ${`%${q.replace(/[%_\\]/g, '\\$&')}%`} OR p.display_name ILIKE ${`%${q.replace(/[%_\\]/g, '\\$&')}%`})`) : sql``}
    ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, t.updated_at DESC
    LIMIT 200`);
  return rows.map((r) => ({
    ...toView(r),
    unread: false,
    player: { uid: Number(r.p_uid), displayName: r.p_name },
    assignee: r.a_uid === null ? null : { uid: Number(r.a_uid), displayName: r.a_name! },
    awaitingStaff: after(r.last_player_reply_at, r.staff_seen_at),
  }));
}

export async function assignTicket(db: Db, actorId: string, id: string, ip?: string) {
  await db.transaction(async (tx) => {
    await loadTicket(tx, id, true);
    await tx.execute(sql`UPDATE support_tickets SET assigned_to = ${actorId}::uuid, status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END, updated_at = now() WHERE id = ${id}::uuid`);
    await audit(tx, { actorId, action: 'support.assign', targetType: 'ticket', targetId: id, ip });
  });
}
