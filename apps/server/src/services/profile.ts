import {
  DEFAULT_PRIVACY,
  KEYO_SUPPORT_UID,
  SOCIAL_RULES,
  type FollowListEntry,
  type PlayerProfileView,
  type PrivacyInput,
  type ProfilePrivacy,
  type RelationStatus,
  type SocialState,
} from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { giftShowcase } from './gifts';
import { playerGameStats } from './leaderboards';
import { playerAwards } from './rankingRewards';
import { rankBadges } from './rank';
import { blockedBetween, CARD_COLUMNS, CARD_JOIN, presenceOf, toCard, VISIBLE_PLAYER, visiblePlayer, type CardRow } from './social';

export { blockedBetween };

/**
 * Public profiles, follows, likes, blocks and privacy. Every response is built from an explicit
 * allowlist: no email, login data, IPs, Bank balances, transactions or tickets ever leave here.
 */

const iso = (v: string | Date) => new Date(v).toISOString();
const notify = (hub: RealtimeHub, userId: string, data: Record<string, unknown>) => hub.sendToUser(userId, { type: 'event', event: 'social', data } as never);

/** The other player for a social action: visible, active, not me, not blocked either way. Locks both rows in a fixed order. */
async function counterpart(tx: DbOrTx, me: { id: string; uid: number }, uid: number, opts: { allowBlocked?: boolean } = {}) {
  if (uid === me.uid) throw fail('self_social');
  const other = await visiblePlayer(tx, uid);
  if (other.status !== 'active') throw fail('not_found');
  const [first, second] = [me.id, other.user_id].sort();
  await tx.execute(sql`SELECT id FROM users WHERE id IN (${first}::uuid, ${second}::uuid) ORDER BY id FOR UPDATE`);
  if (!opts.allowBlocked && (await blockedBetween(tx, me.id, other.user_id))) throw fail('blocked');
  return other;
}

// ---------------------------------------------------------------- follows & likes

export async function follow(db: Db, hub: RealtimeHub, me: { id: string; uid: number }, uid: number): Promise<{ following: true; followers: number }> {
  const res = await db.transaction(async (tx) => {
    const other = await counterpart(tx, me, uid);
    const [{ n }] = (await tx.execute(sql`SELECT count(*)::int AS n FROM player_follows WHERE follower_id = ${me.id}::uuid`)) as unknown as [{ n: number }];
    const inserted = await tx.execute(sql`INSERT INTO player_follows (follower_id, followee_id) VALUES (${me.id}::uuid, ${other.user_id}::uuid) ON CONFLICT DO NOTHING RETURNING follower_id`);
    if (inserted.length && n >= SOCIAL_RULES.follow.maxFollowing) throw fail('follow_limit');
    return { otherId: other.user_id, isNew: inserted.length > 0 };
  });
  if (res.isNew) notify(hub, res.otherId, { kind: 'followed', uid: me.uid });
  return { following: true, followers: await countOf(db, 'player_follows', res.otherId) };
}

export async function unfollow(db: Db, me: { id: string; uid: number }, uid: number): Promise<{ following: false; followers: number }> {
  if (uid === me.uid) throw fail('self_social');
  const other = await visiblePlayer(db, uid);
  await db.execute(sql`DELETE FROM player_follows WHERE follower_id = ${me.id}::uuid AND followee_id = ${other.user_id}::uuid`);
  return { following: false, followers: await countOf(db, 'player_follows', other.user_id) };
}

export async function like(db: Db, hub: RealtimeHub, me: { id: string; uid: number }, uid: number): Promise<{ liked: true; likes: number }> {
  const res = await db.transaction(async (tx) => {
    const other = await counterpart(tx, me, uid);
    const inserted = await tx.execute(sql`INSERT INTO profile_likes (liker_id, profile_id) VALUES (${me.id}::uuid, ${other.user_id}::uuid) ON CONFLICT DO NOTHING RETURNING liker_id`);
    return { otherId: other.user_id, isNew: inserted.length > 0 };
  });
  if (res.isNew) notify(hub, res.otherId, { kind: 'liked', uid: me.uid });
  return { liked: true, likes: await countOf(db, 'profile_likes', res.otherId) };
}

