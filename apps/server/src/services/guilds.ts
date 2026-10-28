import { guildTier, SOCIAL_RULES, type GuildInviteView, type GuildLogEntry, type GuildRole, type GuildSummary, type MyGuild } from '@casino/shared';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { verifyPassword } from '../auth/password';
import type { Db, DbOrTx } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { guildCreateSchema, guildUpdateSchema } from '@casino/shared';
import { CARD_COLUMNS, CARD_JOIN, presenceOf, toCard, visiblePlayer, type CardRow } from './social';
import { applyDelta } from './wallet';

/**
 * Guilds: Owner → Officers → Members.
 * - Owner: everything, including transfer (password-confirmed) and disband (password + name).
 * - Officer: invite, remove members (not officers), edit description and look.
 * - Member: chat, leave.
 * A guild is never deleted: disbanding keeps the row, its history and its chat, frees the name and
 * removes the memberships. When the owner's account is deleted or banned for more than 30 days the
 * guild passes to the longest-serving officer, else the longest-serving member, else it disbands.
 */

/** A ban this long (or permanent) means the owner cannot lead the guild any more. */
const SUCCESSION_BAN_DAYS = 30;

type GuildRow = {
  id: string;
  name: string;
  description: string;
  emblem: GuildSummary['emblem'];
  color: GuildSummary['color'];
  points: string;
  join_policy: GuildSummary['joinPolicy'];
  max_members: number;
  owner_id: string;
  owner_uid: number;
  owner_name: string;
  members: number;
  rank: number;
};

const SUMMARY = sql`
  SELECT g.id, g.name, g.description, g.emblem, g.color, g.points, g.join_policy, g.max_members, g.owner_id,
         o.uid AS owner_uid, o.display_name AS owner_name,
         (SELECT count(*)::int FROM guild_members m WHERE m.guild_id = g.id) AS members,
         (SELECT count(*)::int + 1 FROM guilds x WHERE x.disbanded_at IS NULL AND (x.points > g.points OR (x.points = g.points AND x.created_at < g.created_at))) AS rank
  FROM guilds g JOIN users o ON o.id = g.owner_id`;

function toSummary(r: GuildRow): GuildSummary {
  const points = Number(r.points);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    emblem: r.emblem,
    color: r.color,
    points,
    tier: guildTier(points),
    members: Number(r.members),
    maxMembers: r.max_members,
    joinPolicy: r.join_policy,
    owner: { uid: Number(r.owner_uid), displayName: r.owner_name },
    rank: Number(r.rank),
  };
}

const notify = (hub: RealtimeHub, userId: string, data: Record<string, unknown>) =>
  hub.sendToUser(userId, { type: 'event', event: 'social', data } as never);

async function log(db: DbOrTx, guildId: string, actorId: string | null, action: string, targetId: string | null = null, details: unknown = null) {
  await db.execute(sql`
    INSERT INTO guild_log (guild_id, actor_id, action, target_id, details)
    VALUES (${guildId}::uuid, ${actorId}, ${action}, ${targetId}, ${details === null ? null : JSON.stringify(details)}::jsonb)`);
}

async function memberIds(db: DbOrTx, guildId: string): Promise<string[]> {
  const rows = await db.execute<{ user_id: string }>(sql`SELECT user_id FROM guild_members WHERE guild_id = ${guildId}::uuid`);
  return rows.map((r) => r.user_id);
}

/** My membership, locking the guild row (and failing on disbanded guilds). */
async function membership(db: DbOrTx, userId: string) {
  const rows = await db.execute<{ guild_id: string; role: GuildRole }>(sql`
    SELECT m.guild_id, m.role FROM guild_members m JOIN guilds g ON g.id = m.guild_id
    WHERE m.user_id = ${userId}::uuid AND g.disbanded_at IS NULL`);
  if (!rows.length) throw fail('not_in_guild');
  await db.execute(sql`SELECT id FROM guilds WHERE id = ${rows[0]!.guild_id}::uuid FOR UPDATE`);
  // Re-read under the lock: a concurrent kick or transfer may have changed it.
  const [m] = await db.execute<{ guild_id: string; role: GuildRole }>(sql`SELECT guild_id, role FROM guild_members WHERE user_id = ${userId}::uuid`);
  if (!m || m.guild_id !== rows[0]!.guild_id) throw fail('not_in_guild');
  return m;
}

