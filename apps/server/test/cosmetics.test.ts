import { randomUUID } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { ECONOMY } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOwner, createStaff, randomIp, register, registerPending, startTestApp, TestSocket, type TestApp } from './helpers';

let t: TestApp;
let owner: Awaited<ReturnType<typeof createOwner>>;

beforeAll(async () => {
  t = await startTestApp();
  owner = await createOwner(t);
});
afterAll(async () => {
  await t.app.close();
});

/** A real, valid RGBA PNG (transparent) of the given size. */
function png(w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown) =>
  t.app.inject({ method, url, headers, payload: payload as object, remoteAddress: randomIp() });
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const code = (r: { json: () => { error?: { code?: string } } }) => r.json().error?.code;
const upload = (bytes: Buffer, headers: Record<string, string>, type = 'image/png') =>
  t.app.inject({ method: 'PUT', url: '/api/admin/assets', headers: { ...headers, 'content-type': type }, payload: bytes, remoteAddress: randomIp() });

async function createItem(id: string, kind: 'frame' | 'avatar' | 'collectible', status: 'draft' | 'released' | 'hidden' = 'released', extra: Record<string, unknown> = {}) {
  const asset = (await upload(png(128, 128), owner.headers)).json().asset;
  const res = await call('POST', '/api/admin/items', owner.headers, { id, kind, nameVi: `Vi ${id}`, nameEn: `En ${id}`, rarity: 'epic', source: 'event', tradable: false, status, assetId: asset.id, ...extra });
  expect(res.statusCode).toBe(200);
  return res.json().item;
}

