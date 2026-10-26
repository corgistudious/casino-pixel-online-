import { randomUUID } from 'node:crypto';
import { KEYO_SUPPORT_UID, SOCIAL_RULES, type FriendsOverview, type MyGuild, type PlayerSearchResult } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyDelta } from '../src/services/wallet';
import { createStaff, randomIp, register, startTestApp, TEST_PASSWORD, TestSocket, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.app.close();
});

type Player = Awaited<ReturnType<typeof register>>;
const call = (p: Player, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
  t.app.inject({ method, url, headers: { authorization: `Bearer ${p.token}` }, payload: payload as object, remoteAddress: randomIp() });
const ok = async <T = Record<string, unknown>>(p: Player, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown): Promise<T> => {
  const res = await call(p, method, url, payload);
  if (res.statusCode !== 200) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`);
  return res.json() as T;
};
const code = async (p: Player, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) => (await call(p, method, url, payload)).json().error?.code as string | undefined;

async function wallet(userId: string) {
  const [row] = await t.db.execute<{ balance: string; gold: string; ls: string; lg: string }>(sql`
    SELECT w.balance, w.gold,
      (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = ${userId} AND currency = 'silver') AS ls,
      (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = ${userId} AND currency = 'gold') AS lg
    FROM wallets w WHERE w.user_id = ${userId}`);
  expect(row!.balance).toBe(row!.ls);
  expect(row!.gold).toBe(row!.lg);
  return { silver: Number(row!.balance), gold: Number(row!.gold) };
}

async function befriend(a: Player, b: Player, hoursAgo = 48) {
  await ok(a, 'POST', '/api/friends/request', { uid: b.user.uid });
  await ok(b, 'POST', '/api/friends/accept', { uid: a.user.uid });
  await t.db.execute(sql`UPDATE friendships SET created_at = now() - make_interval(hours => ${hoursAgo}) WHERE (user_id = ${a.user.id} AND friend_id = ${b.user.id}) OR (user_id = ${b.user.id} AND friend_id = ${a.user.id})`);
}

const giveGold = (userId: string, amount: number) => t.db.transaction((tx) => applyDelta(tx, userId, amount, 'admin_adjust', null, 'gold', `test:${randomUUID()}`));

describe('friends', () => {
  it('search, request, accept; crossing requests become friends; decline, cancel and remove', async () => {
    const [a, b, c, d] = [await register(t), await register(t), await register(t), await register(t)];
    const byUid = await ok<{ players: PlayerSearchResult[] }>(a, 'GET', `/api/friends/search?q=${b.user.uid}`);
    expect(byUid.players.map((p) => p.uid)).toEqual([b.user.uid]);
    expect(byUid.players[0]!.relation).toBe('none');
    const byName = await ok<{ players: PlayerSearchResult[] }>(a, 'GET', `/api/friends/search?q=${b.user.username.slice(0, 6)}`);
    expect(byName.players.some((p) => p.uid === b.user.uid)).toBe(true);

    expect((await ok(a, 'POST', '/api/friends/request', { uid: b.user.uid })).status).toBe('sent');
    const bView = await ok<FriendsOverview>(b, 'GET', '/api/friends');
    expect(bView.incoming.map((r) => r.uid)).toEqual([a.user.uid]);
    expect((await ok<FriendsOverview>(a, 'GET', '/api/friends')).outgoing.map((r) => r.uid)).toEqual([b.user.uid]);
    // b asking back simply makes them friends.
    expect((await ok(b, 'POST', '/api/friends/request', { uid: a.user.uid })).status).toBe('friends');
    expect((await ok<FriendsOverview>(a, 'GET', '/api/friends')).friends.map((f) => f.uid)).toEqual([b.user.uid]);
    expect(await code(a, 'POST', '/api/friends/request', { uid: b.user.uid })).toBe('already_owned');

    await ok(a, 'POST', '/api/friends/request', { uid: c.user.uid });
    await ok(c, 'POST', '/api/friends/decline', { uid: a.user.uid });
    await ok(a, 'POST', '/api/friends/request', { uid: d.user.uid });
    await ok(a, 'POST', '/api/friends/cancel', { uid: d.user.uid });
    const after = await ok<FriendsOverview>(a, 'GET', '/api/friends');
    expect(after.outgoing).toEqual([]);
    expect((await ok<FriendsOverview>(d, 'GET', '/api/friends')).incoming).toEqual([]);

    await ok(a, 'POST', '/api/friends/remove', { uid: b.user.uid });
    expect((await ok<FriendsOverview>(b, 'GET', '/api/friends')).friends).toEqual([]);
    expect(await code(a, 'POST', '/api/friends/request', { uid: a.user.uid })).toBe('bad_request');
  });

  it('shows who is online', async () => {
    const [a, b] = [await register(t), await register(t)];
    await befriend(a, b);
    expect((await ok<FriendsOverview>(a, 'GET', '/api/friends')).friends[0]!.online).toBe(false);
    const s = await TestSocket.connect(t.port, b.token);
    expect((await ok<FriendsOverview>(a, 'GET', '/api/friends')).friends[0]!.online).toBe(true);
    s.close();
  });

  it('never lists Keyo Support (UID 1000) as a friend, even with a legacy friendship row', async () => {
    const a = await register(t);
    const [support] = await t.db.execute<{ id: string }>(sql`SELECT id FROM users WHERE uid = ${KEYO_SUPPORT_UID}`);
    // New sign-ups are no longer attached to Support by a trigger…
    const [auto] = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM friendships WHERE user_id = ${a.user.id} AND friend_id = ${support!.id}`);
    expect(auto!.n).toBe(0);
    // …and rows created by the old version stay in the database but are hidden.
    await t.db.execute(sql`INSERT INTO friendships (user_id, friend_id) VALUES (${a.user.id}, ${support!.id})`);
    expect((await ok<FriendsOverview>(a, 'GET', '/api/friends')).friends).toEqual([]);
    expect((await ok<{ players: PlayerSearchResult[] }>(a, 'GET', `/api/friends/search?q=${KEYO_SUPPORT_UID}`)).players).toEqual([]);
    expect(await code(a, 'POST', '/api/friends/request', { uid: KEYO_SUPPORT_UID })).toBe('not_found');
    expect(await code(a, 'POST', `/api/chat/dm/${KEYO_SUPPORT_UID}`, { body: 'hi' })).toBe('protected_account');
    const [kept] = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM friendships WHERE friend_id = ${support!.id}`);
    expect(kept!.n).toBeGreaterThan(0);
  });
});

describe('gifts', () => {
  it('moves Cxu Bạc between friends atomically, once per id', async () => {
    const [a, b] = [await register(t), await register(t)];
    await befriend(a, b);
    const [wa, wb] = [await wallet(a.user.id), await wallet(b.user.id)];
    const gift = { id: randomUUID(), kind: 'silver', uid: b.user.uid, amount: 5_000, message: 'chúc may mắn' };
    await ok(a, 'POST', '/api/gifts', gift);
    const replay = await ok(a, 'POST', '/api/gifts', gift);
    expect(replay.replayed).toBe(true);
    expect((await wallet(a.user.id)).silver).toBe(wa.silver - 5_000);
    expect((await wallet(b.user.id)).silver).toBe(wb.silver + 5_000);
    expect(await code(a, 'POST', '/api/gifts', { ...gift, amount: 6_000 })).toBe('idempotency_conflict');
    // Both sides see it in their history.
    expect((await ok<{ history: { direction: string }[] }>(b, 'GET', '/api/gifts')).history[0]!.direction).toBe('received');
    // Concurrent different gifts cannot overdraw.
    const left = (await wallet(a.user.id)).silver;
    const tries = await Promise.all(
      Array.from({ length: 6 }, () => call(a, 'POST', '/api/gifts', { id: randomUUID(), kind: 'silver', uid: b.user.uid, amount: 40_000 })),
    );
    const accepted = tries.filter((r) => r.statusCode === 200).length;
    expect((await wallet(a.user.id)).silver).toBe(left - accepted * 40_000);
    expect((await wallet(a.user.id)).silver).toBeGreaterThanOrEqual(0);
  });

  it('refuses strangers, new friendships, gold, over-limit and unaffordable gifts', async () => {
    const [a, b, c] = [await register(t), await register(t), await register(t)];
    const silver = (uid: number, amount = 1_000) => ({ id: randomUUID(), kind: 'silver', uid, amount });
    expect(await code(a, 'POST', '/api/gifts', silver(b.user.uid))).toBe('not_friends');
    await befriend(a, b, 1);
    expect(await code(a, 'POST', '/api/gifts', silver(b.user.uid))).toBe('gift_too_soon');
    await befriend(a, c);
    expect((await call(a, 'POST', '/api/gifts', { id: randomUUID(), kind: 'gold', uid: c.user.uid, amount: 10 })).statusCode).toBe(400);
    expect((await call(a, 'POST', '/api/gifts', silver(c.user.uid, SOCIAL_RULES.gift.maxSilver + 1))).statusCode).toBe(400);
    await t.db.transaction((tx) => applyDelta(tx, a.user.id, 400_000, 'admin_adjust', null, 'silver', `test:${randomUUID()}`));
    await ok(a, 'POST', '/api/gifts', silver(c.user.uid, 100_000));
    await ok(a, 'POST', '/api/gifts', silver(c.user.uid, 100_000));
    expect(await code(a, 'POST', '/api/gifts', silver(c.user.uid, 100))).toBe('gift_limit');
    const poor = await register(t);
    await befriend(poor, c);
    const { silver: all } = await wallet(poor.user.id);
    await t.db.transaction((tx) => applyDelta(tx, poor.user.id, -(all - 50), 'admin_adjust', null, 'silver', `test:${randomUUID()}`));
    expect(await code(poor, 'POST', '/api/gifts', silver(c.user.uid, 100))).toBe('insufficient_funds');
    const [rows] = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM gift_transfers WHERE sender_id = ${poor.user.id}`);
    expect(rows!.n).toBe(0);
  });

  it('gives a tradable collectible; untradable or listed items cannot be gifted', async () => {
    const [a, b] = [await register(t), await register(t)];
    await befriend(a, b);
    await t.db.execute(sql`
      INSERT INTO catalog_items (id, kind, name_vi, name_en, tradable, status) VALUES
        ('gift_gem', 'collectible', 'Ngọc', 'Gem', true, 'released'),
        ('gift_bound', 'collectible', 'Khóa', 'Bound', false, 'released')
      ON CONFLICT DO NOTHING`);
    const [gem] = await t.db.execute<{ id: string }>(sql`INSERT INTO inventory_items (user_id, item_id, kind, source) VALUES (${a.user.id}, 'gift_gem', 'collectible', 'test') RETURNING id`);
    const [bound] = await t.db.execute<{ id: string }>(sql`INSERT INTO inventory_items (user_id, item_id, kind, source) VALUES (${a.user.id}, 'gift_bound', 'collectible', 'test') RETURNING id`);
    const [listed] = await t.db.execute<{ id: string }>(sql`INSERT INTO inventory_items (user_id, item_id, kind, source) VALUES (${a.user.id}, 'gift_gem', 'collectible', 'test') RETURNING id`);
    await t.db.execute(sql`INSERT INTO market_listings (seller_id, instance_id, item_id, price_silver) VALUES (${a.user.id}, ${listed!.id}, 'gift_gem', 100)`);
    const giftable = await ok<{ items: { instanceId: string }[] }>(a, 'GET', '/api/gifts');
    expect(giftable.items.map((i) => i.instanceId)).toEqual([gem!.id]);
    await ok(a, 'POST', '/api/gifts', { id: randomUUID(), kind: 'item', uid: b.user.uid, instanceId: gem!.id });
    const [owner] = await t.db.execute<{ user_id: string }>(sql`SELECT user_id FROM inventory_items WHERE id = ${gem!.id}`);
    expect(owner!.user_id).toBe(b.user.id);
    for (const id of [bound!.id, listed!.id, gem!.id]) {
      expect(await code(a, 'POST', '/api/gifts', { id: randomUUID(), kind: 'item', uid: b.user.uid, instanceId: id })).toBe('item_not_tradable');
    }
  });
});