/** A member of my guild by UID. */
async function memberByUid(db: DbOrTx, guildId: string, uid: number) {
  const rows = await db.execute<{ user_id: string; role: GuildRole; status: string }>(sql`
    SELECT m.user_id, m.role, u.status FROM guild_members m JOIN users u ON u.id = m.user_id
    WHERE m.guild_id = ${guildId}::uuid AND u.uid = ${uid}`);
  if (!rows.length) throw fail('not_in_guild');
  return rows[0]!;
}

async function disband(db: DbOrTx, guildId: string, actorId: string | null, reason: string) {
  await db.execute(sql`DELETE FROM guild_invites WHERE guild_id = ${guildId}::uuid`);
  await db.execute(sql`DELETE FROM guild_members WHERE guild_id = ${guildId}::uuid`);
  await db.execute(sql`UPDATE guilds SET disbanded_at = now() WHERE id = ${guildId}::uuid`);
  await log(db, guildId, actorId, 'disband', null, { reason });
}

/**
 * Keeps the guild leadable: removes deleted accounts, and hands the guild on when the owner is
 * deleted or banned long-term (see the module comment). Safe to call on every read.
 */
export async function repairGuild(db: Db, guildId: string): Promise<void> {
  const needs = await db.execute<{ x: number }>(sql`
    SELECT 1 AS x FROM guilds g JOIN users o ON o.id = g.owner_id
    WHERE g.id = ${guildId}::uuid AND g.disbanded_at IS NULL AND (
      o.status = 'deleted'
      OR NOT EXISTS (SELECT 1 FROM guild_members m WHERE m.guild_id = g.id AND m.user_id = g.owner_id AND m.role = 'owner')
      OR EXISTS (SELECT 1 FROM bans b WHERE b.user_id = o.id AND b.revoked_at IS NULL AND b.starts_at <= now()
                 AND (b.ends_at IS NULL OR b.ends_at > now() + make_interval(days => ${SUCCESSION_BAN_DAYS})))
      OR EXISTS (SELECT 1 FROM guild_members m JOIN users u ON u.id = m.user_id WHERE m.guild_id = g.id AND u.status = 'deleted')
    )`);
  if (!needs.length) return;
  await db.transaction(async (tx) => {
    const [g] = await tx.execute<{ owner_id: string; disbanded_at: string | null }>(sql`SELECT owner_id, disbanded_at FROM guilds WHERE id = ${guildId}::uuid FOR UPDATE`);
    if (!g || g.disbanded_at) return;
    const gone = await tx.execute<{ user_id: string }>(sql`
      DELETE FROM guild_members m USING users u WHERE m.guild_id = ${guildId}::uuid AND u.id = m.user_id AND u.status = 'deleted' RETURNING m.user_id`);
    for (const r of gone) await log(tx, guildId, null, 'removed_deleted', r.user_id);
    const ownerOk = await tx.execute(sql`
      SELECT 1 FROM guild_members m JOIN users u ON u.id = m.user_id
      WHERE m.guild_id = ${guildId}::uuid AND m.user_id = ${g.owner_id}::uuid AND m.role = 'owner' AND u.status <> 'deleted'
        AND NOT EXISTS (SELECT 1 FROM bans b WHERE b.user_id = u.id AND b.revoked_at IS NULL AND b.starts_at <= now()
                        AND (b.ends_at IS NULL OR b.ends_at > now() + make_interval(days => ${SUCCESSION_BAN_DAYS})))`);
    if (ownerOk.length) return;
    const [heir] = await tx.execute<{ user_id: string }>(sql`
      SELECT m.user_id FROM guild_members m JOIN users u ON u.id = m.user_id
      WHERE m.guild_id = ${guildId}::uuid AND m.user_id <> ${g.owner_id}::uuid AND u.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM bans b WHERE b.user_id = u.id AND b.revoked_at IS NULL AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now()))
      ORDER BY CASE m.role WHEN 'officer' THEN 0 ELSE 1 END, m.joined_at, u.uid LIMIT 1`);
    if (!heir) {
      await disband(tx, guildId, null, 'no_eligible_owner');
      return;
    }
    await tx.execute(sql`UPDATE guild_members SET role = 'officer' WHERE guild_id = ${guildId}::uuid AND user_id = ${g.owner_id}::uuid`);
    await tx.execute(sql`UPDATE guild_members SET role = 'owner' WHERE guild_id = ${guildId}::uuid AND user_id = ${heir.user_id}::uuid`);
    await tx.execute(sql`UPDATE guilds SET owner_id = ${heir.user_id}::uuid WHERE id = ${guildId}::uuid`);
    await log(tx, guildId, null, 'succession', heir.user_id, { previousOwner: g.owner_id });
  });
}