describe('catalog and shop', () => {
  it('ships the six built-in frames, and keeps drafts out of the public catalog', async () => {
    await createItem('secret_draft', 'frame', 'draft');
    const items = (await call('GET', '/api/catalog', {})).json().items as { id: string; status: string }[];
    expect(items.filter((i) => ['classic', 'silver', 'emerald', 'ruby', 'sapphire', 'royal'].includes(i.id))).toHaveLength(6);
    expect(items.some((i) => i.id === 'secret_draft')).toBe(false);
  });

  it('buys a frame once, even when the request is sent concurrently', async () => {
    const p = await register(t);
    const results = await Promise.all(Array.from({ length: 4 }, () => call('POST', '/api/shop/buy', auth(p.token), { itemId: 'emerald' })));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(results.filter((r) => code(r) === 'already_owned')).toHaveLength(3);
    const me = (await call('GET', '/api/me', auth(p.token))).json().user;
    expect(me.balance).toBe(ECONOMY.welcome.silver - 10_000);
    expect(me.ownedFrames).toContain('emerald');
    const [row] = await t.db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM inventory_items WHERE user_id = ${p.user.id} AND item_id = 'emerald'`);
    expect(Number(row!.n)).toBe(1);
  });

  it('equips owned frames, refuses unowned ones, and can remove the frame', async () => {
    const p = await register(t);
    expect(code(await call('POST', '/api/me/equip', auth(p.token), { slot: 'frame', itemId: 'royal' }))).toBe('not_owned');
    expect((await call('POST', '/api/me/equip', auth(p.token), { slot: 'frame', itemId: 'classic' })).json().user.frame).toBe('classic');
    expect((await call('POST', '/api/me/equip', auth(p.token), { slot: 'frame', itemId: null })).json().user.frame).toBe('none');
    expect(code(await call('POST', '/api/me/equip', auth(p.token), { slot: 'frame', itemId: 'secret_draft' }))).toBe('item_not_found');
  });
});

describe('uploads', () => {
  it('accepts real square PNGs and serves them safely', async () => {
    const res = await upload(png(256, 256), owner.headers);
    const asset = res.json().asset;
    expect(asset).toMatchObject({ mime: 'image/png', width: 256, height: 256 });
    const again = await upload(png(256, 256), owner.headers);
    expect(again.json().asset.id).toBe(asset.id);
    const served = await call('GET', asset.url, {});
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['content-security-policy']).toContain("default-src 'none'");
    expect(served.rawPayload.equals(png(256, 256))).toBe(true);
  });

  it('refuses SVG, disguised files, non-square, tiny and oversized images', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(code(await upload(svg, owner.headers))).toBe('invalid_asset');
    expect((await upload(svg, owner.headers, 'image/svg+xml')).statusCode).toBe(415);
    expect(code(await upload(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(64)]).fill(0, 6, 10), owner.headers, 'image/gif'))).toBe('invalid_asset');
    expect(code(await upload(png(200, 100), owner.headers))).toBe('invalid_asset');
    expect(code(await upload(png(32, 32), owner.headers))).toBe('invalid_asset');
    expect(code(await upload(png(2048, 2048), owner.headers))).toBe('invalid_asset');
  });

  it('is limited to items.manage', async () => {
    const adm = await createStaff(t, 'admin');
    expect((await upload(png(64, 64), adm.headers)).statusCode).toBe(403);
    expect((await call('POST', '/api/admin/items', adm.headers, {})).statusCode).toBe(403);
  });
});

describe('item lifecycle and ownership', () => {
  it('grants once per idempotency key, never duplicates a unique item, and keeps ownership when hidden', async () => {
    await createItem('neon_halo', 'frame', 'released', { render: { scale: 1.4, offsetX: 0, offsetY: -0.02 } });
    const p = await register(t);
    const body = { uid: p.user.uid, reason: 'event winner', idempotencyKey: randomUUID() };
    expect((await call('POST', '/api/admin/items/neon_halo/grant', owner.headers, body)).json().outcome).toBe('granted');
    expect((await call('POST', '/api/admin/items/neon_halo/grant', owner.headers, body)).json().outcome).toBe('granted'); // replay
    expect((await call('POST', '/api/admin/items/neon_halo/grant', owner.headers, { ...body, idempotencyKey: randomUUID() })).json().outcome).toBe('already_owned');
    const inv = (await call('GET', '/api/me/inventory', auth(p.token))).json().items as { itemId: string }[];
    expect(inv.filter((i) => i.itemId === 'neon_halo')).toHaveLength(1);

    expect((await call('POST', '/api/me/equip', auth(p.token), { slot: 'frame', itemId: 'neon_halo' })).json().user.frame).toBe('neon_halo');
    await call('PATCH', '/api/admin/items/neon_halo', owner.headers, { status: 'hidden' });
    const catalog = (await call('GET', '/api/catalog', {})).json().items as { id: string; status: string; render: { scale: number } }[];
    expect(catalog.find((i) => i.id === 'neon_halo')).toMatchObject({ status: 'hidden', render: { scale: 1.4 } });
    expect((await call('GET', '/api/me', auth(p.token))).json().user.frame).toBe('neon_halo');
    expect(code(await call('PATCH', '/api/admin/items/neon_halo', owner.headers, { status: 'draft' }))).toBe('bad_request');
  });

  it('special avatars are equippable only when owned; revoking unequips', async () => {
    await createItem('golden_corgi', 'avatar');
    const p = await register(t);
    expect(code(await call('POST', '/api/me/equip', auth(p.token), { slot: 'avatar', itemId: 'golden_corgi' }))).toBe('not_owned');
    await call('POST', '/api/admin/items/golden_corgi/grant', owner.headers, { uid: p.user.uid, reason: 'gift ok', idempotencyKey: randomUUID() });
    expect((await call('POST', '/api/me/equip', auth(p.token), { slot: 'avatar', itemId: 'golden_corgi' })).json().user.avatarItem).toBe('golden_corgi');
    const owners = (await call('GET', '/api/admin/items/golden_corgi/owners', owner.headers)).json().owners;
    expect(owners[0].uid).toBe(p.user.uid);
    await call('POST', `/api/admin/inventory/${owners[0].instanceId}/revoke`, owner.headers, { reason: 'granted by mistake' });
    expect((await call('GET', '/api/me', auth(p.token))).json().user.avatarItem).toBeNull();
  });

  it('collectibles can be held more than once', async () => {
    await createItem('lucky_chip', 'collectible');
    const p = await register(t);
    for (let i = 0; i < 2; i++) await call('POST', '/api/admin/items/lucky_chip/grant', owner.headers, { uid: p.user.uid, reason: 'drop', idempotencyKey: randomUUID() });
    const inv = (await call('GET', '/api/me/inventory', auth(p.token))).json().items as { itemId: string }[];
    expect(inv.filter((i) => i.itemId === 'lucky_chip')).toHaveLength(2);
  });

  it('granting items needs items.grant and re-authentication', async () => {
    const p = await register(t);
    const adm = await createStaff(t, 'admin');
    expect(code(await call('POST', '/api/admin/items/lucky_chip/grant', adm.headers, { uid: p.user.uid, reason: 'nope', idempotencyKey: randomUUID() }))).toBe('forbidden');
    expect(code(await call('POST', '/api/admin/items/lucky_chip/grant', auth(owner.token), { uid: p.user.uid, reason: 'nope', idempotencyKey: randomUUID() }))).toBe('reauth_required');
  });
});

describe('mailbox', () => {
  const sendTo = (uids: number[], attachments: unknown[], extra: Record<string, unknown> = {}) =>
    call('POST', '/api/admin/mail', owner.headers, { target: { uids }, kind: 'reward', subject: 'Event reward', body: 'Thanks for playing!', attachments, idempotencyKey: randomUUID(), ...extra });

  it('delivers, notifies over the socket, and pays exactly once on claim', async () => {
    const p = await register(t);
    const ws = await TestSocket.connect(t.port, p.token);
    const res = await sendTo([p.user.uid], [{ type: 'silver', amount: 1500 }, { type: 'gold', amount: 3 }, { type: 'item', itemId: 'lucky_chip' }]);
    expect(res.json().recipients).toBe(1);
    await new Promise((r) => setTimeout(r, 100));
    expect(ws.events.some((e) => e.type === 'event' && e.event === 'mail')).toBe(true);
    ws.close();

    const box = (await call('GET', '/api/mail', auth(p.token))).json();
    expect(box.unread).toBe(1);
    const id = box.mail[0].id as string;
    const claims = await Promise.all(Array.from({ length: 4 }, () => call('POST', `/api/mail/${id}/claim`, auth(p.token))));
    expect(claims.filter((c) => c.statusCode === 200)).toHaveLength(1);
    expect(claims.filter((c) => code(c) === 'mail_claimed')).toHaveLength(3);
    const ok = claims.find((c) => c.statusCode === 200)!.json();
    expect(ok.wallet).toEqual({ balance: ECONOMY.welcome.silver + 1500, gold: ECONOMY.welcome.gold + 3 });
    expect(ok.unread).toBe(0);
    const [ledger] = await t.db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM ledger_entries WHERE user_id = ${p.user.id} AND reason = 'mail' AND ref = ${`mail:${id}`}`);
    expect(Number(ledger!.n)).toBe(2);
    const inv = (await call('GET', '/api/me/inventory', auth(p.token))).json().items as { itemId: string; source: string }[];
    expect(inv.filter((i) => i.itemId === 'lucky_chip' && i.source === 'mail')).toHaveLength(1);
  });

  it('a unique item already owned is reported, not duplicated', async () => {
    const p = await register(t);
    await call('POST', '/api/shop/buy', auth(p.token), { itemId: 'silver' });
    await sendTo([p.user.uid], [{ type: 'item', itemId: 'silver' }]);
    const id = (await call('GET', '/api/mail', auth(p.token))).json().mail[0].id;
    expect((await call('POST', `/api/mail/${id}/claim`, auth(p.token))).json().mail.claimResult).toEqual([{ index: 0, outcome: 'already_owned' }]);
  });

  it('expired mail cannot be claimed; mail with open attachments cannot be deleted', async () => {
    const p = await register(t);
    await sendTo([p.user.uid], [{ type: 'silver', amount: 10 }]);
    const id = (await call('GET', '/api/mail', auth(p.token))).json().mail[0].id;
    expect(code(await call('DELETE', `/api/mail/${id}`, auth(p.token)))).toBe('bad_request');
    await t.db.execute(sql`UPDATE mail_messages SET expires_at = now() - interval '1 minute' WHERE id = ${id}`);
    expect(code(await call('POST', `/api/mail/${id}/claim`, auth(p.token)))).toBe('mail_expired');
    expect((await call('DELETE', `/api/mail/${id}`, auth(p.token))).statusCode).toBe(200);
  });

  it('claim-all claims every open mail once', async () => {
    const p = await register(t);
    await sendTo([p.user.uid], [{ type: 'silver', amount: 100 }]);
    await sendTo([p.user.uid], [{ type: 'silver', amount: 200 }]);
    await sendTo([p.user.uid], []); // notice without attachments
    const res = (await call('POST', '/api/mail/claim-all', auth(p.token))).json();
    expect(res.claimed).toHaveLength(2);
    expect(res.wallet.balance).toBe(ECONOMY.welcome.silver + 300);
    expect((await call('POST', '/api/mail/claim-all', auth(p.token))).json().claimed).toHaveLength(0);
  });

  it('players cannot read or claim someone else’s mail', async () => {
    const a = await register(t);
    const b = await register(t);
    await sendTo([a.user.uid], [{ type: 'silver', amount: 50 }]);
    const id = (await call('GET', '/api/mail', auth(a.token))).json().mail[0].id;
    expect(code(await call('POST', `/api/mail/${id}/claim`, auth(b.token)))).toBe('not_found');
    expect(code(await call('POST', `/api/mail/${id}/read`, auth(b.token)))).toBe('not_found');
  });

  it('an unverified account must verify before claiming', async () => {
    const p = await registerPending(t);
    await sendTo([p.user.uid], [{ type: 'silver', amount: 50 }]);
    const id = (await call('GET', '/api/mail', auth(p.token))).json().mail[0].id;
    expect(code(await call('POST', `/api/mail/${id}/claim`, auth(p.token)))).toBe('email_not_verified');
  });

  it('broadcasts to every player (not Keyo Support), once per idempotency key', async () => {
    const body = { target: { all: true }, kind: 'event', subject: 'Maintenance tonight', body: '', attachments: [], idempotencyKey: randomUUID() };
    const first = (await call('POST', '/api/admin/mail', owner.headers, body)).json();
    const again = (await call('POST', '/api/admin/mail', owner.headers, body)).json();
    const [players] = await t.db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM users WHERE account_type = 'player' AND status <> 'deleted'`);
    expect(first.recipients).toBe(Number(players!.n));
    expect(again).toMatchObject({ replayed: true, batchId: first.batchId });
    const [batches] = await t.db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM mail_batches WHERE subject = 'Maintenance tonight'`);
    expect(Number(batches!.n)).toBe(1);
  });

  it('refuses unknown UIDs and unknown items, and needs mail.send', async () => {
    expect(code(await sendTo([987654], []))).toBe('not_found');
    const p = await register(t);
    expect(code(await sendTo([p.user.uid], [{ type: 'item', itemId: 'no_such_item' }]))).toBe('item_not_found');
    const adm = await createStaff(t, 'admin');
    expect(code(await call('POST', '/api/admin/mail', adm.headers, { target: { uids: [p.user.uid] }, kind: 'admin', subject: 'x', attachments: [], idempotencyKey: randomUUID() }))).toBe('forbidden');
  });
});

describe('CORS', () => {
  it('lets the apps (other origin) send PUT uploads and DELETE requests', async () => {
    for (const method of ['PUT', 'DELETE']) {
      const res = await t.app.inject({ method: 'OPTIONS', url: '/api/mail/x', headers: { origin: 'http://localhost:5173', 'access-control-request-method': method } });
      expect(String(res.headers['access-control-allow-methods'])).toContain(method);
    }
  });
});
