import type { CardTableView, Card, Hand, RoomSummary, RoomView } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyDelta } from '../src/services/wallet';
import { createStaff, randomIp, register, startTestApp, TestSocket, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.app.close();
});

type P = Awaited<ReturnType<typeof register>> & { ws: TestSocket };
async function player(): Promise<P> {
  const r = await register(t);
  await applyDelta(t.db, r.user.id, 500_000, 'admin_adjust');
  return { ...r, ws: await TestSocket.connect(t.port, r.token) };
}
const api = (p: { token: string }, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
  t.app.inject({ method, url, payload, headers: { authorization: `Bearer ${p.token}` }, remoteAddress: randomIp() });
const code = (res: { json: () => { error?: { code: string } } }) => res.json().error?.code;
const wsCode = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error!.code);
const rows = async <T>(q: ReturnType<typeof sql>) => (await t.db.execute(q)) as unknown as T[];
const balance = async (userId: string) => Number((await rows<{ balance: string }>(sql`SELECT balance FROM wallets WHERE user_id = ${userId}::uuid`))[0]!.balance);
const enc = encodeURIComponent;
async function createRoom(owner: P, body: object): Promise<RoomView> {
  const res = await api(owner, 'POST', '/api/rooms', body);
  expect(res.statusCode, res.body).toBe(200);
  return res.json().room as RoomView;
}
/** Chips in play: wallets plus stacks at the table (a closed system for the players involved). */
async function chipsOf(tableId: string, ps: P[]) {
  let sum = 0;
  for (const p of ps) sum += await balance(p.user.id);
  const [s] = await rows<{ n: string }>(sql`SELECT coalesce(sum(stack), 0) AS n FROM card_seats WHERE table_id = ${tableId}`);
  return sum + Number(s!.n);
}

