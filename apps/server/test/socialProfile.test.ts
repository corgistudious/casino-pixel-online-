import { randomUUID } from 'node:crypto';
import { KEYO_SUPPORT_UID, type PlayerProfileView } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyDelta } from '../src/services/wallet';
import { createStaff, randomIp, register, startTestApp, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.app.close();
});

type P = Awaited<ReturnType<typeof register>>;
const call = (p: { token: string }, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  t.app.inject({ method, url, payload, headers: { authorization: `Bearer ${p.token}` }, remoteAddress: randomIp() });
const profile = async (viewer: P, uid: number) => {
  const res = await call(viewer, 'GET', `/api/players/${uid}`);
  expect(res.statusCode).toBe(200);
  return res.json().player as PlayerProfileView;
};
const code = (res: { json: () => { error?: { code: string } } }) => res.json().error?.code;
const count = async (q: ReturnType<typeof sql>) => Number(((await t.db.execute(q)) as unknown as { c: string }[])[0]!.c);

/** Every key anywhere in a JSON value. */
function keysOf(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) out.add(k.toLowerCase()), keysOf(x, out);
  return out;
}

describe('public profile', () => {
  it('shows wallet balances outside the Bank, never Bank balances, email, tokens or login data', async () => {
    const [a, b] = [await register(t), await register(t)];
    await applyDelta(t.db, b.user.id, 40_000, 'admin_adjust');
    await applyDelta(t.db, b.user.id, 25, 'admin_adjust', null, 'gold');
    const before = await profile(a, b.user.uid);
    const deposit = await call(b, 'POST', '/api/bank/transfer', { idempotencyKey: randomUUID(), currency: 'silver', direction: 'deposit', amount: 30_000 });
    expect(deposit.statusCode).toBe(200);
    const p = await profile(a, b.user.uid);
    // The deposited Cxu left the wallet and is not shown anywhere.
    expect(p.wallet.silver).toBe(before.wallet.silver - 30_000);
    expect(p.wallet.gold).toBe(before.wallet.gold);
    const [w] = await t.db.execute<{ balance: string; gold: string }>(sql`SELECT balance, gold FROM wallets WHERE user_id = ${b.user.id}::uuid`);
    expect(p.wallet).toEqual({ silver: Number(w!.balance), gold: Number(w!.gold) });
    const keys = keysOf(p);
    for (const k of ['email', 'emaillower', 'password', 'passwordhash', 'token', 'tokenversion', 'ip', 'bank', 'bankbalance', 'transactions', 'tickets', 'id', 'userid']) expect(keys.has(k)).toBe(false);
    expect(JSON.stringify(p)).not.toContain(b.user.email);
    // The Bank itself stays private to its owner.
    const bank = await call(a, 'GET', `/api/bank?uid=${b.user.uid}`);
    expect(JSON.stringify(bank.json())).not.toContain('30000');
  });

  it('real per-game stats from settled rounds; privacy hides stats, online, collection and friends but never the wallet', async () => {
    const [a, b] = [await register(t), await register(t)];
    const round = (bet: number, payout: number, game = 'slots') =>
      t.db.execute(sql`INSERT INTO game_rounds (user_id, game, bet, payout, status, result, settled_at, idempotency_key) VALUES (${b.user.id}::uuid, ${game}, ${bet}, ${payout}, 'settled', '{}'::jsonb, now(), gen_random_uuid()::text)`);
    await round(100, 300);
    await round(100, 0);
    await round(100, 100);
    await round(200, 500, 'blackjack');
    let p = await profile(a, b.user.uid);
    expect(p.stats).toMatchObject({ rounds: 4, wins: 2, losses: 1, pushes: 1, biggestWin: 500 });
    expect(p.stats!.byGame).toEqual(expect.arrayContaining([{ game: 'slots', rounds: 3, wins: 1, losses: 1 }, { game: 'blackjack', rounds: 1, wins: 1, losses: 0 }]));
    expect(p.privacy).toBeUndefined();

    const set = await call(b, 'PUT', '/api/me/privacy', { showStats: false, showOnline: false, showCollection: false, showFriends: false });
    expect(set.statusCode).toBe(200);
    p = await profile(a, b.user.uid);
    expect(p).toMatchObject({ stats: null, online: null, collection: null, counts: { friends: null } });
    expect(typeof p.wallet.silver).toBe('number');
    // The owner still sees everything, plus their settings.
    const mine = await profile(b, b.user.uid);
    expect(mine.stats).not.toBeNull();
    expect(mine.privacy).toMatchObject({ showStats: false, showOnline: false, showCollection: false, showFriends: false, showcase: [] });
    // Showcase only accepts items the player owns.
    expect(code(await call(b, 'PUT', '/api/me/privacy', { showcase: [randomUUID()] }))).toBe('not_owned');
  });
});

