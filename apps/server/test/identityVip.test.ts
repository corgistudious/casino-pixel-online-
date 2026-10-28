import { randomUUID } from 'node:crypto';
import { VIP_LEVELS, type PlayerProfileView, type VipLevelView, type VipStatusView } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sanitizeAvatar } from '../src/services/avatars';
import { createOwner, createStaff, randomIp, register, startTestApp, TestSocket, type TestApp } from './helpers';
import { jpeg, png, webp } from './imageFixtures';

let t: TestApp;
let owner: Awaited<ReturnType<typeof createOwner>>;
beforeAll(async () => {
  t = await startTestApp();
  owner = await createOwner(t);
});
afterAll(async () => {
  await t.app.close();
});

type P = { token: string; user: { id: string; uid: number } };
const auth = (p: { token: string }) => ({ authorization: `Bearer ${p.token}` });
const call = (headers: Record<string, string>, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  t.app.inject({ method, url, payload, headers, remoteAddress: randomIp() });
const code = (res: { json: () => { error?: { code: string } } }) => res.json().error?.code;
const rows = async <T>(q: ReturnType<typeof sql>) => (await t.db.execute(q)) as unknown as T[];
const upload = (p: P, body: Buffer, type = 'image/png') =>
  t.app.inject({ method: 'POST', url: '/api/me/avatar', payload: body, headers: { ...auth(p), 'content-type': type }, remoteAddress: randomIp() });
const profile = async (viewer: P, uid: number) => (await call(auth(viewer), 'GET', `/api/players/${uid}`)).json().player as PlayerProfileView;
const setExp = (p: P, exp: number) => t.db.execute(sql`INSERT INTO vip_progress (user_id, exp) VALUES (${p.user.id}::uuid, ${exp}) ON CONFLICT (user_id) DO UPDATE SET exp = ${exp}`);

describe('VIP levels as configuration', () => {
  it('seeds exactly the original 15 levels with the same thresholds and daily rewards', async () => {
    const levels = (await call({}, 'GET', '/api/vip/levels')).json().levels as VipLevelView[];
    expect(levels.map((l) => ({ level: l.level, exp: l.exp, daily: l.daily }))).toEqual(VIP_LEVELS.map((l) => ({ level: l.level, exp: l.exp, daily: l.daily })));
  });

  it('keeps each player at the level their EXP gives; the daily reward comes from the table', async () => {
    const p = await register(t);
    await setExp(p, 12_500);
    const s = (await call(auth(p), 'GET', '/api/vip')).json() as VipStatusView;
    expect(s).toMatchObject({ level: 7, expLevel: 7, exp: 12_500, override: null });
    expect(s.next?.level).toBe(8);
    const claim = await call(auth(p), 'POST', '/api/vip/daily');
    expect(claim.statusCode).toBe(200);
    expect(claim.json().reward).toEqual({ silver: 16_000, gold: 80 });
    expect(code(await call(auth(p), 'POST', '/api/vip/daily'))).toBe('checkin_done');
  });

  it('staff edit the table: thresholds must rise, a level in use cannot be switched off or deleted, new levels are allowed', async () => {
    const levelsUrl = (n: number) => `/api/admin/vip/levels/${n}`;
    const base = (await call(owner.headers, 'GET', '/api/admin/vip/levels')).json().levels as VipLevelView[];
    const lvl3 = base.find((l) => l.level === 3)!;
    const body = (l: VipLevelView, patch: Partial<{ exp: number; active: boolean; color: string }>) => ({
      level: l.level, name: l.name, description: l.description, color: l.color, iconAsset: null, exp: l.exp, daily: l.daily, benefits: l.benefits, active: l.active, ...patch,
    });
    // Moderators and plain admins have no access; a missing re-auth is refused.
    const mod = await createStaff(t, 'moderator');
    const admin = await createStaff(t, 'admin');
    expect((await call(mod.headers, 'GET', '/api/admin/vip/levels')).statusCode).toBe(403);
    expect((await call(admin.headers, 'PUT', levelsUrl(3), body(lvl3, {}))).statusCode).toBe(403);
    expect(code(await call(auth(owner), 'PUT', levelsUrl(3), body(lvl3, {})))).toBe('reauth_required');
    // VIP 3 cannot need less EXP than VIP 2.
    expect(code(await call(owner.headers, 'PUT', levelsUrl(3), body(lvl3, { exp: 100 })))).toBe('vip_levels_invalid');
    // A player sits at VIP 3: it cannot be switched off or deleted.
    const p = await register(t);
    await setExp(p, 1_600);
    expect(code(await call(owner.headers, 'PUT', levelsUrl(3), body(lvl3, { active: false })))).toBe('vip_level_in_use');
    expect(code(await call(owner.headers, 'DELETE', levelsUrl(3)))).toBe('vip_level_in_use');
    // A 16th level (no hardcoded limit) is accepted, then removed while unused.
    const lvl15 = base.find((l) => l.level === 15)!;
    const sixteen = { ...body(lvl15, { exp: 300_000 }), level: 16, name: { vi: 'VIP 16', en: 'VIP 16' } };
    const added = await call(owner.headers, 'PUT', levelsUrl(16), sixteen);
    expect(added.statusCode).toBe(200);
    expect((added.json().levels as VipLevelView[]).length).toBe(16);
    await setExp(p, 300_000);
    expect((await call(auth(p), 'GET', '/api/vip')).json().level).toBe(16);
    expect(code(await call(owner.headers, 'DELETE', levelsUrl(16)))).toBe('vip_level_in_use');
    await setExp(p, 1_600);
    expect((await call(owner.headers, 'DELETE', levelsUrl(16))).statusCode).toBe(200);
    expect(code(await call(owner.headers, 'DELETE', levelsUrl(1)))).toBe('vip_level_in_use');
    // Every change is audited with before/after.
    const audits = await rows<{ action: string }>(sql`SELECT action FROM audit_logs WHERE action LIKE 'vip.level_%' ORDER BY id`);
    expect(audits.map((a) => a.action)).toEqual(['vip.level_create', 'vip.level_delete']);
  });

  it('per-player grant/revoke/EXP changes: reason required, audited, idempotent; a timed grant falls back to the EXP level', async () => {
    const p = await register(t);
    await setExp(p, 600); // VIP 2
    const url = `/api/admin/vip/players/${p.user.uid}`;
    expect((await call(owner.headers, 'POST', url, { action: 'grant', level: 10, reason: '', idempotencyKey: randomUUID() })).statusCode).toBe(400);
    const key = randomUUID();
    const grant = { action: 'grant', level: 10, days: 7, reason: 'Event winner', idempotencyKey: key };
    const g = await call(owner.headers, 'POST', url, grant);
    expect(g.statusCode).toBe(200);
    expect(g.json().status).toMatchObject({ level: 10, expLevel: 2, exp: 600 });
    // Same key, same request: replayed, not applied twice; same key, other request: refused.
    expect((await call(owner.headers, 'POST', url, grant)).json().replayed).toBe(true);
    expect(code(await call(owner.headers, 'POST', url, { ...grant, level: 11 }))).toBe('idempotency_conflict');
    expect((await profile(p, p.user.uid)).vip.level).toBe(10);
    // The grant expires: back to the EXP level without anyone touching it.
    await t.db.execute(sql`UPDATE vip_progress SET override_until = now() - interval '1 minute' WHERE user_id = ${p.user.id}::uuid`);
    expect((await call(auth(p), 'GET', '/api/vip')).json()).toMatchObject({ level: 2, override: null });
    // EXP add/remove never goes below 0; revoke clears a grant.
    await call(owner.headers, 'POST', url, { action: 'grant', level: 5, reason: 'Support compensation', idempotencyKey: randomUUID() });
    expect((await call(owner.headers, 'POST', url, { action: 'exp_add', amount: 3_000, reason: 'Compensation', idempotencyKey: randomUUID() })).json().status).toMatchObject({ exp: 3_600, level: 5, expLevel: 4 });
    expect((await call(owner.headers, 'POST', url, { action: 'exp_remove', amount: 99_999, reason: 'Abuse rollback', idempotencyKey: randomUUID() })).json().status).toMatchObject({ exp: 0 });
    expect((await call(owner.headers, 'POST', url, { action: 'revoke', reason: 'Ended', idempotencyKey: randomUUID() })).json().status).toMatchObject({ level: 1, override: null });
    const view = (await call(owner.headers, 'GET', url)).json();
    expect(view.events.map((e: { kind: string }) => e.kind)).toEqual(['revoke', 'exp_remove', 'exp_add', 'grant', 'grant']);
    expect(view.events[0]).toMatchObject({ actor: { uid: 1002 }, reason: 'Ended', oldLevel: 5, newLevel: 1 });
    const audited = await rows<{ action: string; details: { reason: string } }>(sql`SELECT action, details FROM audit_logs WHERE target_id = ${String(p.user.uid)} AND action LIKE 'vip.%' ORDER BY id`);
    expect(audited.map((a) => a.action)).toEqual(['vip.grant', 'vip.grant', 'vip.exp_add', 'vip.exp_remove', 'vip.revoke']);
    expect(audited.every((a) => a.details.reason.length >= 3)).toBe(true);
  });

  it('protects the Owner and Keyo Support, refuses self-grants and staff of equal or higher rank', async () => {
    const sa = await createStaff(t, 'super_admin');
    const sa2 = await createStaff(t, 'super_admin');
    const body = () => ({ action: 'exp_add', amount: 10, reason: 'try it', idempotencyKey: randomUUID() });
    expect(code(await call(sa.headers, 'POST', '/api/admin/vip/players/1002', body()))).toBe('protected_account');
    expect(code(await call(sa.headers, 'POST', `/api/admin/vip/players/${sa.user.uid}`, body()))).toBe('self_action_forbidden');
    expect(code(await call(sa.headers, 'POST', `/api/admin/vip/players/${sa2.user.uid}`, body()))).toBe('forbidden');
    // The Owner may change their own VIP; a Super Admin can manage ordinary players.
    expect((await call(owner.headers, 'POST', '/api/admin/vip/players/1002', body())).statusCode).toBe(200);
    const p = await register(t);
    expect((await call(sa.headers, 'POST', `/api/admin/vip/players/${p.user.uid}`, body())).statusCode).toBe(200);
  });
});

describe('profile photos', () => {
  it('sanitizer: keeps the picture, drops EXIF/GPS/XMP/text metadata, refuses wrong size, animation, SVG and GIF', () => {
    for (const [file, mime] of [[png(512, { metadata: true }), 'image/png'], [jpeg(512), 'image/jpeg'], [webp(512), 'image/webp']] as const) {
      const out = sanitizeAvatar(file);
      expect(out.mime).toBe(mime);
      expect(out.bytes.includes('secret-location')).toBe(false);
      expect(out.bytes.includes('GPS')).toBe(false);
    }
    const cleanWebp = sanitizeAvatar(webp(512)).bytes;
    expect(cleanWebp[20]! & 0x08).toBe(0); // EXIF flag cleared in VP8X
    expect(cleanWebp.readUInt32LE(4)).toBe(cleanWebp.length - 8); // RIFF size rewritten
    const refused = [
      png(256),
      jpeg(1024),
      png(512, { animated: true }),
      webp(512, { animated: true }),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="512" height="512"/></svg>'),
      Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(40)]),
      png(512).subarray(0, 60),
    ];
    for (const f of refused) expect(() => sanitizeAvatar(f)).toThrow();
  });

  it('upload, show everywhere (profile, cards, me), replace, remove: equipped avatar and frame are never touched', async () => {
    const p = await register(t);
    const viewer = await register(t);
    await t.db.execute(sql`UPDATE users SET frame = 'silver', avatar = 5 WHERE id = ${p.user.id}::uuid`);
    const ws = await TestSocket.connect(t.port, viewer.token);
    const first = await upload(p, png(512, { metadata: true }));
    expect(first.statusCode).toBe(200);
    const url = first.json().url as string;
    expect(url).toMatch(/^\/api\/assets\/[a-f0-9]{64}\.png$/);
    // Every connected client hears about it (public fields only).
    const ev = await ws.waitFor((m) => m.type === 'event' && m.event === 'identity' && m.data.uid === p.user.uid);
    expect(ev).toMatchObject({ data: { customAvatar: url, frame: 'silver', avatar: 5 } });
    ws.close();
    // The stored bytes carry no metadata and are served as an image (not a document).
    const served = await t.app.inject({ method: 'GET', url });
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.rawPayload.includes('secret-location')).toBe(false);
    expect((await profile(viewer, p.user.uid))).toMatchObject({ customAvatar: url, frame: 'silver', avatar: 5 });
    expect((await call(auth(p), 'GET', '/api/me')).json().user).toMatchObject({ customAvatar: url, frame: 'silver', avatar: 5 });
    // Replace with a JPEG, then remove: back to the equipped avatar and frame.
    const second = await upload(p, jpeg(512), 'image/jpeg');
    expect(second.statusCode).toBe(200);
    expect((await rows<{ status: string }>(sql`SELECT status FROM avatar_uploads WHERE user_id = ${p.user.id}::uuid ORDER BY created_at`)).map((r) => r.status)).toEqual(['replaced', 'active']);
    expect((await call(auth(p), 'DELETE', '/api/me/avatar')).json().removed).toBe(true);
    expect((await profile(viewer, p.user.uid))).toMatchObject({ customAvatar: null, frame: 'silver', avatar: 5 });
    const [u] = await rows<{ frame: string; avatar: number }>(sql`SELECT frame, avatar FROM users WHERE id = ${p.user.id}::uuid`);
    expect(u).toEqual({ frame: 'silver', avatar: 5 });
  });

  it('refuses bad files, oversized bodies and too many uploads per hour', async () => {
    const p = await register(t);
    expect(code(await upload(p, png(300)))).toBe('invalid_asset');
    expect(code(await upload(p, Buffer.from('<svg/>'.padEnd(64, ' ')), 'image/png'))).toBe('invalid_asset');
    expect((await upload(p, Buffer.alloc(5 * 1024 * 1024 + 4096, 1))).statusCode).toBe(413);
    for (let i = 0; i < 5; i++) expect((await upload(p, png(512, { seed: i + 1 }))).statusCode).toBe(200);
    expect(code(await upload(p, png(512, { seed: 99 })))).toBe('avatar_rate_limited');
  });

  it('moderators remove an inappropriate photo (audited); the image bytes are deleted; the Owner photo is protected', async () => {
    const p = await register(t);
    const mod = await createStaff(t, 'moderator');
    const url = (await upload(p, png(512, { seed: 7 }))).json().url as string;
    const r = await call(auth(mod), 'POST', `/api/admin/users/${p.user.uid}/avatar/reject`, { reason: 'Inappropriate image' });
    expect(r.json().removed).toBe(true);
    expect((await t.app.inject({ method: 'GET', url })).statusCode).toBe(404);
    expect((await profile(mod, p.user.uid)).customAvatar).toBeNull();
    const [a] = await rows<{ action: string }>(sql`SELECT action FROM audit_logs WHERE action = 'avatar.reject' AND target_id = ${String(p.user.uid)}`);
    expect(a).toBeTruthy();
    expect(code(await call(auth(mod), 'POST', '/api/admin/users/1002/avatar/reject', { reason: 'Inappropriate image' }))).toBe('protected_account');
    const plain = await register(t);
    expect((await call(auth(plain), 'POST', `/api/admin/users/${p.user.uid}/avatar/reject`, { reason: 'Inappropriate image' })).statusCode).toBe(403);
  });
});