export async function unlike(db: Db, me: { id: string; uid: number }, uid: number): Promise<{ liked: false; likes: number }> {
  if (uid === me.uid) throw fail('self_social');
  const other = await visiblePlayer(db, uid);
  await db.execute(sql`DELETE FROM profile_likes WHERE liker_id = ${me.id}::uuid AND profile_id = ${other.user_id}::uuid`);
  return { liked: false, likes: await countOf(db, 'profile_likes', other.user_id) };
}

/** Followers or likes of a player, counting visible players only. */
async function countOf(db: DbOrTx, table: 'player_follows' | 'profile_likes', userId: string): Promise<number> {
  const [row] =
    table === 'player_follows'
      ? await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM player_follows t JOIN users u ON u.id = t.follower_id WHERE t.followee_id = ${userId}::uuid AND ${VISIBLE_PLAYER}`)
      : await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM profile_likes t JOIN users u ON u.id = t.liker_id WHERE t.profile_id = ${userId}::uuid AND ${VISIBLE_PLAYER}`);
  return row!.n;
}

// ---------------------------------------------------------------- blocks

/** Blocks a player: ends friendship, pending requests and follows both ways. Likes stay as they were. */
export async function block(db: Db, hub: RealtimeHub, me: { id: string; uid: number }, uid: number): Promise<{ blocked: true }> {
  // Keyo Captain is everyone's permanent official friend: it cannot block or be blocked.
  if (uid === KEYO_SUPPORT_UID || me.uid === KEYO_SUPPORT_UID) throw fail('official_account');
  const otherId = await db.transaction(async (tx) => {
    const other = await counterpart(tx, me, uid, { allowBlocked: true });
    await tx.execute(sql`INSERT INTO player_blocks (blocker_id, blocked_id) VALUES (${me.id}::uuid, ${other.user_id}::uuid) ON CONFLICT DO NOTHING`);
    await tx.execute(sql`DELETE FROM friendships WHERE ${pairOf('user_id', 'friend_id', me.id, other.user_id)}`);
    await tx.execute(sql`DELETE FROM friend_requests WHERE ${pairOf('sender_id', 'receiver_id', me.id, other.user_id)}`);
    await tx.execute(sql`DELETE FROM player_follows WHERE ${pairOf('follower_id', 'followee_id', me.id, other.user_id)}`);
    return other.user_id;
  });
  notify(hub, otherId, { kind: 'removed', uid: me.uid });
  return { blocked: true };
}

const pairOf = (x: string, y: string, a: string, b: string) =>
  sql`((${sql.identifier(x)} = ${a}::uuid AND ${sql.identifier(y)} = ${b}::uuid) OR (${sql.identifier(x)} = ${b}::uuid AND ${sql.identifier(y)} = ${a}::uuid))`;

export async function unblock(db: Db, me: { id: string; uid: number }, uid: number): Promise<{ blocked: false }> {
  if (uid === me.uid) throw fail('self_social');
  const rows = await db.execute(sql`DELETE FROM player_blocks b USING users u WHERE b.blocked_id = u.id AND u.uid = ${uid} AND b.blocker_id = ${me.id}::uuid RETURNING b.blocked_id`);
  if (!rows.length) throw fail('not_found');
  return { blocked: false };
}

export async function blockedList(db: Db, meId: string) {
  const rows = await db.execute<CardRow & { created_at: string }>(sql`
    SELECT ${CARD_COLUMNS}, b.created_at FROM player_blocks b JOIN users u ON u.id = b.blocked_id ${CARD_JOIN}
    WHERE b.blocker_id = ${meId}::uuid ORDER BY b.created_at DESC`);
  return rows.map((r) => ({ ...toCard(r), since: iso(r.created_at) }));
}

// ---------------------------------------------------------------- privacy

type SettingsRow = { show_online: boolean; show_friends: boolean; show_collection: boolean; show_stats: boolean; show_gifts: boolean; showcase: string[] };

