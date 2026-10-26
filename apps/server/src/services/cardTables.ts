import { randomBytes, randomUUID } from 'node:crypto';
import {
  applyAction,
  createShoe,
  DEFAULT_CARD_CONFIG,
  IllegalAction,
  RANKED_MATCH,
  shuffle,
  startHand,
  timeoutAction,
  viewHand,
  type CardAction,
  type CardGame,
  type CardSeatView,
  type CardTableConfig,
  type CardTableSummary,
  type CardTableView,
  type Hand,
} from '@casino/shared';
import { and, asc, count, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Sql } from 'postgres';
import type { Db, Tx } from '../db/client';
import { cardHands, cardSeats, cardTables, gameRounds, rankedMatches, rankedQueue, users } from '../db/schema';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { effectiveEquipment } from './catalog';
import { fairRng, sha256 } from './fair';
import { awardGameplayExp, notifyProgress, type ExpResult } from './progression';
import { activeSeason, recordRankedMatch } from './rank';
import { applyDelta, getWallet } from './wallet';

type TableRow = typeof cardTables.$inferSelect;
type HandRow = typeof cardHands.$inferSelect;

export const cardRoom = (tableId: string) => `card:${tableId}`;
/** Pause between hands, so players can see the result. */
const HAND_BREAK_MS = 4_000;
/** Consecutive timeouts before a casual player is sat out (not dealt in until they come back). */
const SIT_OUT_AFTER = 2;

export const configOf = (t: Pick<TableRow, 'game' | 'config'>): CardTableConfig => ({ ...DEFAULT_CARD_CONFIG[t.game as CardGame], ...(t.config as Partial<CardTableConfig>) });

/** The deck of a hand is a pure function of its server seed and id: anyone can re-shuffle it once the seed is revealed. */
export function handDeck(serverSeed: string, handId: string) {
  return shuffle(fairRng(serverSeed, handId, 0), createShoe(1));
}

const summary = (t: TableRow, seated: number): CardTableSummary => ({
  id: t.id,
  game: t.game as CardGame,
  name: { vi: t.nameVi, en: t.nameEn },
  mode: t.mode as CardTableSummary['mode'],
  status: t.status as CardTableSummary['status'],
  config: configOf(t),
  seated,
});

/**
 * Runs Poker, Liêng and Xì Tố tables. Every state change is one transaction with the hand row
 * locked (actions from any instance, timeouts from the leader), so actions cannot interleave.
 * Casual buy-ins and cash-outs move Cxu Bạc through the ledger; chips inside a hand only move
 * between seats. A restart resumes every hand from the database (deadline included).
 */
export class CardTableEngine {
  private timer?: NodeJS.Timeout;
  private leaderConn?: Awaited<ReturnType<Sql['reserve']>>;
  private ticking = false;

  constructor(
    private readonly db: Db,
    private readonly client: Sql,
    private readonly hub: RealtimeHub,
    private readonly log: FastifyBaseLogger,
  ) {}

  async start(intervalMs = 400): Promise<void> {
    const tryLead = async () => {
      if (this.leaderConn) return;
      const conn = await this.client.reserve();
      const [row] = await conn`SELECT pg_try_advisory_lock(hashtext('keyo:card-tables')) AS ok`;
      if (row?.ok) this.leaderConn = conn;
      else conn.release();
    };
    await tryLead().catch((err) => this.log.warn({ err }, 'card scheduler lock failed'));
    let sinceTry = 0;
    this.timer = setInterval(() => {
      if (this.leaderConn) void this.tick().catch((err) => this.log.error({ err }, 'card tick failed'));
      else if ((sinceTry += intervalMs) >= 15_000) {
        sinceTry = 0;
        void tryLead().catch(() => {});
      }
    }, intervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    if (this.leaderConn) {
      await this.leaderConn`SELECT pg_advisory_unlock(hashtext('keyo:card-tables'))`.catch(() => {});
      this.leaderConn.release();
      this.leaderConn = undefined;
    }
  }

  /** One scheduler pass: timeouts, cash-outs of leaving players, new hands, ranked results, matchmaking. */
  async tick(now = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const due = await this.db.select({ id: cardHands.id, tableId: cardHands.tableId }).from(cardHands).where(and(eq(cardHands.status, 'active'), lte(cardHands.deadline, now)));
      for (const h of due) await this.timeout(h.id, now);
      // Open/paused tables, plus closed ones still holding seats (players waiting to be cashed out).
      const tables = await this.db.select().from(cardTables).where(sql`${cardTables.status} <> 'closed' OR EXISTS (SELECT 1 FROM card_seats s WHERE s.table_id = ${cardTables.id})`);
      for (const t of tables) {
        const [active] = await this.db.select({ id: cardHands.id }).from(cardHands).where(and(eq(cardHands.tableId, t.id), eq(cardHands.status, 'active')));
        if (active) continue;
        await this.releaseLeavers(t.id);
        const [last] = await this.db.select({ endedAt: cardHands.endedAt }).from(cardHands).where(eq(cardHands.tableId, t.id)).orderBy(desc(cardHands.seq)).limit(1);
        if (last?.endedAt && now.getTime() - last.endedAt.getTime() < HAND_BREAK_MS) continue;
        if (t.status === 'open') await this.startHand(t.id);
      }
      await this.recordFinishedMatches();
      await this.matchmake(now);
    } finally {
      this.ticking = false;
    }
  }

