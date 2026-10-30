import {
  KEYO_SUPPORT_UID,
  SOCIAL_RULES,
  type FriendRequestView,
  type FriendView,
  type FriendsOverview,
  type GiftInput,
  type GiftsOverview,
  type GiftView,
  type PlayerCard,
  type PlayerSearchResult,
  type PresenceStatus,
  type RelationStatus,
} from '@casino/shared';
import { sql, type SQL } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { assetUrl } from './assets';
import { rankBadges } from './rank';
import { badgesOf } from './users';
import { applyDelta } from './wallet';

// ---------------------------------------------------------------- player cards

/** Columns describing how a player looks in lists and chat (`u` = users, `pp` = player_progress). */
export const CARD_COLUMNS = sql`u.id AS user_id, u.uid, u.display_name, u.avatar, u.avatar_item, u.frame, u.equipped_title, u.equipped_bubble, u.is_verified, u.is_partner, coalesce(pp.level, 1) AS level,
  cav.asset_id AS custom_avatar, keyo_vip_level(cvp.exp, cvp.override_level, cvp.override_until) AS vip_level,
  (SELECT pr.division FROM player_ranks pr JOIN rank_seasons rs ON rs.id = pr.season_id WHERE pr.user_id = u.id AND rs.status = 'active' LIMIT 1) AS rank_division`;
export const CARD_JOIN = sql`LEFT JOIN player_progress pp ON pp.user_id = u.id
  LEFT JOIN vip_progress cvp ON cvp.user_id = u.id
  LEFT JOIN avatar_uploads cav ON cav.user_id = u.id AND cav.status = 'active'`;
/**
 * Players other people may see and interact with (profile, follow, like, Gift Shop, rooms):
 * regular players plus Keyo Captain (UID 1000); never other system or deleted accounts.
 */
export const VISIBLE_PLAYER = sql`(u.account_type = 'player' OR u.uid = ${KEYO_SUPPORT_UID}) AND u.status <> 'deleted'`;
/** Keyo Captain is everybody's friend by design; friend lists and limits leave it out (it is added virtually). */
const NOT_CAPTAIN = sql`u.uid <> ${KEYO_SUPPORT_UID}`;

export type CardRow = {
  user_id: string;
  uid: number;
  display_name: string;
  avatar: number;
  avatar_item: string | null;
  frame: string;
  equipped_title: string | null;
  equipped_bubble: string | null;
  is_verified: boolean;
  is_partner: boolean;
  level: number;
  custom_avatar: string | null;
  vip_level: number;
  rank_division: number | null;
};

export function toCard(r: CardRow): PlayerCard {
  return {
    uid: Number(r.uid),
    displayName: r.display_name,
    avatar: r.avatar,
    avatarItem: r.avatar_item,
    frame: r.frame,
    title: r.equipped_title,
    bubble: r.equipped_bubble,
    badges: badgesOf({ isVerified: r.is_verified, isPartner: r.is_partner }),
    level: Number(r.level),
    customAvatar: r.custom_avatar ? assetUrl(r.custom_avatar) : null,
    vipLevel: Number(r.vip_level ?? 1),
    rank: r.rank_division === null || r.rank_division === undefined ? null : { division: Number(r.rank_division), topTitle: null },
  };
}

const iso = (v: string | Date) => new Date(v).toISOString();

/** An active, visible player by UID (locks the row when `lock`), or not_found. */
export async function visiblePlayer(db: DbOrTx, uid: number, lock = false): Promise<CardRow & { status: string }> {
  const rows = await db.execute<CardRow & { status: string }>(sql`
    SELECT ${CARD_COLUMNS}, u.status FROM users u ${CARD_JOIN}
    WHERE u.uid = ${uid} AND ${VISIBLE_PLAYER} ${lock ? sql`FOR UPDATE OF u` : sql``}
  `);
  if (!rows.length) throw fail('not_found');
  return rows[0]!;
}