describe('player rooms', () => {
  it('creates a private Poker room: the hash never leaves the server, one open room per host, official lobbies unchanged', async () => {
    const owner = await player();
    const room = await createRoom(owner, { game: 'poker', name: 'Bàn Bạn Bè', visibility: 'private', password: 'secret1', stake: 500, seats: 4 });
    expect(room).toMatchObject({ engine: 'card', game: 'poker', locked: true, isOwner: true, access: true, seats: 4, stake: 500, range: [10_000, 100_000], status: 'waiting' });
    const list = (await api(owner, 'GET', '/api/rooms?game=poker')).json().rooms as RoomSummary[];
    expect(list.map((r) => r.id)).toContain(room.id);
    expect(JSON.stringify(list)).not.toMatch(/secret1|argon|password_hash|passwordHash/);
    expect(code(await api(owner, 'POST', '/api/rooms', { game: 'blackjack', name: 'Second', visibility: 'public', stake: 100 }))).toBe('room_limit');
    // Validation: password required for private, stakes from the list only, seats within the game.
    for (const body of [
      { game: 'xito', name: 'NoPass', visibility: 'private', stake: 100 },
      { game: 'xito', name: 'Odd', visibility: 'public', stake: 123 },
      { game: 'xito', name: 'Big', visibility: 'public', stake: 100, seats: 6 },
    ]) expect((await api(await player(), 'POST', '/api/rooms', body)).statusCode).toBe(400);
    const official = (await t.app.inject({ url: '/api/cards/tables' })).json().tables as { id: string }[];
    expect(official.map((x) => x.id)).toEqual(['poker-1', 'poker-2', 'lieng-1', 'xito-1']);
    expect(code(await t.app.inject({ url: `/api/cards/tables/${room.tableId}` }))).toBe('table_not_found');
  });

  it('a locked room refuses watching and sitting until the right password; wrong guesses are rate limited', async () => {
    const owner = await player();
    const room = await createRoom(owner, { game: 'lieng', name: 'Khóa', visibility: 'private', password: 'open-sesame', stake: 100 });
    const guest = await player();
    expect(wsCode(await guest.ws.request({ type: 'card.join', tableId: room.tableId }))).toBe('room_locked');
    expect(wsCode(await guest.ws.request({ type: 'card.sit', tableId: room.tableId, seat: 1, buyIn: 2_000 }))).toBe('room_locked');
    expect(code(await api(guest, 'POST', `/api/rooms/${enc(room.id)}/join`, {}))).toBe('room_locked');
    expect(code(await api(guest, 'POST', `/api/rooms/${enc(room.id)}/join`, { password: 'wrong' }))).toBe('room_password');
    expect((await api(guest, 'GET', `/api/rooms/${enc(room.id)}`)).json().room.access).toBe(false);
    const ok = await api(guest, 'POST', `/api/rooms/${enc(room.id)}/join`, { password: 'open-sesame' });
    expect(ok.json().room.access).toBe(true);
    const view = await guest.ws.ok<CardTableView>({ type: 'card.join', tableId: room.tableId });
    expect(view.table.config.bigBlind).toBe(100);
    // Seats and buy-in limits of the room apply.
    expect(wsCode(await guest.ws.request({ type: 'card.sit', tableId: room.tableId, seat: 1, buyIn: 100 }))).toBe('buyin_range');
    expect(wsCode(await guest.ws.request({ type: 'card.sit', tableId: room.tableId, seat: 6, buyIn: 2_000 }))).not.toBeNull();
    expect((await guest.ws.request({ type: 'card.sit', tableId: room.tableId, seat: 1, buyIn: 2_000 })).ok).toBe(true);

    // Brute force: 5 wrong guesses lock the room for that player, even with the right password.
    const thief = await player();
    for (let i = 0; i < 5; i++) expect(code(await api(thief, 'POST', `/api/rooms/${enc(room.id)}/join`, { password: `guess${i}` }))).toBe('room_password');
    expect(code(await api(thief, 'POST', `/api/rooms/${enc(room.id)}/join`, { password: 'open-sesame' }))).toBe('too_many_attempts');
    expect(wsCode(await thief.ws.request({ type: 'card.sit', tableId: room.tableId, seat: 2, buyIn: 2_000 }))).toBe('room_locked');
    // Once the window has passed the right password works again.
    await t.db.execute(sql`UPDATE room_join_attempts SET window_start = now() - interval '1 hour' WHERE user_id = ${thief.user.id}::uuid`);
    expect((await api(thief, 'POST', `/api/rooms/${enc(room.id)}/join`, { password: 'open-sesame' })).statusCode).toBe(200);
    for (const p of [owner, guest, thief]) p.ws.close();
  });

  it('two players racing for one seat: one sits, the other is refused and keeps every Cxu', async () => {
    const owner = await player();
    const room = await createRoom(owner, { game: 'xito', name: 'Race', visibility: 'public', stake: 100 });
    const [a, b] = [await player(), await player()];
    const [ba, bb] = [await balance(a.user.id), await balance(b.user.id)];
    const res = await Promise.all([a, b].map((p) => p.ws.request({ type: 'card.sit', tableId: room.tableId, seat: 0, buyIn: 2_000 })));
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    expect(res.filter((r) => !r.ok).map(wsCode)).toEqual(['seat_taken']);
    expect((await balance(a.user.id)) + (await balance(b.user.id))).toBe(ba + bb - 2_000);
    expect((await rows(sql`SELECT 1 FROM card_seats WHERE table_id = ${room.tableId}`)).length).toBe(1);
    for (const p of [owner, a, b]) p.ws.close();
  });

  it('settings cannot change mid-hand; a kicked player in a hand is paid out once at the end and cannot come back', async () => {
    const owner = await player();
    const room = await createRoom(owner, { game: 'poker', name: 'Live', visibility: 'private', password: 'pw1234', stake: 100, seats: 3 });
    const guest = await player();
    await api(guest, 'POST', `/api/rooms/${enc(room.id)}/join`, { password: 'pw1234' });
    await owner.ws.ok({ type: 'card.sit', tableId: room.tableId, seat: 0, buyIn: 2_000 });
    await guest.ws.ok({ type: 'card.sit', tableId: room.tableId, seat: 1, buyIn: 2_000 });
    const before = await chipsOf(room.tableId, [owner, guest]);
    await t.cards.tick();
    const [hand] = await rows<{ id: string; state: Hand }>(sql`SELECT id, state FROM card_hands WHERE table_id = ${room.tableId} AND status = 'active'`);
    expect(hand).toBeTruthy();
    expect(code(await api(owner, 'PATCH', `/api/rooms/${enc(room.id)}`, { password: 'newpass' }))).toBe('room_busy');
    expect(code(await api(owner, 'PATCH', `/api/rooms/${enc(room.id)}`, { stake: 500 }))).toBe('room_busy');
    expect(code(await api(guest, 'PATCH', `/api/rooms/${enc(room.id)}`, { name: 'Mine now' }))).toBe('not_room_owner');
    expect(code(await api(owner, 'POST', `/api/rooms/${enc(room.id)}/kick`, { uid: owner.user.uid }))).toBe('self_social');

    // Kick during the hand: the guest is folded/stood on their turn, chips settle once.
    expect((await api(owner, 'POST', `/api/rooms/${enc(room.id)}/kick`, { uid: guest.user.uid })).statusCode).toBe(200);
    expect((await rows<{ status: string }>(sql`SELECT status FROM card_seats WHERE table_id = ${room.tableId} AND user_id = ${guest.user.id}::uuid`))[0]!.status).toBe('leaving');
    for (let i = 0; i < 20; i++) {
      const [h] = await rows<{ status: string }>(sql`SELECT status FROM card_hands WHERE id = ${hand!.id}::uuid`);
      if (h!.status !== 'active') break;
      await t.db.execute(sql`UPDATE card_hands SET deadline = now() - interval '1 second' WHERE id = ${hand!.id}::uuid`);
      await t.cards.tick();
    }
    await t.db.execute(sql`UPDATE card_hands SET ended_at = now() - interval '1 minute' WHERE table_id = ${room.tableId}`);
    await t.cards.setStatus(room.tableId, 'paused');
    await t.cards.tick();
    expect((await rows(sql`SELECT 1 FROM card_seats WHERE table_id = ${room.tableId} AND user_id = ${guest.user.id}::uuid`)).length).toBe(0);
    // No Cxu created or lost: wallets + stacks are unchanged; one settled round per player for that hand.
    expect(await chipsOf(room.tableId, [owner, guest])).toBe(before);
    expect((await rows(sql`SELECT 1 FROM game_rounds WHERE idempotency_key LIKE ${`%${hand!.id}%`}`)).length).toBeLessThanOrEqual(2);
    expect(wsCode(await guest.ws.request({ type: 'card.join', tableId: room.tableId }))).toBe('room_kicked');
    expect(code(await api(guest, 'POST', `/api/rooms/${enc(room.id)}/join`, { password: 'pw1234' }))).toBe('room_kicked');
    // Between hands the host may change settings; a new password shuts out unseated password holders.
    await t.cards.setStatus(room.tableId, 'open');
    expect((await api(owner, 'PATCH', `/api/rooms/${enc(room.id)}`, { password: 'rotated', stake: 500 })).statusCode).toBe(200);
    const late = await player();
    expect(code(await api(late, 'POST', `/api/rooms/${enc(room.id)}/join`, { password: 'pw1234' }))).toBe('room_password');
    owner.ws.close();
    guest.ws.close();
    late.ws.close();
  });

  it('invites go to friends only, grant access without the password, and are refused when the room is full', async () => {
    const owner = await player();
    const room = await createRoom(owner, { game: 'blackjack', name: 'Hội Bạn', visibility: 'private', password: 'bjpass', stake: 100, seats: 2 });
    const [friend, stranger] = [await player(), await player()];
    expect(code(await api(owner, 'POST', `/api/rooms/${enc(room.id)}/invite`, { uid: stranger.user.uid }))).toBe('not_friends');
    await api(owner, 'POST', '/api/friends/request', { uid: friend.user.uid });
    await api(friend, 'POST', '/api/friends/accept', { uid: owner.user.uid });
    expect((await api(owner, 'POST', `/api/rooms/${enc(room.id)}/invite`, { uid: friend.user.uid })).statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(friend.ws.events.some((e) => e.type === 'event' && e.event === 'roomInvite')).toBe(true);
    expect((await api(friend, 'GET', `/api/rooms/${enc(room.id)}`)).json().room.access).toBe(true);
    await owner.ws.ok({ type: 'bjt.sit', tableId: room.tableId, seat: 0 });
    await friend.ws.ok({ type: 'bjt.sit', tableId: room.tableId, seat: 1 });
    // Full now: inviting someone else is refused.
    const third = await player();
    await api(owner, 'POST', '/api/friends/request', { uid: third.user.uid });
    await api(third, 'POST', '/api/friends/accept', { uid: owner.user.uid });
    expect(code(await api(owner, 'POST', `/api/rooms/${enc(room.id)}/invite`, { uid: third.user.uid }))).toBe('room_full');
    expect(wsCode(await stranger.ws.request({ type: 'bjt.sit', tableId: room.tableId, seat: 1 }))).toBe('room_locked');
    for (const p of [owner, friend, stranger, third]) p.ws.close();
  });

  it('a Blackjack room plays on the shared engine with the room limits, paying each seat once', async () => {
    const owner = await player();
    const room = await createRoom(owner, { game: 'blackjack', name: 'BJ Riêng', visibility: 'public', stake: 1_000 });
    expect(room).toMatchObject({ engine: 'bj', range: [1_000, 100_000] });
    const guest = await player();
    await owner.ws.ok({ type: 'bjt.sit', tableId: room.tableId, seat: 0 });
    await guest.ws.ok({ type: 'bjt.sit', tableId: room.tableId, seat: 1 });
    await t.bjt.tick();
    const [r] = await rows<{ id: string }>(sql`SELECT id FROM bj_rounds WHERE table_id = ${room.tableId} AND status = 'active'`);
    // owner 10,7 ; guest 10,9 ; dealer 10 up / 8 hole.
    const shoe: Card[] = ['10S', '10H', '10D', '7C', '9S', '8H'];
    await t.db.execute(sql`UPDATE bj_rounds SET state = jsonb_set(state, '{shoe}', ${JSON.stringify(shoe.slice().reverse())}::jsonb) WHERE id = ${r!.id}::uuid`);
    expect(wsCode(await owner.ws.request({ type: 'bjt.bet', tableId: room.tableId, amount: 100 }))).toBe('invalid_bet');
    const [bo, bg] = [await balance(owner.user.id), await balance(guest.user.id)];
    await owner.ws.ok({ type: 'bjt.bet', tableId: room.tableId, amount: 1_000 });
    await guest.ws.ok({ type: 'bjt.bet', tableId: room.tableId, amount: 2_000 });
    expect((await api(owner, 'GET', `/api/rooms/${enc(room.id)}`)).json().room.status).toBe('playing');
    await owner.ws.ok({ type: 'bjt.act', tableId: room.tableId, roundId: r!.id, action: 'stand' });
    await guest.ws.ok({ type: 'bjt.act', tableId: room.tableId, roundId: r!.id, action: 'stand' });
    expect(await balance(owner.user.id)).toBe(bo - 1_000);
    expect(await balance(guest.user.id)).toBe(bg + 2_000);
    await t.bjt.tick();
    expect(await balance(guest.user.id)).toBe(bg + 2_000);
    expect((await rows(sql`SELECT 1 FROM game_rounds WHERE idempotency_key LIKE ${`bjt:${r!.id}:%`}`)).length).toBe(2);
    owner.ws.close();
    guest.ws.close();
  });

  it('the host leaving hands the room on after a grace period; an empty room closes; reconnecting players see their seat', async () => {
    const owner = await player();
    const room = await createRoom(owner, { game: 'poker', name: 'Handover', visibility: 'public', stake: 100 });
    const [a, b] = [await player(), await player()];
    await owner.ws.ok({ type: 'card.sit', tableId: room.tableId, seat: 0, buyIn: 2_000 });
    await a.ws.ok({ type: 'card.sit', tableId: room.tableId, seat: 2, buyIn: 2_000 });
    await t.rooms.sweep();
    // The host drops the connection: still host while seated.
    owner.ws.close();
    await t.rooms.sweep(new Date(Date.now() + 120_000));
    expect((await api(a, 'GET', `/api/rooms/${enc(room.id)}`)).json().room.owner.uid).toBe(owner.user.uid);
    // Reconnecting shows the same seat.
    const back = await TestSocket.connect(t.port, owner.token);
    expect((await back.ok<CardTableView>({ type: 'card.join', tableId: room.tableId })).mySeat).toBe(0);
    // The host stands up and stays away: the longest-seated player becomes host.
    await back.ok({ type: 'card.stand', tableId: room.tableId });
    await b.ws.ok({ type: 'card.sit', tableId: room.tableId, seat: 1, buyIn: 2_000 });
    // Sweeps run on the clock passed in: the host was last seen at +120 s.
    await t.rooms.sweep(new Date(Date.now() + 150_000));
    expect((await api(a, 'GET', `/api/rooms/${enc(room.id)}`)).json().room.owner.uid).toBe(owner.user.uid);
    await t.rooms.sweep(new Date(Date.now() + 200_000));
    expect((await api(a, 'GET', `/api/rooms/${enc(room.id)}`)).json().room).toMatchObject({ owner: { uid: a.user.uid }, isOwner: true });
    // Everyone leaves; after the idle time the room closes and disappears from the list.
    for (const p of [a, b]) await p.ws.ok({ type: 'card.stand', tableId: room.tableId });
    await t.rooms.sweep(new Date(Date.now() + 260_000));
    expect((await api(a, 'GET', `/api/rooms/${enc(room.id)}`)).statusCode).toBe(200);
    await t.rooms.sweep(new Date(Date.now() + 200_000 + 11 * 60_000));
    expect(code(await api(a, 'GET', `/api/rooms/${enc(room.id)}`))).toBe('room_closed');
    expect(((await api(a, 'GET', '/api/rooms')).json().rooms as RoomSummary[]).some((r) => r.id === room.id)).toBe(false);
    expect(wsCode(await b.ws.request({ type: 'card.sit', tableId: room.tableId, seat: 1, buyIn: 2_000 }))).toBe('table_not_found');
    // The former host may open a new room now.
    expect((await api(owner, 'POST', '/api/rooms', { game: 'xito', name: 'Again', visibility: 'public', stake: 100 })).statusCode).toBe(200);
    for (const p of [a, b]) p.ws.close();
    back.close();
  });

  it('staff with rooms.manage list, pause, hand over and close rooms (audited); closing mid-hand settles first and loses no Cxu', async () => {
    const owner = await player();
    const room = await createRoom(owner, { game: 'poker', name: 'Staff Check', visibility: 'private', password: 'staffpw1', stake: 100, seats: 3 });
    const guest = await player();
    await api(guest, 'POST', `/api/rooms/${enc(room.id)}/join`, { password: 'staffpw1' });
    await owner.ws.ok({ type: 'card.sit', tableId: room.tableId, seat: 0, buyIn: 2_000 });
    await guest.ws.ok({ type: 'card.sit', tableId: room.tableId, seat: 1, buyIn: 2_000 });
    const before = await chipsOf(room.tableId, [owner, guest]);

    // Players and moderators (no rooms.manage) are refused; Admin may manage rooms.
    expect((await api(owner, 'GET', '/api/admin/rooms')).statusCode).toBe(403);
    const mod = await createStaff(t, 'moderator');
    expect((await api(mod, 'GET', '/api/admin/rooms')).statusCode).toBe(403);
    const admin = await createStaff(t, 'admin');
    const list = (await api(admin, 'GET', `/api/admin/rooms?uid=${owner.user.uid}`)).json().rooms as (RoomSummary & { tableStatus: string })[];
    expect(list.map((r) => r.id)).toEqual([room.id]);
    expect(list[0]).toMatchObject({ seated: 2, tableStatus: 'open', locked: true });
    expect(JSON.stringify(list)).not.toMatch(/staffpw1|argon|password/i);

    // Pause and resume.
    expect((await api(admin, 'POST', `/api/admin/rooms/${enc(room.id)}/pause`, { paused: true })).statusCode).toBe(200);
    expect((await rows<{ status: string }>(sql`SELECT status FROM card_tables WHERE id = ${room.tableId}`))[0]!.status).toBe('paused');
    await t.cards.tick();
    expect((await rows(sql`SELECT 1 FROM card_hands WHERE table_id = ${room.tableId} AND status = 'active'`)).length).toBe(0);
    expect((await api(admin, 'POST', `/api/admin/rooms/${enc(room.id)}/pause`, { paused: false })).statusCode).toBe(200);

    // Hand over to the seated guest; someone outside the room cannot receive it.
    const outsider = await player();
    expect((await api(admin, 'POST', `/api/admin/rooms/${enc(room.id)}/transfer`, { uid: outsider.user.uid })).statusCode).toBe(400);
    expect((await api(admin, 'POST', `/api/admin/rooms/${enc(room.id)}/transfer`, { uid: guest.user.uid })).statusCode).toBe(200);
    expect((await api(guest, 'GET', `/api/rooms/${enc(room.id)}`)).json().room).toMatchObject({ isOwner: true, owner: { uid: guest.user.uid } });

    // Close during a hand: the hand finishes, then both are cashed out once.
    await t.cards.tick();
    const [hand] = await rows<{ id: string }>(sql`SELECT id FROM card_hands WHERE table_id = ${room.tableId} AND status = 'active'`);
    expect(hand).toBeTruthy();
    expect((await api(admin, 'POST', `/api/admin/rooms/${enc(room.id)}/close`, { reason: 'Tên phòng vi phạm' })).statusCode).toBe(200);
    for (let i = 0; i < 20; i++) {
      const [h] = await rows<{ status: string }>(sql`SELECT status FROM card_hands WHERE id = ${hand!.id}::uuid`);
      if (h!.status !== 'active') break;
      await t.db.execute(sql`UPDATE card_hands SET deadline = now() - interval '1 second' WHERE id = ${hand!.id}::uuid`);
      await t.cards.tick();
    }
    await t.db.execute(sql`UPDATE card_hands SET ended_at = now() - interval '1 minute' WHERE table_id = ${room.tableId}`);
    await t.cards.tick();
    expect((await rows(sql`SELECT 1 FROM card_seats WHERE table_id = ${room.tableId}`)).length).toBe(0);
    expect(await chipsOf(room.tableId, [owner, guest])).toBe(before);
    expect(code(await api(guest, 'GET', `/api/rooms/${enc(room.id)}`))).toBe('room_closed');
    expect((await api(admin, 'POST', `/api/admin/rooms/${enc(room.id)}/close`, { reason: 'again' })).statusCode).toBe(400);
    const audits = await rows<{ action: string }>(sql`SELECT action FROM audit_logs WHERE target_id = ${room.id} ORDER BY id`);
    expect(audits.map((a) => a.action)).toEqual(['rooms.pause', 'rooms.resume', 'rooms.transfer', 'rooms.close']);
    for (const p of [owner, guest, outsider]) p.ws.close();
  });
});
