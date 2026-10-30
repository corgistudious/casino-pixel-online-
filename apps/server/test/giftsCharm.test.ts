import { randomUUID } from 'node:crypto';
import { GIFT_PRICE_PROPOSAL, GIFT_RULES, type GiftShopView, type GiftTxView, type PlayerProfileView, type StaffGiftTxView, type StaffGiftView } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uncoveredForeignKeys } from '../src/maintenance/testData';
import { applyDelta } from '../src/services/wallet';
import { createOwner, createStaff, randomIp, register, startTestApp, TestSocket, type TestApp } from './helpers';

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

/** A sender that passes the anti-farming checks (verified, older than 72 h) with money. */
async function sender(silver = 2_000_000, gold = 0): Promise<P> {
  const p = await register(t);
  await t.db.execute(sql`UPDATE users SET created_at = now() - interval '10 days' WHERE id = ${p.user.id}::uuid`);
  // Exact balances (the account already holds its welcome reward): adjust through the ledger.
  const [w] = await rows<{ balance: string; gold: string }>(sql`SELECT balance, gold FROM wallets WHERE user_id = ${p.user.id}::uuid`);
  if (silver !== Number(w!.balance)) await applyDelta(t.db, p.user.id, silver - Number(w!.balance), 'admin_adjust');
  if (gold !== Number(w!.gold)) await applyDelta(t.db, p.user.id, gold - Number(w!.gold), 'admin_adjust', null, 'gold');
  return p;
}
async function wallet(p: P) {
  const [r] = await rows<{ balance: string; gold: string; ls: string; lg: string }>(sql`
    SELECT balance, gold,
      (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = ${p.user.id}::uuid AND currency = 'silver') AS ls,
      (SELECT coalesce(sum(delta), 0) FROM ledger_entries WHERE user_id = ${p.user.id}::uuid AND currency = 'gold') AS lg
    FROM wallets WHERE user_id = ${p.user.id}::uuid`);
  // The wallet always equals its ledger.
  expect(r!.balance).toBe(r!.ls);
  expect(r!.gold).toBe(r!.lg);
  return { silver: Number(r!.balance), gold: Number(r!.gold) };
}
async function charm(p: P) {
  const [r] = await rows<{ total: string | null; ledger: string }>(sql`
    SELECT (SELECT total FROM charm_points WHERE user_id = ${p.user.id}::uuid) AS total,
      (SELECT coalesce(sum(delta), 0) FROM charm_ledger WHERE user_id = ${p.user.id}::uuid) AS ledger`);
  // Charm Points always equal their ledger.
  expect(Number(r!.total ?? 0)).toBe(Number(r!.ledger));
  return Number(r!.total ?? 0);
}
const send = (from: P, to: P, giftId: string, expectedPrice: number, extra: Partial<{ id: string; quantity: number; anonymous: boolean; message: string }> = {}) =>
  call(auth(from), 'POST', '/api/gifts/send', { id: randomUUID(), uid: to.user.uid, giftId, expectedPrice, ...extra });

async function putGift(id: string, patch: Partial<StaffGiftView & { onSale: boolean }> = {}) {
  const base = GIFT_PRICE_PROPOSAL.find((g) => g.id === id)!;
  // Event and limited gifts must carry an end date to be on sale.
  const endsAt = base.category === 'event' || base.category === 'limited' ? new Date(Date.now() + 30 * 86_400_000).toISOString() : null;
  const res = await call(owner.headers, 'PUT', `/api/admin/gifts/${id}`, { ...base, iconAsset: null, startsAt: null, endsAt, onSale: true, ...patch });
  expect(res.statusCode).toBe(200);
}