  // ---------------------------------------------------------------- views

  async lobby(): Promise<CardTableSummary[]> {
    const rows = await this.db.select().from(cardTables).where(and(eq(cardTables.mode, 'casual'), ne(cardTables.status, 'closed'))).orderBy(asc(cardTables.sort));
    const counts = await this.db.select({ tableId: cardSeats.tableId, n: count() }).from(cardSeats).groupBy(cardSeats.tableId);
    const by = new Map(counts.map((c) => [c.tableId, c.n]));
    return rows.map((t) => summary(t, by.get(t.id) ?? 0));
  }

  private async seatViews(tableId: string): Promise<(CardSeatView & { userId: string })[]> {
    const rows = await this.db.select({ s: cardSeats, u: users }).from(cardSeats).innerJoin(users, eq(users.id, cardSeats.userId)).where(eq(cardSeats.tableId, tableId)).orderBy(asc(cardSeats.seat));
    return Promise.all(
      rows.map(async ({ s, u }) => {
        const gear = await effectiveEquipment(this.db, u);
        return { userId: u.id, seat: s.seat, uid: u.uid, displayName: u.displayName, avatar: u.avatar, avatarItem: gear.avatarItem, frame: gear.frame, cardBack: gear.cardBack, title: gear.title, stack: s.stack, status: s.status as CardSeatView['status'] };
      }),
    );
  }

  async view(tableId: string, viewerId: string | null): Promise<CardTableView> {
    const [t] = await this.db.select().from(cardTables).where(eq(cardTables.id, tableId));
    if (!t) throw fail('table_not_found');
    const seats = await this.seatViews(tableId);
    const [h] = await this.db.select().from(cardHands).where(eq(cardHands.tableId, tableId)).orderBy(desc(cardHands.seq)).limit(1);
    const hand = h ? viewHand(h.state as Hand, { id: h.id, seq: h.seq, seedHash: h.seedHash, serverSeed: h.status === 'active' ? null : h.serverSeed, deadline: h.deadline?.getTime() ?? null }, viewerId) : null;
    let match: CardTableView['match'] = null;
    if (t.mode === 'ranked') {
      const [m] = await this.db.select().from(rankedMatches).where(eq(rankedMatches.tableId, tableId)).orderBy(desc(rankedMatches.createdAt)).limit(1);
      if (m) {
        const [w] = m.winnerId ? await this.db.select({ uid: users.uid }).from(users).where(eq(users.id, m.winnerId)) : [];
        match = { id: m.id, hands: m.hands, maxHands: RANKED_MATCH.maxHands, status: m.status, winnerUid: w?.uid ?? null };
      }
    }
    const mySeat = seats.find((s) => s.userId === viewerId)?.seat ?? null;
    return { table: summary(t, seats.length), seats: seats.map(({ userId: _u, ...s }) => s), hand, mySeat, match, serverNow: Date.now() };
  }

  /** Public view to the room; each seated player also gets their private view (own hole cards, legal actions). */
  async broadcast(tableId: string): Promise<void> {
    this.hub.publishRoom(cardRoom(tableId), { type: 'event', event: 'card', data: await this.view(tableId, null) });
    const seated = await this.db.select({ userId: cardSeats.userId }).from(cardSeats).where(eq(cardSeats.tableId, tableId));
    for (const s of seated) this.hub.sendToUser(s.userId, { type: 'event', event: 'card', data: await this.view(tableId, s.userId) });
  }