async function areFriends(db: DbOrTx, a: string, b: string): Promise<{ since: Date } | null> {
  const rows = await db.execute<{ created_at: string }>(sql`SELECT created_at FROM friendships WHERE user_id = ${a}::uuid AND friend_id = ${b}::uuid`);
  return rows.length ? { since: new Date(rows[0]!.created_at) } : null;
}

/** Either player blocked the other. */
export async function blockedBetween(db: DbOrTx, a: string, b: string): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT 1 FROM player_blocks WHERE (blocker_id = ${a}::uuid AND blocked_id = ${b}::uuid) OR (blocker_id = ${b}::uuid AND blocked_id = ${a}::uuid) LIMIT 1`);
  return rows.length > 0;
}

export async function isFriend(db: DbOrTx, a: string, b: string): Promise<boolean> {
  return !!(await areFriends(db, a, b));
}

/** Online / in a game (seated at a card or Blackjack table) / offline. */
export async function presenceOf(db: DbOrTx, hub: RealtimeHub, userIds: readonly string[]): Promise<Map<string, PresenceStatus>> {
  const out = new Map<string, PresenceStatus>();
  if (!userIds.length) return out;
  const online = await hub.onlineAmong(userIds);
  const seated = await db.execute<{ user_id: string }>(sql`
    SELECT user_id FROM card_seats WHERE user_id::text = ANY(string_to_array(${userIds.join(',')}, ','))
    UNION SELECT user_id FROM bj_seats WHERE user_id::text = ANY(string_to_array(${userIds.join(',')}, ','))`);
  const playing = new Set(seated.map((r) => r.user_id));
  for (const id of userIds) out.set(id, online.has(id) ? (playing.has(id) ? 'in_game' : 'online') : 'offline');
  return out;
}

const notify = (hub: RealtimeHub, userId: string, data: Record<string, unknown>) =>
  hub.sendToUser(userId, { type: 'event', event: 'social', data } as never);

// ---------------------------------------------------------------- friends

/**
 * Keyo Captain as a virtual friend for every other account: no friendship row is needed, it is
 * not counted towards the friend limit and cannot be removed. Its presence is its official
 * support status (always reachable through the Support menu), shown as online; it does not change
 * any table's or room's real player counts. Keyo Captain itself does not see itself.
 */
async function captainFriend(db: DbOrTx, meId: string): Promise<FriendView | null> {
  const [r] = await db.execute<CardRow & { status: string }>(sql`
    SELECT ${CARD_COLUMNS}, u.status FROM users u ${CARD_JOIN} WHERE u.uid = ${KEYO_SUPPORT_UID} AND u.status <> 'deleted' AND u.id <> ${meId}::uuid`);
  if (!r) return null;
  const ranks = await rankBadges(db, [r.user_id]);
  const rank = ranks.get(r.user_id);
  return {
    ...toCard(r),
    rank: rank ? { division: rank.division, topTitle: rank.topTitle } : (toCard(r).rank ?? null),
    online: true,
    presence: 'online',
    since: new Date(0).toISOString(),
    giftable: false,
    official: true,
  };
}

export async function friendsOverview(db: Db, hub: RealtimeHub, meId: string): Promise<FriendsOverview> {
  const giftAfter = SOCIAL_RULES.gift.friendForHours;
  const [friends, incoming, outgoing] = await Promise.all([
    db.execute<CardRow & { since: string; giftable: boolean }>(sql`
      SELECT ${CARD_COLUMNS}, f.created_at AS since, f.created_at <= now() - make_interval(hours => ${giftAfter}) AS giftable
      FROM friendships f JOIN users u ON u.id = f.friend_id ${CARD_JOIN}
      WHERE f.user_id = ${meId}::uuid AND ${VISIBLE_PLAYER} AND ${NOT_CAPTAIN}
      ORDER BY u.display_name`),
    db.execute<CardRow & { created_at: string }>(sql`
      SELECT ${CARD_COLUMNS}, r.created_at FROM friend_requests r JOIN users u ON u.id = r.sender_id ${CARD_JOIN}
      WHERE r.receiver_id = ${meId}::uuid AND ${VISIBLE_PLAYER} AND ${NOT_CAPTAIN} ORDER BY r.created_at DESC`),
    db.execute<CardRow & { created_at: string }>(sql`
      SELECT ${CARD_COLUMNS}, r.created_at FROM friend_requests r JOIN users u ON u.id = r.receiver_id ${CARD_JOIN}
      WHERE r.sender_id = ${meId}::uuid AND ${VISIBLE_PLAYER} AND ${NOT_CAPTAIN} ORDER BY r.created_at DESC`),
  ]);
  const captain = await captainFriend(db, meId);
  const [presence, ranks] = await Promise.all([presenceOf(db, hub, friends.map((f) => f.user_id)), rankBadges(db, friends.map((f) => f.user_id))]);
  const request = (r: CardRow & { created_at: string }): FriendRequestView => ({ ...toCard(r), createdAt: iso(r.created_at) });
  const badge = (id: string) => {
    const r = ranks.get(id);
    return r ? { division: r.division, topTitle: r.topTitle } : null;
  };
  return {
    // Keyo Captain always comes first; it takes no friend slot and cannot be removed.
    friends: [
      ...(captain ? [captain] : []),
      ...friends
        .map((f) => {
          const status = presence.get(f.user_id) ?? 'offline';
          return { ...toCard(f), rank: badge(f.user_id), online: status !== 'offline', presence: status, since: iso(f.since), giftable: f.giftable };
        })
        .sort((a, b) => Number(b.online) - Number(a.online) || a.displayName.localeCompare(b.displayName)),
    ],
    incoming: incoming.map(request),
    outgoing: outgoing.map(request),
  };
}

/** Search by exact UID or by username / display-name prefix. */
export async function searchPlayers(db: Db, hub: RealtimeHub, meId: string, query: string): Promise<PlayerSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const where: SQL = /^\d{1,9}$/.test(q)
    ? sql`u.uid = ${Number(q)}`
    : sql`(u.username_lower LIKE ${`${q.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`} OR lower(u.display_name) LIKE ${`${q.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`})`;
  const rows = await db.execute<CardRow & { relation: RelationStatus }>(sql`
    SELECT ${CARD_COLUMNS},
      CASE WHEN u.id = ${meId}::uuid THEN 'self'
           WHEN u.uid = ${KEYO_SUPPORT_UID} THEN 'friend'
           WHEN EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = ${meId}::uuid AND f.friend_id = u.id) THEN 'friend'
           WHEN EXISTS (SELECT 1 FROM friend_requests r WHERE r.sender_id = ${meId}::uuid AND r.receiver_id = u.id) THEN 'outgoing'
           WHEN EXISTS (SELECT 1 FROM friend_requests r WHERE r.sender_id = u.id AND r.receiver_id = ${meId}::uuid) THEN 'incoming'
           ELSE 'none' END AS relation
    FROM users u ${CARD_JOIN}
    WHERE ${VISIBLE_PLAYER} AND u.status = 'active' AND ${where}
    ORDER BY u.uid LIMIT 20`);
  const online = await hub.onlineAmong(rows.map((r) => r.user_id));
  return rows.map((r) => ({ ...toCard(r), relation: r.relation, online: online.has(r.user_id) }));
}

async function friendCount(db: DbOrTx, userId: string) {
  const [row] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ${userId}::uuid AND ${VISIBLE_PLAYER} AND ${NOT_CAPTAIN}`);
  return row!.n;
}