describe('gift catalogue', () => {
  it('starts empty; the suggested catalogue loads as drafts only (nothing on sale until staff switch it on)', async () => {
    const p = await sender();
    expect(((await call(auth(p), 'GET', '/api/gifts/shop')).json() as GiftShopView).gifts).toEqual([]);
    const mod = await createStaff(t, 'moderator');
    expect((await call(auth(mod), 'POST', '/api/admin/gifts/import-proposal')).statusCode).toBe(403);
    const imp = await call(auth(owner), 'POST', '/api/admin/gifts/import-proposal');
    expect(imp.json().added).toBe(GIFT_PRICE_PROPOSAL.length);
    expect((imp.json().gifts as StaffGiftView[]).every((g) => !g.onSale)).toBe(true);
    // Importing again never overwrites edited gifts.
    expect((await call(auth(owner), 'POST', '/api/admin/gifts/import-proposal')).json().added).toBe(0);
    expect(((await call(auth(p), 'GET', '/api/gifts/shop')).json() as GiftShopView).gifts).toEqual([]);
    await putGift('rose');
    await putGift('teddy');
    await putGift('crown');
    await putGift('silver_ring');
    const shop = (await call(auth(p), 'GET', '/api/gifts/shop')).json() as GiftShopView;
    expect(shop.gifts.map((g) => g.id)).toEqual(['rose', 'teddy', 'silver_ring', 'crown']);
    expect(shop.blocked).toBeNull();
  });

  it('event and limited gifts need an end date to go on sale; sale windows are enforced', async () => {
    const base = GIFT_PRICE_PROPOSAL.find((g) => g.id === 'fireworks')!;
    const res = await call(owner.headers, 'PUT', '/api/admin/gifts/fireworks', { ...base, iconAsset: null, startsAt: null, endsAt: null, onSale: true });
    expect(res.statusCode).toBe(400);
    await putGift('fireworks', { startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString() } as never);
    const [a, b] = [await sender(), await sender()];
    expect(code(await send(a, b, 'fireworks', 15_000))).toBe('gift_unavailable');
  });
});