describe('follow, like and block', () => {
  it('cannot follow, like, befriend or report yourself', async () => {
    const a = await register(t);
    for (const url of ['/api/players/follow', '/api/players/like', '/api/friends/request', '/api/players/block']) {
      const res = await call(a, 'POST', url, { uid: a.user.uid });
      expect(code(res)).toBe('self_social');
    }
    expect(code(await call(a, 'POST', '/api/reports', { uid: a.user.uid, category: 'spam', description: 'myself myself myself' }))).toBe('self_social');
    expect(await count(sql`SELECT count(*) AS c FROM player_follows WHERE follower_id = ${a.user.id}::uuid`)).toBe(0);
  });

  it('follows and likes are idempotent under concurrent requests; counts come from the server only', async () => {
    const [a, b] = [await register(t), await register(t)];
    const follows = await Promise.all(Array.from({ length: 8 }, () => call(a, 'POST', '/api/players/follow', { uid: b.user.uid, followers: 999 })));
    expect(follows.every((r) => r.statusCode === 200)).toBe(true);
    const likes = await Promise.all(Array.from({ length: 8 }, () => call(a, 'POST', '/api/players/like', { uid: b.user.uid, likes: 999 })));
    expect(likes.every((r) => r.statusCode === 200)).toBe(true);
    let p = await profile(a, b.user.uid);
    expect(p.counts).toMatchObject({ followers: 1, likes: 1 });
    expect(p.social).toMatchObject({ following: true, liked: true });
    expect((await profile(b, a.user.uid)).social.followedBy).toBe(true);
    expect((await profile(b, a.user.uid)).counts.following).toBe(1);
    const followers = (await call(b, 'GET', `/api/players/${b.user.uid}/followers`)).json().players as { uid: number }[];
    expect(followers.map((f) => f.uid)).toEqual([a.user.uid]);
    // Undo twice: still consistent.
    await call(a, 'POST', '/api/players/unfollow', { uid: b.user.uid });
    await call(a, 'POST', '/api/players/unfollow', { uid: b.user.uid });
    await call(a, 'POST', '/api/players/unlike', { uid: b.user.uid });
    p = await profile(a, b.user.uid);
    expect(p.counts).toMatchObject({ followers: 0, likes: 0 });
    expect(p.social).toMatchObject({ following: false, liked: false });
  });

  it('Keyo Captain (UID 1000) has a real profile that can be followed and liked, but never blocked, reported or befriended by request', async () => {
    const a = await register(t);
    const p = await profile(a, KEYO_SUPPORT_UID);
    expect(p).toMatchObject({ relation: 'friend', online: true, presence: 'online' });
    await call(a, 'POST', '/api/players/follow', { uid: KEYO_SUPPORT_UID });
    await call(a, 'POST', '/api/players/like', { uid: KEYO_SUPPORT_UID });
    expect((await profile(a, KEYO_SUPPORT_UID)).social).toMatchObject({ following: true, liked: true });
    await call(a, 'POST', '/api/players/unfollow', { uid: KEYO_SUPPORT_UID });
    expect((await profile(a, KEYO_SUPPORT_UID)).social.following).toBe(false);
    // Already an official friend: a request is a no-op, never a pending row.
    expect((await call(a, 'POST', '/api/friends/request', { uid: KEYO_SUPPORT_UID })).json().status).toBe('friends');
    for (const url of ['/api/players/block', '/api/friends/remove']) expect((await call(a, 'POST', url, { uid: KEYO_SUPPORT_UID })).json().error.code).toBe('official_account');
    expect((await call(a, 'POST', '/api/reports', { uid: KEYO_SUPPORT_UID, category: 'spam', description: 'support account spam' })).json().error.code).toBe('official_account');
  });

  it('a block ends friendship, requests and follows both ways and refuses new ones until unblocked', async () => {
    const [a, b] = [await register(t), await register(t)];
    await call(a, 'POST', '/api/friends/request', { uid: b.user.uid });
    await call(b, 'POST', '/api/friends/accept', { uid: a.user.uid });
    await call(a, 'POST', '/api/players/follow', { uid: b.user.uid });
    await call(b, 'POST', '/api/players/follow', { uid: a.user.uid });
    expect((await profile(a, b.user.uid)).relation).toBe('friend');

    expect((await call(a, 'POST', '/api/players/block', { uid: b.user.uid })).statusCode).toBe(200);
    expect(await count(sql`SELECT count(*) AS c FROM friendships WHERE user_id IN (${a.user.id}::uuid, ${b.user.id}::uuid)`)).toBe(0);
    expect(await count(sql`SELECT count(*) AS c FROM player_follows WHERE follower_id IN (${a.user.id}::uuid, ${b.user.id}::uuid)`)).toBe(0);
    for (const [from, to] of [
      [a, b],
      [b, a],
    ] as const) {
      for (const url of ['/api/players/follow', '/api/players/like', '/api/friends/request']) expect(code(await call(from, 'POST', url, { uid: to.user.uid }))).toBe('blocked');
    }
    expect((await profile(b, a.user.uid)).social.blockedBy).toBe(true);
    expect((await call(a, 'GET', '/api/me/blocks')).json().players.map((p: { uid: number }) => p.uid)).toEqual([b.user.uid]);
    // B cannot lift A's block.
    expect((await call(b, 'POST', '/api/players/unblock', { uid: a.user.uid })).statusCode).toBe(404);
    expect((await call(a, 'POST', '/api/players/unblock', { uid: b.user.uid })).statusCode).toBe(200);
    expect((await call(b, 'POST', '/api/players/follow', { uid: a.user.uid })).statusCode).toBe(200);
  });
});

