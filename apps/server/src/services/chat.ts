import { KEYO_SUPPORT_UID, SOCIAL_RULES, type ChatChannel, type ChatMessageView, type ConversationView, type ServerMessage } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { guildOf } from './guilds';
import { CARD_COLUMNS, CARD_JOIN, isFriend, toCard, visiblePlayer, type CardRow } from './social';

/**
 * One chat system with three channels, all persisted and pushed in real time:
 * - server: public to every signed-in player (moderators can remove messages and mute);
 * - guild: members of one guild only, pushed to its members; leaving a guild ends access;
 * - dm: two friends. Sending needs the friendship; reading your own history does not.
 * A chat mute (public_chat_mutes) silences a player in every channel. Each player can send one
 * message per channel every SOCIAL_RULES.chat.cooldownMs.
 */

type Row = CardRow & { id: string; body: string; created_at: string };
const view = (channel: ChatChannel, r: Row): ChatMessageView => ({ id: Number(r.id), channel, sender: toCard(r), body: r.body, createdAt: new Date(r.created_at).toISOString() });
const limit = SOCIAL_RULES.chat.history;
const cooldown = sql`make_interval(secs => ${SOCIAL_RULES.chat.cooldownMs / 1000})`;

const push = (hub: RealtimeHub, userId: string, data: ChatMessageView & { peerUid?: number }) =>
  hub.sendToUser(userId, { type: 'event', event: 'chatMessage', data } as unknown as ServerMessage);

async function assertCanSpeak(tx: DbOrTx, userId: string) {
  await tx.execute(sql`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`);
  const muted = await tx.execute(sql`SELECT 1 FROM public_chat_mutes WHERE user_id = ${userId}::uuid AND until_at > now()`);
  if (muted.length) throw fail('muted');
}

async function cardOf(db: DbOrTx, userId: string): Promise<CardRow> {
  const [r] = await db.execute<CardRow>(sql`SELECT ${CARD_COLUMNS} FROM users u ${CARD_JOIN} WHERE u.id = ${userId}::uuid`);
  return r!;
}

// ---------------------------------------------------------------- server

export async function serverHistory(db: Db, before?: number): Promise<ChatMessageView[]> {
  const rows = await db.execute<Row>(sql`
    SELECT m.id, m.body, m.created_at, ${CARD_COLUMNS}
    FROM public_chat_messages m JOIN users u ON u.id = m.user_id ${CARD_JOIN}
    WHERE m.deleted_at IS NULL ${before ? sql`AND m.id < ${before}` : sql``}
    ORDER BY m.id DESC LIMIT ${limit}`);
  return rows.reverse().map((r) => view('server', r));
}

export async function sendServer(db: Db, hub: RealtimeHub, userId: string, body: string): Promise<ChatMessageView> {
  const msg = await db.transaction(async (tx) => {
    await assertCanSpeak(tx, userId);
    const recent = await tx.execute(sql`SELECT 1 FROM public_chat_messages WHERE user_id = ${userId}::uuid AND created_at > now() - ${cooldown} LIMIT 1`);
    if (recent.length) throw fail('too_soon');
    const [row] = await tx.execute<{ id: string; created_at: string }>(sql`INSERT INTO public_chat_messages (user_id, body) VALUES (${userId}::uuid, ${body}) RETURNING id, created_at`);
    return view('server', { ...(await cardOf(tx, userId)), ...row!, body });
  });
  hub.broadcast({ type: 'event', event: 'chatMessage', data: msg } as unknown as ServerMessage);
  return msg;
}

export async function removeServerMessage(db: Db, hub: RealtimeHub, actorId: string, id: number) {
  const rows = await db.execute(sql`UPDATE public_chat_messages SET deleted_at = now(), deleted_by = ${actorId}::uuid WHERE id = ${id} AND deleted_at IS NULL RETURNING id`);
  if (!rows.length) throw fail('not_found');
  hub.broadcast({ type: 'event', event: 'chatRemoved', data: { id, channel: 'server' } } as unknown as ServerMessage);
}

// ---------------------------------------------------------------- guild

export async function guildHistory(db: Db, userId: string, before?: number): Promise<ChatMessageView[]> {
  const g = await guildOf(db, userId);
  if (!g) throw fail('not_in_guild');
  const rows = await db.execute<Row>(sql`
    SELECT c.id, c.body, c.created_at, ${CARD_COLUMNS}
    FROM guild_messages c JOIN users u ON u.id = c.user_id ${CARD_JOIN}
    WHERE c.guild_id = ${g.guildId}::uuid ${before ? sql`AND c.id < ${before}` : sql``}
    ORDER BY c.id DESC LIMIT ${limit}`);
  return rows.reverse().map((r) => view('guild', r));
}

export async function sendGuild(db: Db, hub: RealtimeHub, userId: string, body: string): Promise<ChatMessageView> {
  const { msg, members } = await db.transaction(async (tx) => {
    await assertCanSpeak(tx, userId);
    const g = await guildOf(tx, userId);
    if (!g) throw fail('not_in_guild');
    const recent = await tx.execute(sql`SELECT 1 FROM guild_messages WHERE user_id = ${userId}::uuid AND created_at > now() - ${cooldown} LIMIT 1`);
    if (recent.length) throw fail('too_soon');
    const [row] = await tx.execute<{ id: string; created_at: string }>(sql`INSERT INTO guild_messages (guild_id, user_id, body) VALUES (${g.guildId}::uuid, ${userId}::uuid, ${body}) RETURNING id, created_at`);
    return { msg: view('guild', { ...(await cardOf(tx, userId)), ...row!, body }), members: g.members };
  });
  for (const id of members) push(hub, id, msg);
  return msg;
}