describe('guilds', () => {
  it('create (gold cost, unique name), open join, invite-only, roles, kick rules and the log', async () => {
    const [owner, officer, member, outsider] = [await register(t), await register(t), await register(t), await register(t)];
    expect(await code(owner, 'POST', '/api/guild', { name: 'Rồng Vàng' })).toBe('insufficient_funds');
    await giveGold(owner.user.id, 1_000);
    const { id } = await ok<{ id: string }>(owner, 'POST', '/api/guild', { name: 'Rồng Vàng', description: 'Bang của rồng', emblem: 'dragon', color: 'ruby' });
    expect((await wallet(owner.user.id)).gold).toBe(1_000 - SOCIAL_RULES.guild.createCostGold);
    await giveGold(outsider.user.id, 1_000);
    expect(await code(outsider, 'POST', '/api/guild', { name: 'rồng vàng' })).toBe('guild_name_taken');

    await ok(officer, 'POST', '/api/guild/join', { id });
    await ok(member, 'POST', '/api/guild/join', { id });
    expect(await code(member, 'POST', '/api/guild/join', { id })).toBe('already_in_guild');
    await ok(owner, 'POST', '/api/guild/role', { uid: officer.user.uid, role: 'officer' });
    expect(await code(officer, 'POST', '/api/guild/role', { uid: member.user.uid, role: 'officer' })).toBe('forbidden');
    expect(await code(member, 'POST', '/api/guild/kick', { uid: officer.user.uid })).toBe('forbidden');

    // Invite-only: joining needs an invitation from an officer or the owner.
    await ok(owner, 'PATCH', '/api/guild', { joinPolicy: 'invite' });
    expect(await code(officer, 'PATCH', '/api/guild', { joinPolicy: 'open' })).toBe('forbidden');
    expect(await code(outsider, 'POST', '/api/guild/join', { id })).toBe('invite_required');
    expect(await code(member, 'POST', '/api/guild/invite', { uid: outsider.user.uid })).toBe('forbidden');
    await ok(officer, 'POST', '/api/guild/invite', { uid: outsider.user.uid });
    const inv = await ok<{ invites: { guild: { id: string } }[] }>(outsider, 'GET', '/api/guild');
    expect(inv.invites.map((i) => i.guild.id)).toEqual([id]);
    await ok(outsider, 'POST', '/api/guild/join', { id });

    // Officers remove members, never officers; owners remove anyone.
    await ok(officer, 'POST', '/api/guild/kick', { uid: outsider.user.uid });
    expect(await code(outsider, 'GET', '/api/chat/guild')).toBe('not_in_guild');
    const mine = await ok<{ guild: MyGuild }>(owner, 'GET', '/api/guild');
    expect(mine.guild.memberList.map((m) => [m.uid, m.role])).toEqual([
      [owner.user.uid, 'owner'],
      [officer.user.uid, 'officer'],
      [member.user.uid, 'member'],
    ]);
    expect(mine.guild.log.map((l) => l.action)).toEqual(expect.arrayContaining(['create', 'join', 'promote', 'invite', 'kick']));
    const listed = await ok<{ guilds: { id: string; members: number; tier: string }[] }>(outsider, 'GET', '/api/guilds?q=rồng');
    expect(listed.guilds.find((g) => g.id === id)!.members).toBe(3);
  });

  it('transfer needs the password; the owner cannot just leave; disband frees the name and keeps history', async () => {
    const [owner, heir] = [await register(t), await register(t)];
    await giveGold(owner.user.id, 1_000);
    const name = `Phượng ${randomUUID().slice(0, 4)}`;
    const { id } = await ok<{ id: string }>(owner, 'POST', '/api/guild', { name });
    await ok(heir, 'POST', '/api/guild/join', { id });
    expect(await code(owner, 'POST', '/api/guild/leave')).toBe('guild_owner_must_transfer');
    expect(await code(owner, 'POST', '/api/guild/transfer', { uid: heir.user.uid, password: 'wrong-pass-1' })).toBe('invalid_credentials');
    await ok(owner, 'POST', '/api/guild/transfer', { uid: heir.user.uid, password: TEST_PASSWORD });
    const g = await ok<{ guild: MyGuild }>(heir, 'GET', '/api/guild');
    expect(g.guild.myRole).toBe('owner');
    expect(g.guild.memberList.find((m) => m.uid === owner.user.uid)!.role).toBe('officer');
    await ok(heir, 'POST', '/api/chat/guild', { body: 'lịch sử phải giữ' });
    expect(await code(heir, 'POST', '/api/guild/disband', { password: TEST_PASSWORD, name: 'sai tên' })).toBe('bad_request');
    await ok(heir, 'POST', '/api/guild/disband', { password: TEST_PASSWORD, name });
    expect((await ok<{ guild: unknown }>(owner, 'GET', '/api/guild')).guild).toBeNull();
    const [row] = await t.db.execute<{ disbanded_at: string | null; msgs: number }>(sql`SELECT disbanded_at, (SELECT count(*)::int FROM guild_messages WHERE guild_id = ${id}) AS msgs FROM guilds WHERE id = ${id}`);
    expect(row!.disbanded_at).not.toBeNull();
    expect(row!.msgs).toBe(1);
    await giveGold(heir.user.id, 1_000);
    await ok(heir, 'POST', '/api/guild', { name });
  });

  it('a permanently banned owner hands the guild to the senior officer', async () => {
    const [owner, officer, member] = [await register(t), await register(t), await register(t)];
    const mod = await createStaff(t, 'super_admin');
    await giveGold(owner.user.id, 1_000);
    const { id } = await ok<{ id: string }>(owner, 'POST', '/api/guild', { name: `Sư tử ${randomUUID().slice(0, 4)}` });
    await ok(member, 'POST', '/api/guild/join', { id });
    await ok(officer, 'POST', '/api/guild/join', { id });
    await ok(owner, 'POST', '/api/guild/role', { uid: officer.user.uid, role: 'officer' });
    const ban = await t.app.inject({ method: 'POST', url: `/api/admin/users/${owner.user.uid}/bans`, headers: mod.headers, payload: { duration: 'permanent', reason: 'cheating' }, remoteAddress: randomIp() });
    expect(ban.statusCode).toBe(200);
    const g = await ok<{ guild: MyGuild }>(member, 'GET', '/api/guild');
    expect(g.guild.owner.uid).toBe(officer.user.uid);
    expect(g.guild.log[0]!.action).toBe('succession');
  });
});