describe('player reports', () => {
  it('one open report per target, a daily limit, concurrency-safe; the reported player learns nothing', async () => {
    const [a, b] = [await register(t), await register(t)];
    const body = { uid: b.user.uid, category: 'harassment', description: 'Insults in server chat again and again.', context: 'chat:server' };
    const results = await Promise.all(Array.from({ length: 5 }, () => call(a, 'POST', '/api/reports', body)));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode !== 200).every((r) => code(r) === 'report_duplicate')).toBe(true);
    expect(await count(sql`SELECT count(*) AS c FROM player_reports WHERE reporter_id = ${a.user.id}::uuid`)).toBe(1);
    expect(code(await call(a, 'POST', '/api/reports', { ...body, description: 'short' }))).toBe('bad_request');
    // The target sees no reports and no reporter anywhere.
    expect((await call(b, 'GET', '/api/reports/mine')).json().reports).toEqual([]);
    expect(JSON.stringify((await call(b, 'GET', `/api/players/${b.user.uid}`)).json())).not.toContain(a.user.username);
    expect((await call(b, 'GET', '/api/admin/reports')).statusCode).toBe(403);
    // Daily limit: 10 per reporter.
    for (let i = 0; i < 9; i++) {
      const other = await register(t);
      expect((await call(a, 'POST', '/api/reports', { ...body, uid: other.user.uid })).statusCode).toBe(200);
    }
    const eleventh = await register(t);
    expect(code(await call(a, 'POST', '/api/reports', { ...body, uid: eleventh.user.uid }))).toBe('report_limit');
    expect((await call(a, 'GET', '/api/reports/mine')).json().reports).toHaveLength(10);
  });

  it('staff with reports.manage work the queue with an audit trail; no automatic ban however many reports', async () => {
    const target = await register(t);
    const reporters = [await register(t), await register(t), await register(t)];
    for (const r of reporters) await call(r, 'POST', '/api/reports', { uid: target.user.uid, category: 'cheating', description: 'Plays impossibly well every hand.' });
    expect(await count(sql`SELECT count(*) AS c FROM users WHERE id = ${target.user.id}::uuid AND status = 'active' AND NOT banned`)).toBe(1);
    expect(await count(sql`SELECT count(*) AS c FROM bans WHERE user_id = ${target.user.id}::uuid`)).toBe(0);

    const support = await createStaff(t, 'support');
    expect((await call(support, 'GET', '/api/admin/reports')).statusCode).toBe(403);
    const mod = await createStaff(t, 'moderator');
    const queue = (await call(mod, 'GET', `/api/admin/reports?uid=${target.user.uid}`)).json().reports as { id: string; status: string; targetOpen: number; reporter: { uid: number } }[];
    expect(queue).toHaveLength(3);
    expect(queue[0]!.targetOpen).toBe(3);
    const id = queue[0]!.id;
    expect((await call(mod, 'POST', `/api/admin/reports/${id}`, { status: 'reviewing' })).statusCode).toBe(200);
    expect((await call(mod, 'POST', `/api/admin/reports/${id}`, { status: 'resolved', resolution: 'Warned the player.' })).statusCode).toBe(200);
    // Final states cannot be reopened through this endpoint.
    expect((await call(mod, 'POST', `/api/admin/reports/${id}`, { status: 'reviewing' })).statusCode).toBe(400);
    expect(await count(sql`SELECT count(*) AS c FROM audit_logs WHERE action = 'reports.update' AND target_id = ${id}`)).toBe(2);
    const reporter = reporters.find((r) => r.user.uid === queue[0]!.reporter.uid)!;
    expect((await call(reporter, 'GET', '/api/reports/mine')).json().reports[0]).toMatchObject({ status: 'resolved' });
    // A staff member reported themselves cannot handle that report.
    const r2 = await call(target, 'POST', '/api/reports', { uid: mod.user.uid, category: 'other', description: 'Moderator was rude to me.' });
    expect(code(await call(mod, 'POST', `/api/admin/reports/${r2.json().id}`, { status: 'rejected' }))).toBe('self_action_forbidden');
  });

  it('evidence images: reporter only, new pending reports, type from the bytes, at most 3, served to staff only with safe headers', async () => {
    const [reporter, target, stranger] = [await register(t), await register(t), await register(t)];
    const res = await call(reporter, 'POST', '/api/reports', { uid: target.user.uid, category: 'cheating', description: 'Screenshot shows impossible cards.' });
    const id = res.json().id as string;
    const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
    const png = (w: number, h: number, salt = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), u32(13), Buffer.from('IHDR'), u32(w), u32(h), Buffer.from([8, 6, 0, 0, 0, salt]), Buffer.alloc(40, salt)]);
    const jpeg = (w: number, h: number) => {
      const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
      return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(9), sof, Buffer.alloc(32), Buffer.from([0xff, 0xd9])]);
    };
    const upload = (p: { token: string }, body: Buffer, type: string, rid = id) =>
      t.app.inject({ method: 'POST', url: `/api/reports/${rid}/attachments`, payload: body, headers: { authorization: `Bearer ${p.token}`, 'content-type': type }, remoteAddress: randomIp() });

    const a = await upload(reporter, png(1280, 720), 'image/png');
    expect(a.statusCode, a.body).toBe(200);
    expect(a.json().attachment).toMatchObject({ mime: 'image/png', width: 1280, height: 720 });
    const j = await upload(reporter, jpeg(800, 600), 'image/jpeg');
    expect(j.json().attachment).toMatchObject({ mime: 'image/jpeg', width: 800, height: 600 });
    // The same bytes again are not stored twice.
    expect((await upload(reporter, png(1280, 720), 'image/png')).json().attachment.id).toBe(a.json().attachment.id);
    // The declared type does not matter: a "PNG" that is really text is refused.
    expect(code(await upload(reporter, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'.padEnd(64)), 'image/png'))).toBe('invalid_asset');
    expect((await upload(reporter, Buffer.alloc(1_100_000, 1), 'image/png')).statusCode).toBe(413);
    // Only the reporter, on their own report; a third image fills the limit.
    expect((await upload(stranger, png(10, 10, 7), 'image/png')).statusCode).toBe(404);
    expect((await upload(target, png(10, 10, 7), 'image/png')).statusCode).toBe(404);
    expect((await upload(reporter, png(640, 480, 3), 'image/png')).statusCode).toBe(200);
    expect(code(await upload(reporter, png(640, 480, 4), 'image/png'))).toBe('bad_request');
    expect((await call(reporter, 'GET', '/api/reports/mine')).json().reports[0].attachments).toBe(3);

    // Staff see the images; players never do.
    const mod = await createStaff(t, 'moderator');
    const report = ((await call(mod, 'GET', `/api/admin/reports?uid=${target.user.uid}`)).json().reports as { id: string; attachments: { id: string; mime: string }[] }[])[0]!;
    expect(report.attachments.map((x) => x.mime)).toEqual(['image/png', 'image/jpeg', 'image/png']);
    const file = await t.app.inject({ url: `/api/admin/reports/${id}/attachments/${report.attachments[1]!.id}`, headers: { authorization: `Bearer ${mod.token}` }, remoteAddress: randomIp() });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['content-security-policy']).toContain('sandbox');
    expect(file.headers['cache-control']).toContain('no-store');
    expect(file.rawPayload.equals(jpeg(800, 600))).toBe(true);
    for (const p of [reporter, target]) expect((await t.app.inject({ url: `/api/admin/reports/${id}/attachments/${report.attachments[0]!.id}`, headers: { authorization: `Bearer ${p.token}` }, remoteAddress: randomIp() })).statusCode).toBe(403);
    // Once handled, nothing can be added.
    await call(mod, 'POST', `/api/admin/reports/${id}`, { status: 'rejected' });
    const other = await call(reporter, 'POST', '/api/reports', { uid: stranger.user.uid, category: 'spam', description: 'Spams links in chat all day.' });
    await t.db.execute(sql`UPDATE player_reports SET created_at = now() - interval '1 hour' WHERE id = ${other.json().id}::uuid`);
    expect(code(await upload(reporter, png(10, 10, 9), 'image/png', other.json().id))).toBe('too_soon');
    expect(code(await upload(reporter, png(10, 10, 9), 'image/png'))).toBe('too_soon');
  });
});