describe('sending a gift', () => {
  it('debits the sender, adds charm to the receiver, writes both ledgers, in one step; history and showcase follow', async () => {
    const [a, b] = [await sender(), await sender()];
    const ws = await TestSocket.connect(t.port, b.token);
    const before = await wallet(a);
    const res = await send(a, b, 'teddy', 10_000, { quantity: 3, message: 'Chúc mừng!' });
    expect(res.statusCode).toBe(200);
    const g = res.json().gift as GiftTxView;
    expect(g).toMatchObject({ direction: 'sent', quantity: 3, charm: 300, price: { total: 30_000, currency: 'silver' }, other: { uid: b.user.uid } });
    expect((await wallet(a)).silver).toBe(before.silver - 30_000);
    expect(await charm(b)).toBe(300);
    expect(await charm(a)).toBe(0);
    // The receiver is told (with the sender, since it is not anonymous) and counters are pushed.
    expect(await ws.waitFor((m) => m.event === 'social' && m.data.kind === 'gift_received')).toMatchObject({ data: { uid: a.user.uid } });
    expect(await ws.waitFor((m) => m.event === 'counts' && m.data.uid === b.user.uid)).toMatchObject({ data: { charm: 300 } });
    ws.close();
    const recv = (await call(auth(b), 'GET', '/api/gifts/history?direction=received')).json().gifts as GiftTxView[];
    expect(recv[0]).toMatchObject({ direction: 'received', other: { uid: a.user.uid }, charm: 300, price: null, message: 'Chúc mừng!' });
    const prof = (await call(auth(a), 'GET', `/api/players/${b.user.uid}`)).json().player as PlayerProfileView;
    expect(prof.counts.charm).toBe(300);
    expect(prof.gifts!.byGift[0]).toMatchObject({ gift: { id: 'teddy' }, count: 3, charm: 300 });
    expect(prof.gifts!.recent[0]!.price).toBeNull();
    const [led] = await rows<{ reason: string; delta: string; ref: string }>(sql`SELECT reason, delta, ref FROM ledger_entries WHERE user_id = ${a.user.id}::uuid AND reason = 'gift_shop'`);
    expect(led).toMatchObject({ delta: '-30000', ref: `giftshop:${g.id}` });
  });

  it('is idempotent: a retried request never charges or adds charm twice; another request under the same id is refused', async () => {
    const [a, b] = [await sender(), await sender()];
    const id = randomUUID();
    const before = await wallet(a);
    const results = await Promise.all(Array.from({ length: 8 }, () => send(a, b, 'rose', 500, { id })));
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect(results.filter((r) => r.json().replayed === false)).toHaveLength(1);
    expect((await wallet(a)).silver).toBe(before.silver - 500);
    expect(await charm(b)).toBe(5);
    expect(code(await send(a, b, 'rose', 500, { id, quantity: 2 }))).toBe('idempotency_conflict');
    // Same key with a different confirmed price or message must not silently replay.
    expect(code(await send(a, b, 'rose', 501, { id }))).toBe('idempotency_conflict');
    expect(code(await send(a, b, 'rose', 500, { id, message: 'Changed note' }))).toBe('idempotency_conflict');
    expect(code(await send(a, b, 'rose', 500, { id, anonymous: true }))).toBe('idempotency_conflict');
    // A matching retry remains valid even if the live catalogue price changes later.
    await putGift('rose', { price: 600 });
    const retry = await send(a, b, 'rose', 500, { id });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().replayed).toBe(true);
    await putGift('rose'); // Restore shared catalogue fixture for subsequent tests.
    expect((await wallet(a)).silver).toBe(before.silver - 500);
    expect(await charm(b)).toBe(5);
    expect(Number((await rows<{ c: string }>(sql`SELECT count(*) AS c FROM charm_ledger WHERE gift_tx_id = ${id}::uuid`))[0]!.c)).toBe(1);
  });

  it('never goes negative under concurrency: with money for 3, exactly 3 of 10 parallel gifts succeed', async () => {
    const a = await sender(30_000);
    const b = await sender();
    const res = await Promise.all(Array.from({ length: 10 }, () => send(a, b, 'teddy', 10_000)));
    expect(res.filter((r) => r.statusCode === 200)).toHaveLength(3);
    expect(res.filter((r) => code(r) === 'insufficient_funds')).toHaveLength(7);
    expect((await wallet(a)).silver).toBe(0);
    expect(await charm(b)).toBe(300);
    expect(Number((await rows<{ c: string }>(sql`SELECT count(*) AS c FROM gift_transactions WHERE sender_id = ${a.user.id}::uuid`))[0]!.c)).toBe(3);
  });

  it('refuses: self, blocked, unknown/hidden accounts, changed price, unpaid — and writes nothing', async () => {
    const [a, b] = [await sender(), await sender()];
    expect(code(await send(a, a, 'rose', 500))).toBe('self_social');
    expect(code(await send(a, b, 'rose', 400))).toBe('gift_price_changed');
    expect(code(await call(auth(a), 'POST', '/api/gifts/send', { id: randomUUID(), uid: 999_999_999, giftId: 'rose', expectedPrice: 500 }))).toBe('not_found');
    expect(code(await send(a, b, 'yacht', 1_000_000))).toBe('gift_unavailable'); // not on sale
    await call(auth(b), 'POST', '/api/players/block', { uid: a.user.uid });
    expect(code(await send(a, b, 'rose', 500))).toBe('blocked');
    const poor = await sender(100);
    const c = await sender();
    expect(code(await send(poor, c, 'rose', 500))).toBe('insufficient_funds');
    expect(code(await send(a, c, 'crown', 100))).toBe('insufficient_funds'); // gold gift, no gold
    expect(await charm(b)).toBe(0);
    expect(await charm(c)).toBe(0);
    expect(Number((await rows<{ c: string }>(sql`SELECT count(*) AS c FROM gift_transactions WHERE sender_id IN (${a.user.id}::uuid, ${poor.user.id}::uuid)`))[0]!.c)).toBe(0);
  });

  it('anti-farming: unverified or brand-new accounts cannot send; daily, per-gift and per-pair limits hold', async () => {
    const fresh = await register(t);
    await applyDelta(t.db, fresh.user.id, 10_000, 'admin_adjust');
    const b = await sender();
    expect(code(await send(fresh, b, 'rose', 500))).toBe('account_too_new');
    expect(((await call(auth(fresh), 'GET', '/api/gifts/shop')).json() as GiftShopView).blocked).toBe('account_too_new');
    const unverified = await sender();
    await t.db.execute(sql`UPDATE users SET email_verified_at = NULL WHERE id = ${unverified.user.id}::uuid`);
    expect(code(await send(unverified, b, 'rose', 500))).toBe('email_not_verified');
    // Per-gift daily limit (silver ring: 5 a day).
    const a = await sender();
    expect((await send(a, b, 'silver_ring', 50_000, { quantity: 5 })).statusCode).toBe(200);
    expect(code(await send(a, b, 'silver_ring', 50_000))).toBe('gift_daily_limit');
    // Per pair: at most GIFT_RULES.pairDailyCharm charm a day from one sender to one receiver
    // (checked with a gold gift so the silver daily cap is not what stops it).
    const c = await sender(2_000_000, 1_000);
    const [d, e] = [await sender(), await sender()];
    await putGift('gold_watch', { dailyLimit: null } as never);
    expect((await send(c, d, 'gold_watch', 100_000, { quantity: GIFT_RULES.pairDailyCharm / 1_000 })).statusCode).toBe(200);
    expect(code(await send(c, d, 'crown', 100))).toBe('gift_limit');
    expect((await send(c, e, 'crown', 100)).statusCode).toBe(200);
    expect(await charm(d)).toBe(GIFT_RULES.pairDailyCharm);
  });

  it('gold gifts take Cxu Vàng only; follows, likes and friendship never add charm', async () => {
    const a = await sender(0, 500);
    const b = await sender();
    expect((await send(a, b, 'crown', 100)).statusCode).toBe(200);
    expect(await wallet(a)).toEqual({ silver: 0, gold: 400 });
    expect(await charm(b)).toBe(1_500);
    const fan = await sender();
    await call(auth(fan), 'POST', '/api/players/follow', { uid: b.user.uid });
    await call(auth(fan), 'POST', '/api/players/like', { uid: b.user.uid });
    await call(auth(fan), 'POST', '/api/friends/request', { uid: b.user.uid });
    await call(auth(b), 'POST', '/api/friends/accept', { uid: fan.user.uid });
    expect(await charm(b)).toBe(1_500);
  });

  it('anonymous gifts hide the sender from the receiver and everyone else; staff still see who sent it', async () => {
    const [a, b, viewer] = [await sender(), await sender(), await sender()];
    const ws = await TestSocket.connect(t.port, b.token);
    const sent = (await send(a, b, 'rose', 500, { anonymous: true })).json().gift as GiftTxView;
    const note = await ws.waitFor((m) => m.event === 'social' && m.data.kind === 'gift_received');
    expect(note.data.uid).toBeUndefined();
    ws.close();
    const recv = (await call(auth(b), 'GET', '/api/gifts/history?direction=received')).json().gifts as GiftTxView[];
    expect(recv[0]).toMatchObject({ anonymous: true, other: null });
    expect(JSON.stringify(recv)).not.toContain(String(a.user.uid));
    const show = (await call(auth(viewer), 'GET', `/api/players/${b.user.uid}/gifts`)).json().gifts;
    expect(JSON.stringify(show)).not.toContain(String(a.user.uid));
    // The sender sees their own gift normally.
    expect(((await call(auth(a), 'GET', '/api/gifts/history?direction=sent')).json().gifts as GiftTxView[])[0]).toMatchObject({ other: { uid: b.user.uid }, anonymous: true });
    const staff = (await call(auth(owner), 'GET', `/api/admin/gifts/transactions?uid=${b.user.uid}`)).json().transactions as StaffGiftTxView[];
    expect(staff.find((x) => x.id === sent.id)).toMatchObject({ sender: { uid: a.user.uid }, anonymous: true });
  });

  it('the showcase follows the owner privacy switch', async () => {
    const [a, b, viewer] = [await sender(), await sender(), await sender()];
    await send(a, b, 'rose', 500);
    expect((await call(auth(b), 'PUT', '/api/me/privacy', { showGifts: false })).statusCode).toBe(200);
    expect((await call(auth(viewer), 'GET', `/api/players/${b.user.uid}/gifts`)).json().gifts).toBeNull();
    const prof = (await call(auth(viewer), 'GET', `/api/players/${b.user.uid}`)).json().player as PlayerProfileView;
    expect(prof.gifts).toBeNull();
    expect(prof.counts.charm).toBe(5); // the number itself stays public
    expect((await call(auth(b), 'GET', `/api/players/${b.user.uid}/gifts`)).json().gifts.receivedCount).toBe(1);
  });
});