async function settingsOf(db: DbOrTx, userId: string): Promise<ProfilePrivacy & { showcase: string[] }> {
  const [r] = await db.execute<SettingsRow>(sql`SELECT show_online, show_friends, show_collection, show_stats, show_gifts, showcase FROM profile_settings WHERE user_id = ${userId}::uuid`);
  if (!r) return { ...DEFAULT_PRIVACY, showcase: [] };
  return { showOnline: r.show_online, showFriends: r.show_friends, showCollection: r.show_collection, showStats: r.show_stats, showGifts: r.show_gifts, showcase: r.showcase ?? [] };
}

export async function updatePrivacy(db: Db, userId: string, input: PrivacyInput): Promise<ProfilePrivacy & { showcase: string[] }> {
  return db.transaction(async (tx) => {
    const cur = await settingsOf(tx, userId);
    const next = { ...cur, ...input };
    if (input.showcase) {
      // Only items the player owns and can still use; duplicates dropped, order kept.
      const ids = [...new Set(input.showcase)];
      const owned = ids.length
        ? await tx.execute<{ id: string }>(sql`
            SELECT id::text FROM inventory_items WHERE user_id = ${userId}::uuid AND (expires_at IS NULL OR expires_at > now())
              AND id::text = ANY(string_to_array(${ids.join(',')}, ','))`)
        : [];
      const ok = new Set(owned.map((o) => o.id));
      if (ids.some((id) => !ok.has(id))) throw fail('not_owned');
      next.showcase = ids;
    }
    await tx.execute(sql`
      INSERT INTO profile_settings (user_id, show_online, show_friends, show_collection, show_stats, show_gifts, showcase, updated_at)
      VALUES (${userId}::uuid, ${next.showOnline}, ${next.showFriends}, ${next.showCollection}, ${next.showStats}, ${next.showGifts}, string_to_array(${next.showcase.join(',')}, ',')::uuid[], now())
      ON CONFLICT (user_id) DO UPDATE SET show_online = EXCLUDED.show_online, show_friends = EXCLUDED.show_friends,
        show_collection = EXCLUDED.show_collection, show_stats = EXCLUDED.show_stats, show_gifts = EXCLUDED.show_gifts, showcase = EXCLUDED.showcase, updated_at = now()`);
    return next;
  });
}

// ---------------------------------------------------------------- profile

export async function socialState(db: DbOrTx, meId: string, otherId: string): Promise<SocialState> {
  const [r] = await db.execute<SocialState & Record<string, unknown>>(sql`
    SELECT
      EXISTS (SELECT 1 FROM player_follows WHERE follower_id = ${meId}::uuid AND followee_id = ${otherId}::uuid) AS following,
      EXISTS (SELECT 1 FROM player_follows WHERE follower_id = ${otherId}::uuid AND followee_id = ${meId}::uuid) AS "followedBy",
      EXISTS (SELECT 1 FROM profile_likes WHERE liker_id = ${meId}::uuid AND profile_id = ${otherId}::uuid) AS liked,
      EXISTS (SELECT 1 FROM player_blocks WHERE blocker_id = ${meId}::uuid AND blocked_id = ${otherId}::uuid) AS blocked,
      EXISTS (SELECT 1 FROM player_blocks WHERE blocker_id = ${otherId}::uuid AND blocked_id = ${meId}::uuid) AS "blockedBy"`);
  return r!;
}