/** Repairs every guild owned by this account (call after a ban or account deletion). */
export async function repairGuildsOf(db: Db, userId: string): Promise<void> {
  const rows = await db.execute<{ id: string }>(sql`SELECT id FROM guilds WHERE owner_id = ${userId}::uuid AND disbanded_at IS NULL`);
  for (const r of rows) await repairGuild(db, r.id);
}

// ---------------------------------------------------------------- reads

export async function listGuilds(db: Db, query = ''): Promise<GuildSummary[]> {
  const q = query.trim().toLowerCase().replace(/[%_\\]/g, '\\$&');
  const rows = await db.execute<GuildRow>(sql`
    SELECT * FROM (${SUMMARY} WHERE g.disbanded_at IS NULL) s
    ${q ? sql`WHERE lower(s.name) LIKE ${`%${q}%`}` : sql``}
    ORDER BY s.rank LIMIT 100`);
  return rows.map(toSummary);
}

export async function myInvites(db: Db, userId: string): Promise<GuildInviteView[]> {
  const rows = await db.execute<GuildRow & { invited_by_uid: number; invited_by_name: string; invited_at: string }>(sql`
    SELECT s.*, iu.uid AS invited_by_uid, iu.display_name AS invited_by_name, i.created_at AS invited_at
    FROM guild_invites i
    JOIN (${SUMMARY} WHERE g.disbanded_at IS NULL) s ON s.id = i.guild_id
    JOIN users iu ON iu.id = i.invited_by
    WHERE i.user_id = ${userId}::uuid ORDER BY i.created_at DESC`);
  return rows.map((r) => {
    const s = toSummary(r);
    return {
      guild: { id: s.id, name: s.name, emblem: s.emblem, color: s.color, tier: s.tier, members: s.members, maxMembers: s.maxMembers },
      invitedBy: { uid: Number(r.invited_by_uid), displayName: r.invited_by_name },
      createdAt: new Date(r.invited_at).toISOString(),
    };
  });
}

export async function myGuild(db: Db, hub: RealtimeHub, userId: string): Promise<MyGuild | null> {
  const [m] = await db.execute<{ guild_id: string }>(sql`
    SELECT m.guild_id FROM guild_members m JOIN guilds g ON g.id = m.guild_id WHERE m.user_id = ${userId}::uuid AND g.disbanded_at IS NULL`);
  if (!m) return null;
  await repairGuild(db, m.guild_id);
  const [row] = await db.execute<GuildRow>(sql`${SUMMARY} WHERE g.id = ${m.guild_id}::uuid AND g.disbanded_at IS NULL`);
  const [me] = await db.execute<{ role: GuildRole }>(sql`SELECT role FROM guild_members WHERE user_id = ${userId}::uuid AND guild_id = ${m.guild_id}::uuid`);
  if (!row || !me) return null;
  const members = await db.execute<CardRow & { role: GuildRole; joined_at: string }>(sql`
    SELECT ${CARD_COLUMNS}, m.role, m.joined_at FROM guild_members m JOIN users u ON u.id = m.user_id ${CARD_JOIN}
    WHERE m.guild_id = ${m.guild_id}::uuid
    ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, m.joined_at`);
  const presence = await presenceOf(db, hub, members.map((x) => x.user_id));
  const logRows = await db.execute<{ id: number; action: string; created_at: string; a_uid: number | null; a_name: string | null; t_uid: number | null; t_name: string | null }>(sql`
    SELECT l.id, l.action, l.created_at, a.uid AS a_uid, a.display_name AS a_name, t.uid AS t_uid, t.display_name AS t_name
    FROM guild_log l LEFT JOIN users a ON a.id = l.actor_id LEFT JOIN users t ON t.id = l.target_id
    WHERE l.guild_id = ${m.guild_id}::uuid ORDER BY l.id DESC LIMIT 30`);
  const invites = me.role === 'member' ? [] : await db.execute<{ uid: number; display_name: string; created_at: string }>(sql`
    SELECT u.uid, u.display_name, i.created_at FROM guild_invites i JOIN users u ON u.id = i.user_id
    WHERE i.guild_id = ${m.guild_id}::uuid ORDER BY i.created_at DESC`);
  return {
    ...toSummary(row),
    myRole: me.role,
    memberList: members.map((x) => {
      const status = presence.get(x.user_id) ?? 'offline';
      return { ...toCard(x), role: x.role, joinedAt: new Date(x.joined_at).toISOString(), online: status !== 'offline', presence: status };
    }),
    log: logRows.map(
      (l): GuildLogEntry => ({
        id: Number(l.id),
        action: l.action,
        actor: l.a_uid === null ? null : { uid: Number(l.a_uid), displayName: l.a_name! },
        target: l.t_uid === null ? null : { uid: Number(l.t_uid), displayName: l.t_name! },
        createdAt: new Date(l.created_at).toISOString(),
      }),
    ),
    pendingInvites: invites.map((i) => ({ uid: Number(i.uid), displayName: i.display_name, createdAt: new Date(i.created_at).toISOString() })),
  };
}

