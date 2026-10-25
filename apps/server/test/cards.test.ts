import { randomUUID } from 'node:crypto';
import { type CardTableView, type Hand } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { handDeck } from '../src/services/cardTables';
import { createOwner, randomIp, reauthHeaders, register, startTestApp, TEST_DB, TestSocket, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const rows = async <T>(q: ReturnType<typeof sql>) => (await t.db.execute(q)) as unknown as T[];
const one = async <T>(q: ReturnType<typeof sql>) => (await rows<T>(q))[0]!;
const balance = async (userId: string) => Number((await one<{ balance: string }>(sql`SELECT balance FROM wallets WHERE user_id = ${userId}`)).balance);
const activeHand = (tableId: string) => one<{ id: string; state: Hand; server_seed: string; status: string }>(sql`SELECT * FROM card_hands WHERE table_id = ${tableId} ORDER BY seq DESC LIMIT 1`);
async function player() {
  const p = await register(t);
  const ws = await TestSocket.connect(t.port, p.token);
  return { ...p, ws };
}
type P = Awaited<ReturnType<typeof player>>;
/** The player whose turn it is. */
async function toAct(tableId: string, ps: P[]) {
  const h = await activeHand(tableId);
  const seat = h.state.players[h.state.toAct];
  return { h, p: ps.find((x) => x.user.id === seat?.userId)!, seat };
}
async function freeTable(tableId: string) {
  // Clean slate between tests: cash everyone out through the engine.
  await t.cards.setStatus(tableId, 'closed');
  await t.db.execute(sql`UPDATE card_hands SET status = 'void', deadline = NULL WHERE table_id = ${tableId} AND status = 'active'`);
  await t.cards.tick();
  await t.db.execute(sql`UPDATE card_hands SET ended_at = now() - interval '1 minute' WHERE table_id = ${tableId}`);
  await t.cards.setStatus(tableId, 'open');
}

describe('casual card tables', () => {
  it('lists the lobby tables', async () => {
    const tables = (await t.app.inject({ url: '/api/cards/tables' })).json().tables as { id: string; game: string }[];
    expect(tables.map((x) => x.id)).toEqual(['poker-1', 'poker-2', 'lieng-1', 'xito-1']);
  });

  it('buy-in goes through the ledger with range, seat and one-table checks', async () => {
    const a = await player();
    const before = await balance(a.user.id);
    expect((await a.ws.request({ type: 'card.sit', tableId: 'poker-1', seat: 0, buyIn: 100 })).ok).toBe(false); // below min
    const view = await a.ws.ok<CardTableView>({ type: 'card.sit', tableId: 'poker-1', seat: 0, buyIn: 2000 });
    expect(view.mySeat).toBe(0);
    expect(await balance(a.user.id)).toBe(before - 2000);
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM ledger_entries WHERE user_id = ${a.user.id} AND reason = 'table_buyin' AND delta = -2000`)).n).toBe(1);
    const b = await player();
    const taken = await b.ws.request({ type: 'card.sit', tableId: 'poker-1', seat: 0, buyIn: 2000 });
    expect(taken.ok ? null : taken.error.code).toBe('seat_taken');
    const twice = await a.ws.request({ type: 'card.sit', tableId: 'lieng-1', seat: 0, buyIn: 2000 });
    expect(twice.ok ? null : twice.error.code).toBe('already_seated');
    // Standing before any hand cashes out in full.
    expect(await a.ws.ok({ type: 'card.stand', tableId: 'poker-1' })).toEqual({ cashedOut: 2000, leaving: false });
    expect(await balance(a.user.id)).toBe(before);
    a.ws.close();
    b.ws.close();
  });

  it('plays a full Hold\'em hand: private cards, turn order, provably fair deck, chips conserved', async () => {
    await freeTable('poker-1');
    const a = await player();
    const b = await player();
    for (const [p, seat] of [[a, 1], [b, 3]] as const) await p.ws.ok({ type: 'card.sit', tableId: 'poker-1', seat, buyIn: 3000 });
    await t.cards.tick();
    let { h, p, seat } = await toAct('poker-1', [a, b]);
    expect(h.state.players.every((x) => x.hole.length === 2)).toBe(true);
    // Each player sees only their own cards; spectators see none.
    const va = await a.ws.ok<CardTableView>({ type: 'card.join', tableId: 'poker-1' });
    const mine = va.hand!.players.find((x) => x.userId === a.user.id)!;
    const theirs = va.hand!.players.find((x) => x.userId === b.user.id)!;
    expect(mine.hole.every((c) => c !== null)).toBe(true);
    expect(theirs.hole.every((c) => c === null)).toBe(true);
    const pub = (await t.app.inject({ url: '/api/cards/tables/poker-1' })).json() as CardTableView;
    expect(pub.hand!.players.flatMap((x) => x.hole).every((c) => c === null)).toBe(true);
    expect(pub.hand!.serverSeed).toBeNull();
    // Out of turn is refused.
    const other = p === a ? b : a;
    const bad = await other.ws.request({ type: 'card.act', tableId: 'poker-1', handId: h.id, action: 'call' });
    expect(bad.ok ? null : bad.error.code).toBe('illegal_action');
    // Play: call, then check it down.
    await p.ws.ok({ type: 'card.act', tableId: 'poker-1', handId: h.id, action: 'call' });
    for (let i = 0; i < 20; i++) {
      ({ h, p, seat } = await toAct('poker-1', [a, b]));
      if (h.status !== 'active') break;
      await p.ws.ok({ type: 'card.act', tableId: 'poker-1', handId: h.id, action: 'check' });
    }
    const done = await one<{ id: string; status: string; state: Hand; server_seed: string }>(sql`SELECT * FROM card_hands WHERE id = ${h.id}`);
    expect(done.status).toBe('done');
    expect(done.state.result!.showdown).toBe(true);
    // The deck is reproducible from the revealed seed: hole cards were dealt from it.
    const deck = handDeck(done.server_seed, done.id);
    const dealt = done.state.players.flatMap((x) => x.hole);
    expect(dealt.every((c) => deck.slice(0, 4).includes(c))).toBe(true);
    expect(done.state.board).toEqual(deck.slice(4, 9));
    const seats = await rows<{ stack: string }>(sql`SELECT stack FROM card_seats WHERE table_id = 'poker-1'`);
    expect(seats.reduce((s, r) => s + Number(r.stack), 0)).toBe(6000);
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM game_rounds WHERE idempotency_key = ${`card:${h.id}`}`)).n).toBe(2);
    void seat;
    a.ws.close();
    b.ws.close();
  });

  it('times out to check/fold, sits out repeat offenders, and cashes out a leaver with the final stack', async () => {
    await freeTable('poker-1');
    const a = await player();
    const b = await player();
    const c = await player();
    for (const [p, seat] of [[a, 0], [b, 1], [c, 2]] as const) await p.ws.ok({ type: 'card.sit', tableId: 'poker-1', seat, buyIn: 2000 });
    const wallets = async () => (await Promise.all([a, b, c].map((p) => balance(p.user.id)))).reduce((x, y) => x + y, 0);
    const seatsTotal = async () => (await rows<{ stack: string }>(sql`SELECT stack FROM card_seats WHERE table_id = 'poker-1'`)).reduce((s, r) => s + Number(r.stack), 0);
    const totalBefore = (await wallets()) + 6000;
    await t.cards.tick();
    let { h, p } = await toAct('poker-1', [a, b, c]);
    // The player to act stands up mid-hand: marked leaving, folded on their turn, cashed out after the hand.
    const res = await p.ws.ok({ type: 'card.stand', tableId: 'poker-1' });
    expect(res).toEqual({ cashedOut: null, leaving: true });
    await t.cards.tick(); // deadline set to now → timeout
    ({ h } = await toAct('poker-1', [a, b, c]));
    // Time everyone else out until the hand ends.
    for (let i = 0; i < 20 && h.status === 'active'; i++) {
      await t.db.execute(sql`UPDATE card_hands SET deadline = now() - interval '1 second' WHERE id = ${h.id}`);
      await t.cards.tick(new Date(Date.now() + 1000));
      h = await activeHand('poker-1');
    }
    expect(h.status).toBe('done');
    await t.db.execute(sql`UPDATE card_hands SET ended_at = now() - interval '1 minute' WHERE id = ${h.id}`);
    await t.cards.tick();
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM card_seats WHERE table_id = 'poker-1' AND user_id = ${p.user.id}`)).n).toBe(0);
    expect((await wallets()) + (await seatsTotal())).toBe(totalBefore);
    const timedOut = await rows<{ status: string }>(sql`SELECT status FROM card_seats WHERE table_id = 'poker-1'`);
    expect(timedOut.length).toBe(2);
    [a, b, c].forEach((x) => x.ws.close());
  });

  it('a server restart mid-hand continues the same hand from the database', async () => {
    await freeTable('lieng-1');
    const a = await player();
    const b = await player();
    for (const [p, seat] of [[a, 0], [b, 1]] as const) await p.ws.ok({ type: 'card.sit', tableId: 'lieng-1', seat, buyIn: 2000 });
    await t.cards.tick();
    const { h } = await toAct('lieng-1', [a, b]);
    const second = await buildApp(loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, JWT_SECRET: 'test-secret-test-secret-test-secret-123', REDIS_URL: '', TABLE_SCHEDULER: 'off' }), { logger: false });
    try {
      const actor = h.state.players[h.state.toAct]!.userId;
      await second.cards.act(actor, 'lieng-1', h.id, { type: 'bet', amount: 300 });
      const next = await activeHand('lieng-1');
      await second.cards.act(next.state.players[next.state.toAct]!.userId, 'lieng-1', h.id, { type: 'call' });
      const done = await activeHand('lieng-1');
      expect(done.status).toBe('done');
      expect(done.state.result!.pots[0]!.amount).toBe(800); // 2 × 100 ante + 2 × 300
      const seats = await rows<{ stack: string }>(sql`SELECT stack FROM card_seats WHERE table_id = 'lieng-1'`);
      expect(seats.map((s) => Number(s.stack)).sort((x, y) => x - y)).toEqual([1600, 2400]);
    } finally {
      await second.app.close();
    }
    a.ws.close();
    b.ws.close();
  });

  it('concurrent duplicate actions apply once', async () => {
    await freeTable('xito-1');
    const a = await player();
    const b = await player();
    for (const [p, seat] of [[a, 0], [b, 1]] as const) await p.ws.ok({ type: 'card.sit', tableId: 'xito-1', seat, buyIn: 2000 });
    await t.cards.tick();
    const { h, p } = await toAct('xito-1', [a, b]);
    const results = await Promise.all([1, 2, 3].map(() => p.ws.request({ type: 'card.act', tableId: 'xito-1', handId: h.id, action: 'bet', amount: 200 })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const after = await activeHand('xito-1');
    expect(after.state.actions.filter((x) => x.type === 'bet')).toHaveLength(1);
    a.ws.close();
    b.ws.close();
  });
});

describe('ranked matches', () => {
  let ownerHeaders: Record<string, string>;
  beforeAll(async () => {
    const owner = await createOwner(t);
    ownerHeaders = await reauthHeaders(t, owner.token);
    const s = await t.app.inject({ method: 'POST', url: '/api/admin/rank/seasons', headers: ownerHeaders, remoteAddress: randomIp(), payload: { name: 'Mùa Bài', startsAt: new Date(Date.now() - 60_000).toISOString() } });
    await t.app.inject({ method: 'POST', url: `/api/admin/rank/seasons/${s.json().season.id}/start`, headers: ownerHeaders, remoteAddress: randomIp() });
  });

  async function match(game: 'poker' | 'lieng' | 'xito') {
    const a = await player();
    const b = await player();
    const balances = [await balance(a.user.id), await balance(b.user.id)];
    await a.ws.ok({ type: 'card.queue', game });
    await b.ws.ok({ type: 'card.queue', game });
    await t.cards.matchmake(new Date());
    const m = await one<{ id: string; table_id: string; players: string[] }>(sql`SELECT * FROM ranked_matches WHERE ${a.user.id} = ANY(players) ORDER BY created_at DESC LIMIT 1`);
    expect(m.players.sort()).toEqual([a.user.id, b.user.id].sort());
    return { a, b, m, balances };
  }

  it('matches two queued players and plays with match chips, never Cxu; the result changes RP once', async () => {
    const { a, b, m, balances } = await match('poker');
    const seats = await rows<{ stack: string }>(sql`SELECT stack FROM card_seats WHERE table_id = ${m.table_id}`);
    expect(seats.map((s) => Number(s.stack))).toEqual([10_000, 10_000]);
    // Both shove every hand until someone is out of chips (or the hand limit).
    for (let i = 0; i < 200; i++) {
      const status = (await one<{ status: string }>(sql`SELECT status FROM ranked_matches WHERE id = ${m.id}`)).status;
      if (status !== 'active') break;
      await t.db.execute(sql`UPDATE card_hands SET ended_at = now() - interval '1 minute' WHERE table_id = ${m.table_id}`);
      await t.cards.tick();
      const h = await activeHand(m.table_id);
      if (h?.status === 'active') {
        const actor = h.state.players[h.state.toAct]!.userId;
        await t.cards.act(actor, m.table_id, h.id, { type: 'allin' });
      }
    }
    await t.cards.recordFinishedMatches();
    const done = await one<{ status: string; winner_id: string }>(sql`SELECT status, winner_id FROM ranked_matches WHERE id = ${m.id}`);
    expect(done.status).toBe('done');
    const events = await rows<{ user_id: string; result: string }>(sql`SELECT user_id, result FROM rank_events WHERE match_key = ${`card:${m.id}`}`);
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.user_id === done.winner_id)!.result).toBe('win');
    await t.cards.recordFinishedMatches(); // idempotent
    expect((await rows(sql`SELECT 1 FROM rank_events WHERE match_key = ${`card:${m.id}`}`)).length).toBe(2);
    expect([await balance(a.user.id), await balance(b.user.id)]).toEqual(balances);
    a.ws.close();
    b.ws.close();
  });

  it('leaving a ranked match is a loss (no participation reward); AFK forfeits after 3 timeouts', async () => {
    const { a, b, m } = await match('lieng');
    await t.cards.tick();
    await a.ws.ok({ type: 'card.stand', tableId: m.table_id });
    const ev = await rows<{ user_id: string; result: string }>(sql`SELECT user_id, result FROM rank_events WHERE match_key = ${`card:${m.id}`}`);
    expect(ev.find((e) => e.user_id === a.user.id)!.result).toBe('loss');
    expect(ev.find((e) => e.user_id === b.user.id)!.result).toBe('win');

    const second = await match('xito');
    await t.cards.tick();
    for (let i = 0; i < 12; i++) {
      const st = (await one<{ status: string }>(sql`SELECT status FROM ranked_matches WHERE id = ${second.m.id}`)).status;
      if (st !== 'active') break;
      await t.db.execute(sql`UPDATE card_hands SET deadline = now() - interval '1 second', ended_at = now() - interval '1 minute' WHERE table_id = ${second.m.table_id}`);
      await t.cards.tick(new Date(Date.now() + 1000));
    }
    const fin = await one<{ status: string; forfeit_id: string | null }>(sql`SELECT status, forfeit_id FROM ranked_matches WHERE id = ${second.m.id}`);
    expect(fin.status).toBe('done');
    expect(fin.forfeit_id).not.toBeNull();

    // Liêng has a single turn per player per hand: the AFK count must carry across hands.
    const third = await match('lieng');
    let hands = 0;
    for (let i = 0; i < 30; i++) {
      const st = (await one<{ status: string }>(sql`SELECT status FROM ranked_matches WHERE id = ${third.m.id}`)).status;
      if (st !== 'active') break;
      await t.db.execute(sql`UPDATE card_hands SET deadline = now() - interval '1 second', ended_at = now() - interval '1 minute' WHERE table_id = ${third.m.table_id}`);
      await t.cards.tick(new Date(Date.now() + 1000));
      hands = (await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM card_hands WHERE table_id = ${third.m.table_id}`)).n;
    }
    const lieng = await one<{ status: string; forfeit_id: string | null }>(sql`SELECT status, forfeit_id FROM ranked_matches WHERE id = ${third.m.id}`);
    expect(lieng.status).toBe('done');
    expect(lieng.forfeit_id).not.toBeNull();
    expect(hands).toBeGreaterThan(1);
    [a, b, second.a, second.b, third.a, third.b].forEach((x) => x.ws.close());
  });

  it('refuses the queue without an active season', async () => {
    await t.db.execute(sql`UPDATE rank_seasons SET status = 'ended' WHERE status = 'active'`);
    const p = await player();
    const res = await p.ws.request({ type: 'card.queue', game: 'poker' });
    expect(res.ok ? null : res.error.code).toBe('season_inactive');
    p.ws.close();
    void randomUUID;
  });
});