async function makeFriends(db: DbOrTx, a: string, b: string) {
  if ((await friendCount(db, a)) >= SOCIAL_RULES.maxFriends || (await friendCount(db, b)) >= SOCIAL_RULES.maxFriends) throw fail('friend_limit');
  await db.execute(sql`INSERT INTO friendships (user_id, friend_id) VALUES (${a}::uuid, ${b}::uuid), (${b}::uuid, ${a}::uuid) ON CONFLICT DO NOTHING`);
  await db.execute(sql`DELETE FROM friend_requests WHERE (sender_id = ${a}::uuid AND receiver_id = ${b}::uuid) OR (sender_id = ${b}::uuid AND receiver_id = ${a}::uuid)`);
}

/** Sends a request; if the other player already asked me, we simply become friends. */
export async function sendFriendRequest(db: Db, hub: RealtimeHub, me: { id: string; uid: number }, uid: number): Promise<{ status: 'sent' | 'friends' }> {
  if (uid === me.uid) throw fail('self_social');
  // Keyo Captain is already everyone's friend; it does not send or receive requests.
  if (uid === KEYO_SUPPORT_UID) return { status: 'friends' };
  if (me.uid === KEYO_SUPPORT_UID) throw fail('official_account');
  const result = await db.transaction(async (tx) => {
    // Lock both accounts in a fixed order so crossing requests cannot deadlock or double-insert.
    const other = await visiblePlayer(tx, uid);
    if (other.status !== 'active') throw fail('not_found');
    const [first, second] = [me.id, other.user_id].sort();
    await tx.execute(sql`SELECT id FROM users WHERE id IN (${first}::uuid, ${second}::uuid) ORDER BY id FOR UPDATE`);
    if (await blockedBetween(tx, me.id, other.user_id)) throw fail('blocked');
    if (await areFriends(tx, me.id, other.user_id)) throw fail('already_owned');
    const reverse = await tx.execute(sql`SELECT 1 FROM friend_requests WHERE sender_id = ${other.user_id}::uuid AND receiver_id = ${me.id}::uuid`);
    if (reverse.length) {
      await makeFriends(tx, me.id, other.user_id);
      return { status: 'friends' as const, otherId: other.user_id };
    }
    const [pending] = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM friend_requests WHERE sender_id = ${me.id}::uuid`);
    if (pending!.n >= SOCIAL_RULES.maxPendingRequests) throw fail('friend_limit');
    if ((await friendCount(tx, me.id)) >= SOCIAL_RULES.maxFriends) throw fail('friend_limit');
    await tx.execute(sql`INSERT INTO friend_requests (sender_id, receiver_id) VALUES (${me.id}::uuid, ${other.user_id}::uuid) ON CONFLICT DO NOTHING`);
    return { status: 'sent' as const, otherId: other.user_id };
  });
  notify(hub, result.otherId, { kind: result.status === 'friends' ? 'accepted' : 'request', uid: me.uid });
  return { status: result.status };
}

export async function acceptFriendRequest(db: Db, hub: RealtimeHub, me: { id: string; uid: number }, uid: number) {
  if (uid === KEYO_SUPPORT_UID || me.uid === KEYO_SUPPORT_UID) throw fail('official_account');
  const otherId = await db.transaction(async (tx) => {
    const other = await visiblePlayer(tx, uid);
    const [first, second] = [me.id, other.user_id].sort();
    await tx.execute(sql`SELECT id FROM users WHERE id IN (${first}::uuid, ${second}::uuid) ORDER BY id FOR UPDATE`);
    const pending = await tx.execute(sql`SELECT 1 FROM friend_requests WHERE sender_id = ${other.user_id}::uuid AND receiver_id = ${me.id}::uuid`);
    if (!pending.length) throw fail('not_found');
    if (await blockedBetween(tx, me.id, other.user_id)) throw fail('blocked');
    await makeFriends(tx, me.id, other.user_id);
    return other.user_id;
  });
  notify(hub, otherId, { kind: 'accepted', uid: me.uid });
}

/** Declines an incoming request (`incoming`) or withdraws my own (`outgoing`). */
export async function dropFriendRequest(db: Db, meId: string, uid: number, which: 'incoming' | 'outgoing') {
  const other = await visiblePlayer(db, uid);
  const [sender, receiver] = which === 'incoming' ? [other.user_id, meId] : [meId, other.user_id];
  const rows = await db.execute(sql`DELETE FROM friend_requests WHERE sender_id = ${sender}::uuid AND receiver_id = ${receiver}::uuid RETURNING sender_id`);
  if (!rows.length) throw fail('not_found');
}

export async function removeFriend(db: Db, hub: RealtimeHub, me: { id: string; uid: number }, uid: number) {
  if (uid === KEYO_SUPPORT_UID) throw fail('official_account');
  const other = await visiblePlayer(db, uid);
  const rows = await db.execute(sql`
    DELETE FROM friendships WHERE (user_id = ${me.id}::uuid AND friend_id = ${other.user_id}::uuid) OR (user_id = ${other.user_id}::uuid AND friend_id = ${me.id}::uuid)
    RETURNING user_id`);
  if (!rows.length) throw fail('not_found');
  notify(hub, other.user_id, { kind: 'removed', uid: me.uid });
}

// ---------------------------------------------------------------- gifts

/** Sum and count of gifts the player sent since the start of the server day (UTC). */
async function sentToday(db: DbOrTx, userId: string) {
  const [row] = await db.execute<{ silver: string; count: number }>(sql`
    SELECT coalesce(sum(amount) FILTER (WHERE kind = 'silver'), 0) AS silver, count(*)::int AS count
    FROM gift_transfers WHERE sender_id = ${userId}::uuid AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
  return { silver: Number(row!.silver), count: row!.count };
}

/** Collectibles that may change hands: tradable, released, permanent or not expired, not on the market. */
const GIFTABLE_ITEM = sql`
  i.kind = 'collectible' AND c.tradable = true AND c.status = 'released'
  AND (i.expires_at IS NULL OR i.expires_at > now())
  AND NOT EXISTS (SELECT 1 FROM market_listings ml WHERE ml.instance_id = i.id AND ml.status = 'active')`;

export async function giftsOverview(db: Db, meId: string): Promise<GiftsOverview> {
  const [history, items, today] = await Promise.all([
    db.execute<{ id: string; sender_id: string; kind: 'silver' | 'item'; amount: string; item_id: string | null; message: string; created_at: string; other_uid: number; other_name: string }>(sql`
      SELECT g.id, g.sender_id, g.kind, g.amount, g.item_id, g.message, g.created_at, o.uid AS other_uid, o.display_name AS other_name
      FROM gift_transfers g JOIN users o ON o.id = CASE WHEN g.sender_id = ${meId}::uuid THEN g.receiver_id ELSE g.sender_id END
      WHERE g.sender_id = ${meId}::uuid OR g.receiver_id = ${meId}::uuid
      ORDER BY g.created_at DESC LIMIT 50`),
    db.execute<{ id: string; item_id: string; acquired_at: string }>(sql`
      SELECT i.id, i.item_id, i.acquired_at FROM inventory_items i JOIN catalog_items c ON c.id = i.item_id
      WHERE i.user_id = ${meId}::uuid AND ${GIFTABLE_ITEM} ORDER BY i.acquired_at DESC LIMIT 200`),
    sentToday(db, meId),
  ]);
  return {
    history: history.map(
      (g): GiftView => ({
        id: g.id,
        direction: g.sender_id === meId ? 'sent' : 'received',
        other: { uid: Number(g.other_uid), displayName: g.other_name },
        kind: g.kind,
        amount: Number(g.amount),
        itemId: g.item_id,
        message: g.message,
        createdAt: iso(g.created_at),
      }),
    ),
    items: items.map((i) => ({ instanceId: i.id, itemId: i.item_id, acquiredAt: iso(i.acquired_at) })),
    today,
  };
}

/**
 * Sends a gift to a friend in one transaction: the sender's Cxu Bạc or item leaves and arrives at
 * the receiver together, or nothing happens. The client-chosen id makes retries safe: the same id
 * with the same content replays the result, with different content it is refused.
 */
export async function sendGift(db: Db, hub: RealtimeHub, me: { id: string; uid: number }, input: GiftInput) {
  const rules = SOCIAL_RULES.gift;
  if (input.uid === me.uid) throw fail('bad_request');
  // Cxu and items never move to or from the official account outside the Gift Shop (no back channel).
  if (input.uid === KEYO_SUPPORT_UID || me.uid === KEYO_SUPPORT_UID) throw fail('official_account');
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${me.id}::uuid FOR UPDATE`);
    const prior = await tx.execute<{ sender_id: string; receiver_uid: number; kind: string; amount: string; item_instance_id: string | null }>(sql`
      SELECT g.sender_id, u.uid AS receiver_uid, g.kind, g.amount, g.item_instance_id FROM gift_transfers g JOIN users u ON u.id = g.receiver_id WHERE g.id = ${input.id}::uuid`);
    if (prior.length) {
      const p = prior[0]!;
      const same =
        p.sender_id === me.id &&
        Number(p.receiver_uid) === input.uid &&
        p.kind === input.kind &&
        (input.kind === 'silver' ? Number(p.amount) === input.amount : p.item_instance_id === input.instanceId);
      if (!same) throw fail('idempotency_conflict');
      return { replayed: true, receiverId: null as string | null };
    }
    const other = await visiblePlayer(tx, input.uid);
    if (other.status !== 'active') throw fail('not_found');
    const friendship = await areFriends(tx, me.id, other.user_id);
    if (!friendship) throw fail('not_friends');
    if (Date.now() - friendship.since.getTime() < rules.friendForHours * 3_600_000) throw fail('gift_too_soon');
    const today = await sentToday(tx, me.id);
    if (today.count >= rules.dailyCount) throw fail('gift_limit');
    const ref = `gift:${input.id}`;
    if (input.kind === 'silver') {
      if (today.silver + input.amount > rules.dailySilver) throw fail('gift_limit');
      await applyDelta(tx, me.id, -input.amount, 'gift_sent', null, 'silver', ref);
      await applyDelta(tx, other.user_id, input.amount, 'gift_received', null, 'silver', ref);
      await tx.execute(sql`
        INSERT INTO gift_transfers (id, sender_id, receiver_id, kind, amount, message)
        VALUES (${input.id}::uuid, ${me.id}::uuid, ${other.user_id}::uuid, 'silver', ${input.amount}, ${input.message})`);
    } else {
      const items = await tx.execute<{ item_id: string }>(sql`
        SELECT i.item_id FROM inventory_items i JOIN catalog_items c ON c.id = i.item_id
        WHERE i.id = ${input.instanceId}::uuid AND i.user_id = ${me.id}::uuid AND ${GIFTABLE_ITEM}
        FOR UPDATE OF i`);
      if (!items.length) throw fail('item_not_tradable');
      await tx.execute(sql`
        UPDATE inventory_items SET user_id = ${other.user_id}::uuid, source = 'gift', source_ref = ${ref}, acquired_at = now()
        WHERE id = ${input.instanceId}::uuid`);
      await tx.execute(sql`
        INSERT INTO gift_transfers (id, sender_id, receiver_id, kind, amount, item_instance_id, item_id, message)
        VALUES (${input.id}::uuid, ${me.id}::uuid, ${other.user_id}::uuid, 'item', 1, ${input.instanceId}::uuid, ${items[0]!.item_id}, ${input.message})`);
    }
    return { replayed: false, receiverId: other.user_id };
  });
  if (result.receiverId) notify(hub, result.receiverId, { kind: 'gift', uid: me.uid });
  return { replayed: result.replayed };
}