// ---------------------------------------------------------------- membership

export async function createGuild(db: Db, userId: string, input: z.infer<typeof guildCreateSchema>): Promise<string> {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`);
    const inGuild = await tx.execute(sql`SELECT 1 FROM guild_members m JOIN guilds g ON g.id = m.guild_id WHERE m.user_id = ${userId}::uuid AND g.disbanded_at IS NULL`);
    if (inGuild.length) throw fail('already_in_guild');
    // A stale membership row of a disbanded guild cannot exist (disband removes them), but be safe.
    await tx.execute(sql`DELETE FROM guild_members m USING guilds g WHERE m.user_id = ${userId}::uuid AND g.id = m.guild_id AND g.disbanded_at IS NOT NULL`);
    const taken = await tx.execute(sql`SELECT 1 FROM guilds WHERE lower(name) = lower(${input.name}) AND disbanded_at IS NULL`);
    if (taken.length) throw fail('guild_name_taken');
    await applyDelta(tx, userId, -SOCIAL_RULES.guild.createCostGold, 'guild_create', null, 'gold', `guild:${id}`);
    await tx.execute(sql`
      INSERT INTO guilds (id, name, owner_id, description, emblem, color, join_policy, max_members)
      VALUES (${id}::uuid, ${input.name}, ${userId}::uuid, ${input.description}, ${input.emblem}, ${input.color}, ${input.joinPolicy}, ${SOCIAL_RULES.guild.defaultMaxMembers})`);
    await tx.execute(sql`INSERT INTO guild_members (user_id, guild_id, role) VALUES (${userId}::uuid, ${id}::uuid, 'owner')`);
    await tx.execute(sql`DELETE FROM guild_invites WHERE user_id = ${userId}::uuid`);
    await log(tx, id, userId, 'create');
  });
  return id;
}

export async function updateGuild(db: Db, userId: string, patch: z.infer<typeof guildUpdateSchema>) {
  await db.transaction(async (tx) => {
    const m = await membership(tx, userId);
    if (m.role === 'member') throw fail('forbidden');
    if (patch.joinPolicy !== undefined && m.role !== 'owner') throw fail('forbidden');
    await tx.execute(sql`
      UPDATE guilds SET
        description = coalesce(${patch.description ?? null}, description),
        emblem = coalesce(${patch.emblem ?? null}, emblem),
        color = coalesce(${patch.color ?? null}, color),
        join_policy = coalesce(${patch.joinPolicy ?? null}, join_policy)
      WHERE id = ${m.guild_id}::uuid`);
    await log(tx, m.guild_id, userId, 'update', null, patch);
  });
}

export async function joinGuild(db: Db, hub: RealtimeHub, userId: string, guildId: string) {
  const members = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`);
    const inGuild = await tx.execute(sql`SELECT 1 FROM guild_members m JOIN guilds g ON g.id = m.guild_id WHERE m.user_id = ${userId}::uuid AND g.disbanded_at IS NULL`);
    if (inGuild.length) throw fail('already_in_guild');
    const [g] = await tx.execute<{ join_policy: string; max_members: number; disbanded_at: string | null }>(sql`SELECT join_policy, max_members, disbanded_at FROM guilds WHERE id = ${guildId}::uuid FOR UPDATE`);
    if (!g || g.disbanded_at) throw fail('not_found');
    const invited = await tx.execute(sql`SELECT 1 FROM guild_invites WHERE guild_id = ${guildId}::uuid AND user_id = ${userId}::uuid`);
    if (g.join_policy === 'invite' && !invited.length) throw fail('invite_required');
    const [count] = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM guild_members WHERE guild_id = ${guildId}::uuid`);
    if (count!.n >= g.max_members) throw fail('guild_full');
    await tx.execute(sql`INSERT INTO guild_members (user_id, guild_id, role) VALUES (${userId}::uuid, ${guildId}::uuid, 'member')`);
    await tx.execute(sql`DELETE FROM guild_invites WHERE user_id = ${userId}::uuid`);
    await log(tx, guildId, userId, 'join');
    return memberIds(tx, guildId);
  });
  for (const id of members) if (id !== userId) notify(hub, id, { kind: 'guild' });
}

export async function leaveGuild(db: Db, hub: RealtimeHub, userId: string) {
  const { guildId, members } = await db.transaction(async (tx) => {
    const m = await membership(tx, userId);
    const [count] = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM guild_members WHERE guild_id = ${m.guild_id}::uuid`);
    if (m.role === 'owner' && count!.n > 1) throw fail('guild_owner_must_transfer');
    if (m.role === 'owner') await disband(tx, m.guild_id, userId, 'last_member_left');
    else {
      await tx.execute(sql`DELETE FROM guild_members WHERE user_id = ${userId}::uuid`);
      await log(tx, m.guild_id, userId, 'leave');
    }
    return { guildId: m.guild_id, members: await memberIds(tx, m.guild_id) };
  });
  for (const id of members) notify(hub, id, { kind: 'guild', guildId });
}