describe('staff: prices, reversal, charm adjustments', () => {
  it('a price change applies to new gifts only; past transactions keep their price (audited)', async () => {
    const [a, b] = [await sender(), await sender()];
    const first = (await send(a, b, 'rose', 500)).json().gift as GiftTxView;
    await putGift('rose', { price: 700, charm: 7 } as never);
    expect(code(await send(a, b, 'rose', 500))).toBe('gift_price_changed');
    expect((await send(a, b, 'rose', 700)).statusCode).toBe(200);
    const tx = (await call(auth(owner), 'GET', `/api/admin/gifts/transactions?uid=${a.user.uid}`)).json().transactions as StaffGiftTxView[];
    expect(tx.find((x) => x.id === first.id)).toMatchObject({ unitPrice: 500, charm: 5 });
    const audits = await rows<{ details: { before: { price: number }; after: { price: number } } }>(sql`SELECT details FROM audit_logs WHERE action = 'gift.update' AND target_id = 'rose' ORDER BY id DESC LIMIT 1`);
    expect(audits[0]!.details.before.price).toBe(500);
    expect(audits[0]!.details.after.price).toBe(700);
    await putGift('rose', { price: 500, charm: 5 } as never);
  });

  it('reversal removes the charm once, refunds through the ledger when asked, keeps the history (re-auth, audited)', async () => {
    const [a, b] = [await sender(), await sender()];
    const g = (await send(a, b, 'teddy', 10_000, { quantity: 2 })).json().gift as GiftTxView;
    const afterSend = await wallet(a);
    const url = `/api/admin/gifts/transactions/${g.id}/reverse`;
    const body = { reason: 'Charm farming', refund: true, idempotencyKey: randomUUID() };
    expect(code(await call(auth(owner), 'POST', url, body))).toBe('reauth_required');
    const mod = await createStaff(t, 'moderator');
    expect((await call(mod.headers, 'POST', url, body)).statusCode).toBe(403);
    expect((await call(owner.headers, 'POST', url, body)).statusCode).toBe(200);
    expect((await call(owner.headers, 'POST', url, body)).json().replayed).toBe(true);
    expect(code(await call(owner.headers, 'POST', url, { ...body, idempotencyKey: randomUUID() }))).toBe('already_reversed');
    expect(await charm(b)).toBe(0);
    expect((await wallet(a)).silver).toBe(afterSend.silver + 20_000);
    const [row] = await rows<{ status: string; refunded: boolean }>(sql`SELECT status, refunded FROM gift_transactions WHERE id = ${g.id}::uuid`);
    expect(row).toEqual({ status: 'reversed', refunded: true });
  });

  it('charm adjustments need a reason and re-auth, never go below zero, are audited; Moderators have no access', async () => {
    const p = await sender();
    const url = `/api/admin/charm/${p.user.uid}`;
    const mod = await createStaff(t, 'moderator');
    expect((await call(mod.headers, 'GET', url)).statusCode).toBe(403);
    expect((await call(owner.headers, 'POST', url, { delta: 50, reason: '', idempotencyKey: randomUUID() })).statusCode).toBe(400);
    expect((await call(owner.headers, 'POST', url, { delta: 50, reason: 'Event prize', idempotencyKey: randomUUID() })).json().charm).toBe(50);
    expect((await call(owner.headers, 'POST', url, { delta: -80, reason: 'Too much', idempotencyKey: randomUUID() })).statusCode).toBe(400);
    expect((await call(owner.headers, 'POST', url, { delta: -20, reason: 'Correction', idempotencyKey: randomUUID() })).json().charm).toBe(30);
    const view = (await call(owner.headers, 'GET', url)).json();
    expect(view.events.map((e: { delta: number }) => e.delta)).toEqual([-20, 50]);
    expect(view.events[0]).toMatchObject({ reason: 'admin_adjust', note: 'Correction', actor: { uid: 1002 } });
    expect(await charm(p)).toBe(30);
    const sa = await createStaff(t, 'super_admin');
    expect(code(await call(sa.headers, 'POST', '/api/admin/charm/1002', { delta: 1, reason: 'nope nope', idempotencyKey: randomUUID() }))).toBe('protected_account');
    expect(code(await call(sa.headers, 'POST', `/api/admin/charm/${sa.user.uid}`, { delta: 1, reason: 'self grant', idempotencyKey: randomUUID() }))).toBe('self_action_forbidden');
  });

  it('charm leaderboard ranks by charm; the wealth leaderboard is unchanged; reset coverage includes the new tables', async () => {
    const board = (await call(auth(owner), 'GET', '/api/charm/leaderboard')).json().entries as { charm: number }[];
    expect(board.length).toBeGreaterThan(0);
    expect([...board].sort((x, y) => y.charm - x.charm)).toEqual(board);
    const wealth = (await call({}, 'GET', '/api/leaderboard')).json();
    expect(JSON.stringify(wealth)).not.toContain('charm');
    expect(await uncoveredForeignKeys(t.db)).toEqual([]);
  });
});