export async function playerProfile(db: Db, hub: RealtimeHub, meId: string, uid: number): Promise<PlayerProfileView> {
  const p = await visiblePlayer(db, uid);
  const self = p.user_id === meId;
  const [extra] = await db.execute<{
    created_at: string;
    relation: RelationStatus;
    guild_id: string | null;
    guild_name: string | null;
    emblem: string | null;
    color: string | null;
    silver: string | null;
    gold: string | null;
    vip_level: number;
    charm: string | null;
    followers: number;
    following: number;
    likes: number;
    friends: number;
  }>(sql`
    SELECT u.created_at,
      CASE WHEN u.id = ${meId}::uuid THEN 'self'
           WHEN u.uid = ${KEYO_SUPPORT_UID} THEN 'friend'
           WHEN EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = ${meId}::uuid AND f.friend_id = u.id) THEN 'friend'
           WHEN EXISTS (SELECT 1 FROM friend_requests r WHERE r.sender_id = ${meId}::uuid AND r.receiver_id = u.id) THEN 'outgoing'
           WHEN EXISTS (SELECT 1 FROM friend_requests r WHERE r.sender_id = u.id AND r.receiver_id = ${meId}::uuid) THEN 'incoming'
           ELSE 'none' END AS relation,
      g.id AS guild_id, g.name AS guild_name, g.emblem, g.color,
      -- Wallet only (outside the Bank). bank_accounts is never read for a profile.
      w.balance AS silver, w.gold,
      keyo_vip_level(vp.exp, vp.override_level, vp.override_until) AS vip_level,
      (SELECT total FROM charm_points c WHERE c.user_id = u.id) AS charm,
      (SELECT count(*)::int FROM player_follows f JOIN users x ON x.id = f.follower_id WHERE f.followee_id = u.id AND (x.account_type = 'player' OR x.uid = 1000) AND x.status <> 'deleted') AS followers,
      (SELECT count(*)::int FROM player_follows f JOIN users x ON x.id = f.followee_id WHERE f.follower_id = u.id AND (x.account_type = 'player' OR x.uid = 1000) AND x.status <> 'deleted') AS following,
      (SELECT count(*)::int FROM profile_likes l JOIN users x ON x.id = l.liker_id WHERE l.profile_id = u.id AND (x.account_type = 'player' OR x.uid = 1000) AND x.status <> 'deleted') AS likes,
      (SELECT count(*)::int FROM friendships f JOIN users x ON x.id = f.friend_id WHERE f.user_id = u.id AND x.account_type = 'player' AND x.status <> 'deleted' AND x.uid <> 1000) AS friends
    FROM users u
    LEFT JOIN wallets w ON w.user_id = u.id
    LEFT JOIN vip_progress vp ON vp.user_id = u.id
    LEFT JOIN guild_members m ON m.user_id = u.id
    LEFT JOIN guilds g ON g.id = m.guild_id AND g.disbanded_at IS NULL
    WHERE u.id = ${p.user_id}::uuid`);
  const privacy = await settingsOf(db, p.user_id);
  const show = (flag: keyof ProfilePrivacy) => self || privacy[flag];

  const [presence, social, ranks, achievements, gifts] = await Promise.all([
    show('showOnline') ? presenceOf(db, hub, [p.user_id]).then((s) => s.get(p.user_id) ?? 'offline') : Promise.resolve(null),
    self ? Promise.resolve({ following: false, followedBy: false, liked: false, blocked: false, blockedBy: false }) : socialState(db, meId, p.user_id),
    rankBadges(db, [p.user_id]),
    db.execute<{ achievement_id: string }>(sql`SELECT achievement_id FROM achievement_claims WHERE user_id = ${p.user_id}::uuid ORDER BY claimed_at`),
    show('showGifts') ? giftShowcase(db, p.user_id) : Promise.resolve(null),
  ]);
  const [gameStats, awards] = await Promise.all([show('showStats') ? playerGameStats(db, p.user_id) : Promise.resolve(null), playerAwards(db, p.user_id)]);

  let stats: PlayerProfileView['stats'] = null;
  if (show('showStats')) {
    const byGame = await db.execute<{ game: string; rounds: number; wins: number; losses: number; biggest: string | null }>(sql`
      SELECT game, count(*)::int AS rounds, count(*) FILTER (WHERE payout > bet)::int AS wins, count(*) FILTER (WHERE payout < bet)::int AS losses, max(payout) AS biggest
      FROM game_rounds WHERE user_id = ${p.user_id}::uuid AND status = 'settled' GROUP BY game ORDER BY count(*) DESC`);
    const sum = (k: 'rounds' | 'wins' | 'losses') => byGame.reduce((a, g) => a + g[k], 0);
    stats = {
      rounds: sum('rounds'),
      wins: sum('wins'),
      losses: sum('losses'),
      pushes: sum('rounds') - sum('wins') - sum('losses'),
      biggestWin: byGame.reduce((m, g) => Math.max(m, Number(g.biggest ?? 0)), 0),
      byGame: byGame.map((g) => ({ game: g.game, rounds: g.rounds, wins: g.wins, losses: g.losses })),
    };
  }

  let collection: PlayerProfileView['collection'] = null;
  if (show('showCollection')) {
    const items = await db.execute<{ id: string; item_id: string; kind: string }>(sql`
      SELECT DISTINCT ON (i.item_id) i.id::text, i.item_id, i.kind FROM inventory_items i
      WHERE i.user_id = ${p.user_id}::uuid AND (i.expires_at IS NULL OR i.expires_at > now())
      ORDER BY i.item_id, i.acquired_at`);
    const byInstance = new Map((await db.execute<{ id: string; item_id: string }>(sql`
      SELECT id::text, item_id FROM inventory_items WHERE user_id = ${p.user_id}::uuid AND (expires_at IS NULL OR expires_at > now())
        AND id::text = ANY(string_to_array(${privacy.showcase.join(',')}, ','))`)).map((r) => [r.id, r.item_id]));
    collection = {
      total: items.length,
      titles: items.filter((i) => i.kind === 'title').map((i) => i.item_id),
      items: items.slice(0, 60).map((i) => i.item_id),
      showcase: privacy.showcase.map((id) => byInstance.get(id)).filter((x): x is string => !!x),
    };
  }

  const rank = ranks.get(p.user_id);
  return {
    ...toCard(p),
    online: presence === null ? null : presence !== 'offline' || uid === KEYO_SUPPORT_UID,
    // Keyo Captain shows its official support status (online) unless it is actually seated at a table.
    presence: uid === KEYO_SUPPORT_UID && presence !== 'in_game' ? 'online' : presence,
    relation: extra!.relation,
    social,
    counts: { followers: extra!.followers, following: extra!.following, likes: extra!.likes, friends: show('showFriends') ? extra!.friends : null, charm: Number(extra!.charm ?? 0) },
    createdAt: iso(extra!.created_at),
    rank: rank ? { division: rank.division, rp: rank.rp, topTitle: rank.topTitle, topPosition: rank.position, wins: rank.wins, losses: rank.losses } : null,
    vip: { level: Number(extra!.vip_level) },
    guild: extra!.guild_id ? { id: extra!.guild_id, name: extra!.guild_name!, emblem: extra!.emblem as never, color: extra!.color as never } : null,
    wallet: { silver: Number(extra!.silver ?? 0), gold: Number(extra!.gold ?? 0) },
    stats,
    achievements: achievements.map((a) => a.achievement_id),
    gameStats,
    awards,
    collection,
    gifts,
    ...(self ? { privacy } : {}),
  };
}

/** Followers (`which = 'followers'`) or followed players of `uid`. */
export async function followList(db: Db, hub: RealtimeHub, uid: number, which: 'followers' | 'following', before?: string): Promise<FollowListEntry[]> {
  const p = await visiblePlayer(db, uid);
  const [mine, theirs] = which === 'followers' ? ['followee_id', 'follower_id'] : ['follower_id', 'followee_id'];
  const rows = await db.execute<CardRow & { created_at: string; show_online: boolean | null }>(sql`
    SELECT ${CARD_COLUMNS}, f.created_at, ps.show_online
    FROM player_follows f JOIN users u ON u.id = f.${sql.identifier(theirs)} ${CARD_JOIN}
    LEFT JOIN profile_settings ps ON ps.user_id = u.id
    WHERE f.${sql.identifier(mine)} = ${p.user_id}::uuid AND ${VISIBLE_PLAYER}
      ${before ? sql`AND f.created_at < ${before}::timestamptz` : sql``}
    ORDER BY f.created_at DESC LIMIT 50`);
  const online = await hub.onlineAmong(rows.map((r) => r.user_id));
  return rows.map((r) => ({ ...toCard(r), online: r.show_online === false ? null : online.has(r.user_id), since: iso(r.created_at) }));
}