export async function inviteToGuild(db: Db, hub: RealtimeHub, userId: string, uid: number) {
  const targetId = await db.transaction(async (tx) => {
    const m = await membership(tx, userId);
    if (m.role === 'member') throw fail('forbidden');
    const target = await visiblePlayer(tx, uid);
    if (target.status !== 'active' || target.user_id === userId) throw fail('bad_request');
    const inGuild = await tx.execute(sql`SELECT 1 FROM guild_members m JOIN guilds g ON g.id = m.guild_id WHERE m.user_id = ${target.user_id}::uuid AND g.disbanded_at IS NULL`);
    if (inGuild.length) throw fail('already_in_guild');
    const [pending] = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM guild_invites WHERE guild_id = ${m.guild_id}::uuid`);
    if (pending!.n >= SOCIAL_RULES.guild.maxPendingInvites) throw fail('guild_full');
    const inserted = await tx.execute(sql`
      INSERT INTO guild_invites (guild_id, user_id, invited_by) VALUES (${m.guild_id}::uuid, ${target.user_id}::uuid, ${userId}::uuid)
      ON CONFLICT DO NOTHING RETURNING user_id`);
    if (inserted.length) await log(tx, m.guild_id, userId, 'invite', target.user_id);
    return target.user_id;
  });
  notify(hub, targetId, { kind: 'guild_invite' });
}

/** Declines an invitation I received, or (officer/owner) withdraws one my guild sent. */
export async function dropInvite(db: Db, userId: string, input: { guildId?: string; uid?: number }) {
  if (input.guildId) {
    const rows = await db.execute(sql`DELETE FROM guild_invites WHERE guild_id = ${input.guildId}::uuid AND user_id = ${userId}::uuid RETURNING user_id`);
    if (!rows.length) throw fail('not_found');
    return;
  }
  await db.transaction(async (tx) => {
    const m = await membership(tx, userId);
    if (m.role === 'member') throw fail('forbidden');
    const rows = await tx.execute(sql`
      DELETE FROM guild_invites i USING users u WHERE i.guild_id = ${m.guild_id}::uuid AND u.id = i.user_id AND u.uid = ${input.uid ?? -1} RETURNING i.user_id`);
    if (!rows.length) throw fail('not_found');
  });
}

export async function kickMember(db: Db, hub: RealtimeHub, userId: string, uid: number) {
  const { targetId, guildId } = await db.transaction(async (tx) => {
    const m = await membership(tx, userId);
    const target = await memberByUid(tx, m.guild_id, uid);
    if (target.user_id === userId) throw fail('bad_request');
    // Owners remove anyone; officers remove members only.
    const allowed = m.role === 'owner' || (m.role === 'officer' && target.role === 'member');
    if (!allowed) throw fail('forbidden');
    await tx.execute(sql`DELETE FROM guild_members WHERE user_id = ${target.user_id}::uuid AND guild_id = ${m.guild_id}::uuid`);
    await log(tx, m.guild_id, userId, 'kick', target.user_id);
    return { targetId: target.user_id, guildId: m.guild_id };
  });
  notify(hub, targetId, { kind: 'guild_kicked', guildId });
}

export async function setMemberRole(db: Db, hub: RealtimeHub, userId: string, uid: number, role: 'officer' | 'member') {
  const targetId = await db.transaction(async (tx) => {
    const m = await membership(tx, userId);
    if (m.role !== 'owner') throw fail('forbidden');
    const target = await memberByUid(tx, m.guild_id, uid);
    if (target.role === 'owner') throw fail('bad_request');
    if (role === 'officer' && target.role !== 'officer') {
      const [n] = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM guild_members WHERE guild_id = ${m.guild_id}::uuid AND role = 'officer'`);
      if (n!.n >= SOCIAL_RULES.guild.maxOfficers) throw fail('guild_full');
    }
    await tx.execute(sql`UPDATE guild_members SET role = ${role} WHERE user_id = ${target.user_id}::uuid AND guild_id = ${m.guild_id}::uuid`);
    await log(tx, m.guild_id, userId, role === 'officer' ? 'promote' : 'demote', target.user_id);
    return target.user_id;
  });
  notify(hub, targetId, { kind: 'guild' });
}