// ---------------------------------------------------------------- private

export async function conversations(db: Db, hub: RealtimeHub, userId: string): Promise<ConversationView[]> {
  // Everyone I have talked with, plus every friend (so a new chat can be started from the list).
  const rows = await db.execute<CardRow & { last_body: string | null; last_at: string | null; last_from_me: boolean | null; unread: number; friend: boolean }>(sql`
    WITH peers AS (
      SELECT CASE WHEN sender_id = ${userId}::uuid THEN receiver_id ELSE sender_id END AS peer_id
      FROM direct_messages WHERE sender_id = ${userId}::uuid OR receiver_id = ${userId}::uuid
      UNION SELECT friend_id FROM friendships WHERE user_id = ${userId}::uuid
    )
    SELECT ${CARD_COLUMNS}, last.body AS last_body, last.created_at AS last_at, last.sender_id = ${userId}::uuid AS last_from_me,
      (SELECT count(*)::int FROM direct_messages d WHERE d.sender_id = u.id AND d.receiver_id = ${userId}::uuid AND d.read_at IS NULL) AS unread,
      EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = ${userId}::uuid AND f.friend_id = u.id) AS friend
    FROM peers p JOIN users u ON u.id = p.peer_id ${CARD_JOIN}
    LEFT JOIN LATERAL (
      SELECT d.body, d.created_at, d.sender_id FROM direct_messages d
      WHERE (d.sender_id = ${userId}::uuid AND d.receiver_id = u.id) OR (d.sender_id = u.id AND d.receiver_id = ${userId}::uuid)
      ORDER BY d.id DESC LIMIT 1
    ) last ON true
    WHERE u.account_type = 'player' AND u.status <> 'deleted' AND u.uid <> ${KEYO_SUPPORT_UID}
    ORDER BY last.created_at DESC NULLS LAST, u.display_name
    LIMIT 300`);
  const online = await hub.onlineAmong(rows.map((r) => r.user_id));
  return rows.map((r) => ({
    peer: toCard(r),
    online: online.has(r.user_id),
    friend: r.friend,
    lastBody: r.last_body,
    lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
    lastFromMe: !!r.last_from_me,
    unread: r.unread,
  }));
}

/** History with one player; marks their messages to me as read. */
export async function dmHistory(db: Db, hub: RealtimeHub, userId: string, uid: number, before?: number): Promise<ChatMessageView[]> {
  if (uid === KEYO_SUPPORT_UID) throw fail('protected_account');
  const other = await visiblePlayer(db, uid);
  const rows = await db.execute<Row>(sql`
    SELECT m.id, m.body, m.created_at, ${CARD_COLUMNS}
    FROM direct_messages m JOIN users u ON u.id = m.sender_id ${CARD_JOIN}
    WHERE ((m.sender_id = ${userId}::uuid AND m.receiver_id = ${other.user_id}::uuid) OR (m.sender_id = ${other.user_id}::uuid AND m.receiver_id = ${userId}::uuid))
      ${before ? sql`AND m.id < ${before}` : sql``}
    ORDER BY m.id DESC LIMIT ${limit}`);
  const read = await db.execute(sql`UPDATE direct_messages SET read_at = now() WHERE sender_id = ${other.user_id}::uuid AND receiver_id = ${userId}::uuid AND read_at IS NULL RETURNING id`);
  if (read.length) hub.sendToUser(userId, { type: 'event', event: 'social', data: { kind: 'dm_read' } } as never);
  return rows.reverse().map((r) => view('dm', r));
}

export async function sendDm(db: Db, hub: RealtimeHub, me: { id: string; uid: number }, uid: number, body: string): Promise<ChatMessageView> {
  if (uid === KEYO_SUPPORT_UID) throw fail('protected_account');
  const { msg, otherId } = await db.transaction(async (tx) => {
    await assertCanSpeak(tx, me.id);
    const other = await visiblePlayer(tx, uid);
    if (other.user_id === me.id) throw fail('bad_request');
    if (!(await isFriend(tx, me.id, other.user_id))) throw fail('not_friends');
    const recent = await tx.execute(sql`SELECT 1 FROM direct_messages WHERE sender_id = ${me.id}::uuid AND created_at > now() - ${cooldown} LIMIT 1`);
    if (recent.length) throw fail('too_soon');
    const [row] = await tx.execute<{ id: string; created_at: string }>(sql`
      INSERT INTO direct_messages (sender_id, receiver_id, body) VALUES (${me.id}::uuid, ${other.user_id}::uuid, ${body}) RETURNING id, created_at`);
    return { msg: view('dm', { ...(await cardOf(tx, me.id)), ...row!, body }), otherId: other.user_id };
  });
  push(hub, otherId, { ...msg, peerUid: me.uid });
  push(hub, me.id, { ...msg, peerUid: uid });
  return msg;
}

export async function unreadCounts(db: Db, userId: string): Promise<{ dm: number }> {
  const [row] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM direct_messages d JOIN users u ON u.id = d.sender_id
    WHERE d.receiver_id = ${userId}::uuid AND d.read_at IS NULL AND u.uid <> ${KEYO_SUPPORT_UID}`);
  return { dm: row!.n };
}