  // ---------------------------------------------------------------- seats

  /** Sits down at a casual table with a Cxu Bạc buy-in (debited through the ledger). One casual table at a time. */
  async sit(userId: string, tableId: string, seat: number, buyIn: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [t] = await tx.select().from(cardTables).where(eq(cardTables.id, tableId)).for('update');
      if (!t || t.status === 'closed') throw fail('table_not_found');
      if (t.mode !== 'casual' || t.status !== 'open') throw fail('table_unavailable');
      const cfg = configOf(t);
      if (seat < 0 || seat >= cfg.seats) throw fail('bad_request', 'no such seat');
      if (!Number.isSafeInteger(buyIn) || buyIn < cfg.minBuyIn || buyIn > cfg.maxBuyIn) throw fail('buyin_range');
      const [elsewhere] = await tx.select({ tableId: cardSeats.tableId }).from(cardSeats).innerJoin(cardTables, eq(cardTables.id, cardSeats.tableId)).where(and(eq(cardSeats.userId, userId), eq(cardTables.mode, 'casual')));
      if (elsewhere) throw fail('already_seated');
      const [taken] = await tx.select({ seat: cardSeats.seat }).from(cardSeats).where(and(eq(cardSeats.tableId, tableId), eq(cardSeats.seat, seat)));
      if (taken) throw fail('seat_taken');
      await applyDelta(tx, userId, -buyIn, 'table_buyin', null, 'silver', `card:${tableId}`);
      await tx.insert(cardSeats).values({ tableId, seat, userId, stack: buyIn });
    });
    this.hub.sendToUser(userId, { type: 'event', event: 'wallet', data: await getWallet(this.db, userId) });
    await this.broadcast(tableId);
  }

  /**
   * Stands up. Outside a hand (or after folding) the chips are cashed out at once; a player still
   * in the hand is marked "leaving": they are folded on their turn and cashed out when the hand ends.
   * Leaving a ranked match forfeits it.
   */
  async stand(userId: string, tableId: string): Promise<{ cashedOut: number | null; leaving: boolean }> {
    const [t] = await this.db.select().from(cardTables).where(eq(cardTables.id, tableId));
    if (!t) throw fail('table_not_found');
    const [seat] = await this.db.select().from(cardSeats).where(and(eq(cardSeats.tableId, tableId), eq(cardSeats.userId, userId)));
    if (!seat) throw fail('not_seated');
    if (t.mode === 'ranked') {
      await this.forfeit(tableId, userId, 'left');
      return { cashedOut: null, leaving: false };
    }
    const [h] = await this.db.select().from(cardHands).where(and(eq(cardHands.tableId, tableId), eq(cardHands.status, 'active')));
    // Dealt into the running hand (even folded): the seat's chips are only known when it settles.
    const inHand = h && (h.state as Hand).players.some((p) => p.userId === userId);
    if (inHand) {
      await this.db.update(cardSeats).set({ status: 'leaving' }).where(and(eq(cardSeats.tableId, tableId), eq(cardSeats.userId, userId)));
      const state = h.state as Hand;
      if (state.players[state.toAct]?.userId === userId) await this.db.update(cardHands).set({ deadline: new Date() }).where(eq(cardHands.id, h.id));
      await this.broadcast(tableId);
      return { cashedOut: null, leaving: true };
    }
    const amount = await this.db.transaction((tx) => this.cashOut(tx, tableId, userId));
    await this.flushWallets();
    await this.broadcast(tableId);
    return { cashedOut: amount, leaving: false };
  }

  /** Back in after being sat out for timeouts. */
  async back(userId: string, tableId: string): Promise<void> {
    const res = await this.db.update(cardSeats).set({ status: 'active', timeouts: 0 }).where(and(eq(cardSeats.tableId, tableId), eq(cardSeats.userId, userId), eq(cardSeats.status, 'sitting_out'))).returning();
    if (!res.length) throw fail('not_seated');
    await this.broadcast(tableId);
  }

  /** Removes the seat and credits its chips back to the wallet (casual tables only; ranked chips are not Cxu). */
  private async cashOut(tx: Tx, tableId: string, userId: string): Promise<number> {
    const [t] = await tx.select({ mode: cardTables.mode }).from(cardTables).where(eq(cardTables.id, tableId));
    const [seat] = await tx.delete(cardSeats).where(and(eq(cardSeats.tableId, tableId), eq(cardSeats.userId, userId))).returning();
    if (!seat) return 0;
    if (t?.mode === 'casual' && seat.stack > 0) await applyDelta(tx, userId, seat.stack, 'table_cashout', null, 'silver', `card:${tableId}`);
    this.walletLater.add(userId);
    return seat.stack;
  }
  private walletLater = new Set<string>();
  private async flushWallets() {
    for (const id of this.walletLater) this.hub.sendToUser(id, { type: 'event', event: 'wallet', data: await getWallet(this.db, id) });
    this.walletLater.clear();
  }

  private async releaseLeavers(tableId: string) {
    const leaving = await this.db.select({ userId: cardSeats.userId }).from(cardSeats).where(and(eq(cardSeats.tableId, tableId), eq(cardSeats.status, 'leaving')));
    if (!leaving.length) return;
    await this.db.transaction(async (tx) => {
      for (const l of leaving) await this.cashOut(tx, tableId, l.userId);
    });
    await this.flushWallets();
    await this.broadcast(tableId);
  }

  // ---------------------------------------------------------------- hands

  async startHand(tableId: string): Promise<string | null> {
    const progress = new Map<string, ExpResult>();
    const handId = await this.db.transaction(async (tx) => {
      const [t] = await tx.select().from(cardTables).where(eq(cardTables.id, tableId)).for('update');
      if (!t || t.status !== 'open') return null;
      const [active] = await tx.select({ id: cardHands.id }).from(cardHands).where(and(eq(cardHands.tableId, tableId), eq(cardHands.status, 'active')));
      if (active) return null;
      const seats = (await tx.select().from(cardSeats).where(eq(cardSeats.tableId, tableId)).orderBy(asc(cardSeats.seat))).filter((s) => s.status === 'active' && s.stack > 0);
      if (seats.length < 2) return null;
      const cfg = configOf(t);
      // The button moves to the next occupied seat.
      const button = seats.find((s) => s.seat > t.button)?.seat ?? seats[0]!.seat;
      const id = randomUUID();
      const serverSeed = randomBytes(32).toString('hex');
      const [{ seq }] = (await tx.execute(sql`SELECT coalesce(max(seq), 0) + 1 AS seq FROM card_hands WHERE table_id = ${tableId}`)) as unknown as [{ seq: number }];
      const state = startHand(t.game as CardGame, cfg, seats.map((s) => ({ seat: s.seat, userId: s.userId, stack: s.stack })), button, handDeck(serverSeed, id));
      await tx.update(cardTables).set({ button }).where(eq(cardTables.id, tableId));
      await tx.insert(cardHands).values({ id, tableId, seq: Number(seq), state, serverSeed, seedHash: sha256(serverSeed), deadline: state.phase === 'done' ? null : new Date(Date.now() + cfg.turnMs) });
      if (state.phase === 'done') await this.settle(tx, t, id, state, progress);
      else await this.fastForwardLeaver(tx, id, state);
      return id;
    });
    if (handId) await this.after(tableId, progress);
    return handId;
  }

  /** A leaving or sat-out player to act is timed out immediately. */
  private async fastForwardLeaver(tx: Tx, handId: string, state: Hand) {
    const p = state.players[state.toAct];
    if (!p) return;
    const [seat] = await tx.select({ status: cardSeats.status }).from(cardSeats).innerJoin(cardHands, eq(cardHands.tableId, cardSeats.tableId)).where(and(eq(cardHands.id, handId), eq(cardSeats.userId, p.userId)));
    if (!seat || seat.status !== 'active') await tx.update(cardHands).set({ deadline: new Date() }).where(eq(cardHands.id, handId));
  }

  /** A player's action. Validated by the engine under the hand lock. */
  async act(userId: string, tableId: string, handId: string, action: CardAction): Promise<void> {
    await this.mutate(handId, tableId, (h) => {
      const p = h.players[h.toAct];
      if (!p || p.userId !== userId) throw fail('illegal_action');
      try {
        return applyAction(h, p.seat, action);
      } catch (err) {
        if (err instanceof IllegalAction) throw fail('illegal_action', err.message);
        throw err;
      }
    });
  }

  async timeout(handId: string, now = new Date()): Promise<void> {
    await this.mutate(handId, null, (h, row) => (row.deadline && row.deadline <= now ? timeoutAction(h) : null));
  }

  private async mutate(handId: string, tableId: string | null, fn: (h: Hand, row: HandRow) => Hand | null) {
    const progress = new Map<string, ExpResult>();
    const changed = await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(cardHands).where(eq(cardHands.id, handId)).for('update');
      if (!row || (tableId && row.tableId !== tableId)) throw fail('hand_not_found');
      if (row.status !== 'active') {
        if (tableId) throw fail('hand_not_found');
        return null;
      }
      const next = fn(row.state as Hand, row);
      if (!next) return null;
      const [t] = await tx.select().from(cardTables).where(eq(cardTables.id, row.tableId));
      const cfg = configOf(t!);
      await tx
        .update(cardHands)
        .set({ state: next, version: row.version + 1, deadline: next.phase === 'done' ? null : new Date(Date.now() + cfg.turnMs) })
        .where(eq(cardHands.id, handId));
      // Timeout bookkeeping: casual players sit out after repeated timeouts; ranked players forfeit (AFK).
      // The counter lives on the seat, not the hand, so it carries across hands (a Liêng hand has one turn each).
      const last = next.actions.at(-1);
      const actor = last ? next.players.find((p) => p.seat === last.seat) : undefined;
      let timedOut: { userId: string; timeouts: number } | undefined;
      if (actor) {
        const seatOf = and(eq(cardSeats.tableId, row.tableId), eq(cardSeats.userId, actor.userId));
        if (last!.type === 'timeout') {
          const [s] = await tx.update(cardSeats).set({ timeouts: sql`${cardSeats.timeouts} + 1` }).where(seatOf).returning({ timeouts: cardSeats.timeouts });
          timedOut = { userId: actor.userId, timeouts: s?.timeouts ?? 0 };
        } else await tx.update(cardSeats).set({ timeouts: 0 }).where(and(seatOf, sql`${cardSeats.timeouts} > 0`));
      }
      if (timedOut && t!.mode === 'casual' && timedOut.timeouts >= SIT_OUT_AFTER) {
        await tx.update(cardSeats).set({ status: 'sitting_out' }).where(and(eq(cardSeats.tableId, row.tableId), eq(cardSeats.userId, timedOut.userId), eq(cardSeats.status, 'active')));
      }
      if (next.phase === 'done') await this.settle(tx, t!, handId, next, progress);
      else await this.fastForwardLeaver(tx, handId, next);
      return { tableId: row.tableId, afk: timedOut && t!.mode === 'ranked' && timedOut.timeouts >= RANKED_MATCH.afkTimeouts ? timedOut.userId : null };
    });
    if (!changed) return;
    if (changed.afk) await this.forfeit(changed.tableId, changed.afk, 'afk');
    await this.after(changed.tableId, progress);
  }

  private async after(tableId: string, progress: Map<string, ExpResult>) {
    for (const [userId, p] of progress) notifyProgress(this.hub, userId, p);
    await this.flushWallets();
    await this.broadcast(tableId);
  }

  /**
   * Writes a finished hand back: seat stacks, a history row per player (casual: game_rounds with
   * EXP), the ranked match progress. All in the caller's transaction.
   */
  private async settle(tx: Tx, t: TableRow, handId: string, h: Hand, progress: Map<string, ExpResult>) {
    await tx.update(cardHands).set({ status: 'done', endedAt: new Date(), deadline: null }).where(eq(cardHands.id, handId));
    for (const p of h.players) {
      await tx.update(cardSeats).set({ stack: p.stack }).where(and(eq(cardSeats.tableId, t.id), eq(cardSeats.userId, p.userId)));
    }
    if (t.mode === 'casual') {
      for (const p of h.players) {
        const payout = h.result!.payouts[p.seat] ?? 0;
        await tx
          .insert(gameRounds)
          .values({ userId: p.userId, game: t.game, bet: p.total, payout, status: 'settled', result: { tableId: t.id, handId, net: h.result!.net[p.seat] ?? 0, shown: h.result!.shown[p.seat] ?? null }, idempotencyKey: `card:${handId}`, settledAt: new Date() })
          .onConflictDoNothing();
        if (p.total > 0) {
          const exp = await awardGameplayExp(tx, p.userId, `card:${handId}`, p.total);
          if (exp) progress.set(p.userId, exp);
        }
      }
      return;
    }
    // Ranked: count the hand; decide the match when someone is out of chips or the hand limit is reached.
    const [m] = await tx.select().from(rankedMatches).where(and(eq(rankedMatches.tableId, t.id), eq(rankedMatches.status, 'active'))).for('update');
    if (!m) return;
    const hands = m.hands + 1;
    const stacks = h.players.map((p) => ({ userId: p.userId, stack: p.stack })).sort((a, b) => b.stack - a.stack);
    const busted = stacks.some((s) => s.stack === 0);
    const decided = busted || (hands >= RANKED_MATCH.maxHands && stacks[0]!.stack !== stacks[1]!.stack);
    if (decided) {
      await tx.update(rankedMatches).set({ hands, status: 'finished', winnerId: stacks[0]!.userId, endedAt: new Date() }).where(eq(rankedMatches.id, m.id));
      await tx.update(cardTables).set({ status: 'paused' }).where(eq(cardTables.id, t.id));
    } else if (hands >= RANKED_MATCH.hardCapHands) {
      // Still level after the hard cap: no result (no RP for anyone).
      await tx.update(rankedMatches).set({ hands, status: 'void', endedAt: new Date() }).where(eq(rankedMatches.id, m.id));
      await tx.update(cardTables).set({ status: 'closed' }).where(eq(cardTables.id, t.id));
      await tx.delete(cardSeats).where(eq(cardSeats.tableId, t.id));
    } else await tx.update(rankedMatches).set({ hands }).where(eq(rankedMatches.id, m.id));
  }

  // ---------------------------------------------------------------- ranked

  /** Leaving or AFK in a ranked match: the other player wins; the forfeiter gets no participation reward. */
  private async forfeit(tableId: string, userId: string, _why: 'left' | 'afk') {
    await this.db.transaction(async (tx) => {
      const [m] = await tx.select().from(rankedMatches).where(and(eq(rankedMatches.tableId, tableId), eq(rankedMatches.status, 'active'))).for('update');
      if (!m || !m.players.includes(userId)) return;
      const winner = m.players.find((p) => p !== userId)!;
      await tx.update(rankedMatches).set({ status: 'finished', winnerId: winner, forfeitId: userId, endedAt: new Date() }).where(eq(rankedMatches.id, m.id));
      await tx.update(cardHands).set({ status: 'void', endedAt: new Date(), deadline: null }).where(and(eq(cardHands.tableId, tableId), eq(cardHands.status, 'active')));
      await tx.update(cardTables).set({ status: 'paused' }).where(eq(cardTables.id, tableId));
    });
    await this.recordFinishedMatches();
    await this.broadcast(tableId);
  }

  /**
   * Sends finished matches to the season ladder (exactly once per match key), then closes the table.
   * Retried every tick, so a crash between the hand and the ladder update loses nothing.
   */
  async recordFinishedMatches(): Promise<void> {
    const finished = await this.db.select().from(rankedMatches).where(eq(rankedMatches.status, 'finished'));
    for (const m of finished) {
      try {
        await recordRankedMatch(
          this.db,
          `card:${m.id}`,
          m.players.map((p) => ({ userId: p, result: p === m.winnerId ? 'win' : 'loss', afk: p === m.forfeitId })),
        );
      } catch (err) {
        if ((err as { code?: string }).code !== 'season_inactive') throw err;
        // The season ended meanwhile: the match no longer counts.
      }
      await this.db.transaction(async (tx) => {
        await tx.update(rankedMatches).set({ status: 'done' }).where(and(eq(rankedMatches.id, m.id), eq(rankedMatches.status, 'finished')));
        await tx.update(cardTables).set({ status: 'closed' }).where(eq(cardTables.id, m.tableId));
        await tx.delete(cardSeats).where(eq(cardSeats.tableId, m.tableId));
      });
      for (const p of m.players) this.hub.sendToUser(p, { type: 'event', event: 'profile', data: { reason: 'equipment' } });
      await this.broadcast(m.tableId);
    }
  }

  /** Joins the ranked queue for a game (an active season is required; one queue entry per player). */
  async queue(userId: string, game: CardGame): Promise<void> {
    const season = await activeSeason(this.db);
    if (!season) throw fail('season_inactive');
    const [busy] = await this.db.select({ id: rankedMatches.id }).from(rankedMatches).where(and(inArray(rankedMatches.status, ['active', 'finished']), sql`${userId} = ANY(${rankedMatches.players})`));
    if (busy) throw fail('already_seated');
    const [rank] = (await this.db.execute(sql`SELECT division FROM player_ranks WHERE season_id = ${season.id} AND user_id = ${userId}`)) as unknown as { division: number }[];
    await this.db
      .insert(rankedQueue)
      .values({ userId, game, division: rank?.division ?? 0 })
      .onConflictDoUpdate({ target: rankedQueue.userId, set: { game, division: rank?.division ?? 0, joinedAt: new Date() } });
    if (!this.leaderConn) return;
    await this.matchmake(new Date());
  }

  async unqueue(userId: string): Promise<void> {
    await this.db.delete(rankedQueue).where(eq(rankedQueue.userId, userId));
  }

  /**
   * Pairs queued players of the same game by division: ±5 divisions, widening by one every 10 s
   * of waiting. Players who already met 3 times today are not paired again (collusion guard).
   */
  async matchmake(now: Date): Promise<void> {
    await this.db.delete(rankedQueue).where(lte(rankedQueue.joinedAt, new Date(now.getTime() - 10 * 60_000)));
    const queue = await this.db.select().from(rankedQueue).orderBy(asc(rankedQueue.joinedAt));
    const taken = new Set<string>();
    for (const a of queue) {
      if (taken.has(a.userId)) continue;
      const wait = Math.floor((now.getTime() - a.joinedAt.getTime()) / 10_000);
      for (const b of queue) {
        if (b.userId === a.userId || taken.has(b.userId) || b.game !== a.game) continue;
        if (Math.abs(a.division - b.division) > 5 + wait) continue;
        const [{ met }] = (await this.db.execute(sql`
          SELECT count(*)::int AS met FROM ranked_matches WHERE players @> ARRAY[${a.userId}, ${b.userId}]::uuid[] AND created_at >= now() - interval '1 day'`)) as unknown as [{ met: number }];
        if (met >= 3) continue;
        const tableId = await this.createMatch(a.game as CardGame, a.userId, b.userId);
        if (tableId) {
          taken.add(a.userId);
          taken.add(b.userId);
          for (const u of [a.userId, b.userId]) this.hub.sendToUser(u, { type: 'event', event: 'cardMatch', data: { tableId, game: a.game as CardGame } });
        }
        break;
      }
    }
  }

  private async createMatch(game: CardGame, a: string, b: string): Promise<string | null> {
    return this.db.transaction(async (tx) => {
      const season = await activeSeason(tx);
      if (!season) return null;
      const removed = await tx.delete(rankedQueue).where(inArray(rankedQueue.userId, [a, b])).returning();
      if (removed.length !== 2) return null; // someone left the queue meanwhile
      const tableId = `rk-${randomUUID().slice(0, 12)}`;
      const cfg = { ...DEFAULT_CARD_CONFIG[game], seats: 2, minBuyIn: RANKED_MATCH.stack, maxBuyIn: RANKED_MATCH.stack };
      await tx.insert(cardTables).values({ id: tableId, game, nameVi: `Đấu Rank`, nameEn: 'Ranked match', config: cfg, mode: 'ranked', status: 'open', button: 1 });
      const order = Math.random() < 0.5 ? [a, b] : [b, a];
      await tx.insert(cardSeats).values(order.map((userId, seat) => ({ tableId, seat, userId, stack: RANKED_MATCH.stack })));
      await tx.insert(rankedMatches).values({ game, tableId, seasonId: season.id, players: order });
      return tableId;
    });
  }

  /** Staff: pause / reopen / close a casual table (closing cashes everyone out once no hand is running). */
  async setStatus(tableId: string, status: 'open' | 'paused' | 'closed') {
    const [t] = await this.db.update(cardTables).set({ status }).where(eq(cardTables.id, tableId)).returning();
    if (!t) throw fail('table_not_found');
    if (status === 'closed') {
      const [active] = await this.db.select({ id: cardHands.id }).from(cardHands).where(and(eq(cardHands.tableId, tableId), eq(cardHands.status, 'active')));
      if (active) await this.db.update(cardSeats).set({ status: 'leaving' }).where(eq(cardSeats.tableId, tableId));
      else await this.releaseAll(tableId);
    }
    await this.broadcast(tableId);
    return t;
  }

  private async releaseAll(tableId: string) {
    const seats = await this.db.select({ userId: cardSeats.userId }).from(cardSeats).where(eq(cardSeats.tableId, tableId));
    await this.db.transaction(async (tx) => {
      for (const s of seats) await this.cashOut(tx, tableId, s.userId);
    });
    await this.flushWallets();
  }
}