async function confirmPassword(db: DbOrTx, userId: string, password: string) {
  const [u] = await db.execute<{ password_hash: string }>(sql`SELECT password_hash FROM users WHERE id = ${userId}::uuid`);
  if (!u || !(await verifyPassword(password, u.password_hash))) throw fail('invalid_credentials');
}

/** Hands the guild to another member (password-confirmed). The old owner becomes an officer. */
export async function transferGuild(db: Db, hub: RealtimeHub, userId: string, uid: number, password: string) {
  await confirmPassword(db, userId, password);
  const members = await db.transaction(async (tx) => {
    const m = await membership(tx, userId);
    if (m.role !== 'owner') throw fail('forbidden');
    const target = await memberByUid(tx, m.guild_id, uid);
    if (target.user_id === userId) throw fail('bad_request');
    if (target.status !== 'active') throw fail('bad_request');
    const banned = await tx.execute(sql`SELECT 1 FROM bans WHERE user_id = ${target.user_id}::uuid AND revoked_at IS NULL AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`);
    if (banned.length) throw fail('bad_request');
    await tx.execute(sql`UPDATE guild_members SET role = 'officer' WHERE user_id = ${userId}::uuid`);
    await tx.execute(sql`UPDATE guild_members SET role = 'owner' WHERE user_id = ${target.user_id}::uuid`);
    await tx.execute(sql`UPDATE guilds SET owner_id = ${target.user_id}::uuid WHERE id = ${m.guild_id}::uuid`);
    await log(tx, m.guild_id, userId, 'transfer', target.user_id);
    return memberIds(tx, m.guild_id);
  });
  for (const id of members) notify(hub, id, { kind: 'guild' });
}

/** Disbands the guild (password + exact guild name). Members are released; history stays. */
export async function disbandGuild(db: Db, hub: RealtimeHub, userId: string, password: string, name: string) {
  await confirmPassword(db, userId, password);
  const { members, guildId } = await db.transaction(async (tx) => {
    const m = await membership(tx, userId);
    if (m.role !== 'owner') throw fail('forbidden');
    const [g] = await tx.execute<{ name: string }>(sql`SELECT name FROM guilds WHERE id = ${m.guild_id}::uuid`);
    if (g!.name !== name.trim()) throw fail('bad_request');
    const ids = await memberIds(tx, m.guild_id);
    await disband(tx, m.guild_id, userId, 'owner');
    return { members: ids, guildId: m.guild_id };
  });
  for (const id of members) if (id !== userId) notify(hub, id, { kind: 'guild_disbanded', guildId });
}

/** Members of the player's guild (for guild chat fan-out), or null when not in a guild. */
export async function guildOf(db: DbOrTx, userId: string): Promise<{ guildId: string; members: string[] } | null> {
  const [m] = await db.execute<{ guild_id: string }>(sql`
    SELECT m.guild_id FROM guild_members m JOIN guilds g ON g.id = m.guild_id WHERE m.user_id = ${userId}::uuid AND g.disbanded_at IS NULL`);
  if (!m) return null;
  return { guildId: m.guild_id, members: await memberIds(db, m.guild_id) };
}