describe('chat', () => {
  it('server chat is pushed live; mutes silence every channel; cooldown applies', async () => {
    const [a, b] = [await register(t), await register(t)];
    const mod = await createStaff(t, 'moderator');
    await befriend(a, b);
    const sb = await TestSocket.connect(t.port, b.token);
    const { message } = await ok<{ message: { id: number } }>(a, 'POST', '/api/chat/server', { body: 'xin chào cả server' });
    await new Promise((r) => setTimeout(r, 100));
    expect(sb.events.some((e) => e.type === 'event' && e.event === 'chatMessage' && (e.data as { id: number }).id === message.id)).toBe(true);
    expect(await code(a, 'POST', '/api/chat/server', { body: 'spam' })).toBe('too_soon');
    const mute = await t.app.inject({ method: 'POST', url: '/api/admin/chat/mute', headers: mod.headers, payload: { uid: a.user.uid, minutes: 10, reason: 'spam' }, remoteAddress: randomIp() });
    expect(mute.statusCode).toBe(200);
    await t.db.execute(sql`UPDATE public_chat_messages SET created_at = now() - interval '1 minute' WHERE user_id = ${a.user.id}`);
    expect(await code(a, 'POST', '/api/chat/server', { body: 'still here' })).toBe('muted');
    expect(await code(a, 'POST', `/api/chat/dm/${b.user.uid}`, { body: 'psst' })).toBe('muted');
    const unmute = await t.app.inject({ method: 'POST', url: '/api/admin/chat/unmute', headers: mod.headers, payload: { uid: a.user.uid }, remoteAddress: randomIp() });
    expect(unmute.statusCode).toBe(200);
    await ok(a, 'POST', `/api/chat/dm/${b.user.uid}`, { body: 'back' });
    sb.close();
  });

  it('private chat needs friendship, tracks unread and pushes to both sides', async () => {
    const [a, b, stranger] = [await register(t), await register(t), await register(t)];
    expect(await code(stranger, 'POST', `/api/chat/dm/${a.user.uid}`, { body: 'hi' })).toBe('not_friends');
    await befriend(a, b);
    const sb = await TestSocket.connect(t.port, b.token);
    await ok(a, 'POST', `/api/chat/dm/${b.user.uid}`, { body: 'tin 1' });
    await t.db.execute(sql`UPDATE direct_messages SET created_at = now() - interval '1 minute' WHERE sender_id = ${a.user.id}`);
    await ok(a, 'POST', `/api/chat/dm/${b.user.uid}`, { body: 'tin 2' });
    await new Promise((r) => setTimeout(r, 100));
    expect(sb.events.filter((e) => e.type === 'event' && e.event === 'chatMessage').length).toBe(2);
    expect((await ok<{ dm: number }>(b, 'GET', '/api/chat/unread')).dm).toBe(2);
    const convs = await ok<{ conversations: { peer: { uid: number }; unread: number; lastBody: string }[] }>(b, 'GET', '/api/chat/dm');
    expect(convs.conversations[0]).toMatchObject({ peer: { uid: a.user.uid }, unread: 2, lastBody: 'tin 2' });
    const hist = await ok<{ messages: { body: string }[] }>(b, 'GET', `/api/chat/dm/${a.user.uid}`);
    expect(hist.messages.map((m) => m.body)).toEqual(['tin 1', 'tin 2']);
    expect((await ok<{ dm: number }>(b, 'GET', '/api/chat/unread')).dm).toBe(0);
    // After unfriending the history is still readable, but nothing new can be sent.
    await ok(a, 'POST', '/api/friends/remove', { uid: b.user.uid });
    expect((await ok<{ messages: unknown[] }>(b, 'GET', `/api/chat/dm/${a.user.uid}`)).messages).toHaveLength(2);
    expect(await code(b, 'POST', `/api/chat/dm/${a.user.uid}`, { body: 'hello?' })).toBe('not_friends');
    sb.close();
  });

  it('guild chat stays inside the guild', async () => {
    const [o1, o2, m1] = [await register(t), await register(t), await register(t)];
    await giveGold(o1.user.id, 1_000);
    await giveGold(o2.user.id, 1_000);
    const g1 = await ok<{ id: string }>(o1, 'POST', '/api/guild', { name: `Kiếm ${randomUUID().slice(0, 4)}` });
    await ok(o2, 'POST', '/api/guild', { name: `Khiên ${randomUUID().slice(0, 4)}` });
    await ok(m1, 'POST', '/api/guild/join', { id: g1.id });
    const s2 = await TestSocket.connect(t.port, o2.token);
    const sm = await TestSocket.connect(t.port, m1.token);
    await ok(o1, 'POST', '/api/chat/guild', { body: 'bí mật bang 1' });
    await new Promise((r) => setTimeout(r, 100));
    const got = (s: TestSocket) => s.events.some((e) => e.type === 'event' && e.event === 'chatMessage' && (e.data as { body: string }).body === 'bí mật bang 1');
    expect(got(sm)).toBe(true);
    expect(got(s2)).toBe(false);
    expect((await ok<{ messages: { body: string }[] }>(o2, 'GET', '/api/chat/guild')).messages).toEqual([]);
    await ok(m1, 'POST', '/api/guild/leave');
    expect(await code(m1, 'GET', '/api/chat/guild')).toBe('not_in_guild');
    expect(await code(m1, 'POST', '/api/chat/guild', { body: 'x' })).toBe('not_in_guild');
    s2.close();
    sm.close();
  });
});
