import { randomBytes, randomUUID } from 'node:crypto';
import {
  BJT_SEATS,
  BJT_TIMING,
  BjtIllegal,
  bjtAct,
  bjtCloseInsurance,
  bjtCurrent,
  bjtDeal,
  bjtExtraStake,
  bjtInsure,
  bjtNewRound,
  bjtPlaceBet,
  bjtStake,
  bjtTimeout,
  bjtView,
  BLACKJACK_DECKS,
  createShoe,
  shuffle,
  type BjtAction,
  type BjtSeatView,
  type BjtState,
  type BjtTableSummary,
  type BjtTableView,
  type ServerMessage,
} from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Sql } from 'postgres';
import type { Db, Tx } from '../db/client';
import { gameRounds } from '../db/schema';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { fairRng, sha256 } from './fair';
import { awardGameplayExp, notifyProgress, type ExpResult } from './progression';
import { assertRoomAccess } from './roomAccess';
import { applyDelta, getWallet } from './wallet';

export const bjtRoom = (tableId: string) => `bjt:${tableId}`;
/** Seated players who are offline at the start of this many betting rounds in a row lose the seat. */
const OFFLINE_ROUNDS = 3;
/** A disconnected player's turn waits this long (they may be reconnecting) before standing. */
const OFFLINE_TURN_MS = 5_000;

type TableRow = { id: string; name_vi: string; name_en: string; min_bet: string; max_bet: string; seats: number; status: BjtTableSummary['status'] };
type RoundRow = { id: string; table_id: string; seq: string; status: string; state: BjtState & { keys?: string[] }; version: number; server_seed: string; seed_hash: string; deadline: string | null };

/** The shoe of a round is a pure function of its server seed and id (revealed after the round). */
export function bjtShoe(serverSeed: string, roundId: string) {
  return shuffle(fairRng(serverSeed, roundId, 0), createShoe(BLACKJACK_DECKS));
}

const summary = (t: TableRow, seated: number): BjtTableSummary => ({
  id: t.id,
  name: { vi: t.name_vi, en: t.name_en },
  minBet: Number(t.min_bet),
  maxBet: Number(t.max_bet),
  seats: t.seats,
  seated,
  status: t.status,
});

const deadlineFor = (s: BjtState, now = Date.now()) =>
  s.phase === 'betting' ? new Date(now + BJT_TIMING.betMs) : s.phase === 'insurance' ? new Date(now + BJT_TIMING.insuranceMs) : s.phase === 'playing' ? new Date(now + BJT_TIMING.turnMs) : null;

/**
 * Shared Blackjack tables. Every change to a round is one transaction with the round row locked
 * (player actions from any instance, deadlines from the scheduler leader), so nothing interleaves.
 * Stakes leave the wallet through the ledger when they are placed; payouts are credited in the
 * same transaction that closes the round, which can only happen once. A restart resumes every
 * round from the database, deadline included.
 */
export class BlackjackTableEngine {
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
      const [row] = await conn`SELECT pg_try_advisory_lock(hashtext('keyo:bj-tables')) AS ok`;
      if (row?.ok) this.leaderConn = conn;
      else conn.release();
    };
    await tryLead().catch((err) => this.log.warn({ err }, 'blackjack scheduler lock failed'));
    let sinceTry = 0;
    this.timer = setInterval(() => {
      if (this.leaderConn) void this.tick().catch((err) => this.log.error({ err }, 'blackjack tick failed'));
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
      await this.leaderConn`SELECT pg_advisory_unlock(hashtext('keyo:bj-tables'))`.catch(() => {});
      this.leaderConn.release();
      this.leaderConn = undefined;
    }
  }

  /** One scheduler pass: expired deadlines, then a betting round for every table with players. */
  async tick(now = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const due = await this.db.execute<{ id: string }>(sql`SELECT id FROM bj_rounds WHERE status = 'active' AND deadline <= ${now.toISOString()}::timestamptz`);
      for (const r of due) await this.expire(r.id, now);
      const tables = await this.db.execute<{ id: string; last_end: string | null }>(sql`
        SELECT t.id, (SELECT max(ended_at) FROM bj_rounds r WHERE r.table_id = t.id)::text AS last_end
        FROM bj_tables t
        WHERE t.status = 'open' AND EXISTS (SELECT 1 FROM bj_seats s WHERE s.table_id = t.id)
          AND NOT EXISTS (SELECT 1 FROM bj_rounds r WHERE r.table_id = t.id AND r.status = 'active')`);
      for (const t of tables) {
        await this.releaseLeavers(t.id);
        if (t.last_end && now.getTime() - new Date(t.last_end).getTime() < BJT_TIMING.breakMs) continue;
        await this.openRound(t.id);
      }
      // Closed or paused tables only release their seats.
      const idle = await this.db.execute<{ id: string }>(sql`
        SELECT t.id FROM bj_tables t WHERE t.status <> 'open' AND EXISTS (SELECT 1 FROM bj_seats s WHERE s.table_id = t.id)
          AND NOT EXISTS (SELECT 1 FROM bj_rounds r WHERE r.table_id = t.id AND r.status = 'active')`);
      for (const t of idle) await this.releaseLeavers(t.id, true);
    } finally {
      this.ticking = false;
    }
  }

  // ---------------------------------------------------------------- views

  async lobby(): Promise<BjtTableSummary[]> {
    const rows = await this.db.execute<TableRow & { seated: number }>(sql`
      SELECT t.*, (SELECT count(*)::int FROM bj_seats s WHERE s.table_id = t.id) AS seated FROM bj_tables t WHERE t.status <> 'closed' AND t.kind = 'official' ORDER BY t.sort, t.id`);
    return rows.map((t) => summary(t, t.seated));
  }

  private async table(db: Db | Tx, tableId: string): Promise<TableRow> {
    const [t] = await db.execute<TableRow>(sql`SELECT * FROM bj_tables WHERE id = ${tableId}`);
    if (!t) throw fail('not_found');
    return t;
  }

  async view(tableId: string, viewerId: string | null): Promise<BjtTableView> {
    const t = await this.table(this.db, tableId);
    const seats = await this.db.execute<{ seat: number; user_id: string; leaving: boolean; uid: number; display_name: string; avatar: number; avatar_item: string | null; frame: string }>(sql`
      SELECT s.seat, s.user_id, s.leaving, u.uid, u.display_name, u.avatar, u.avatar_item, u.frame
      FROM bj_seats s JOIN users u ON u.id = s.user_id WHERE s.table_id = ${tableId} ORDER BY s.seat`);
    const online = await this.hub.onlineAmong(seats.map((s) => s.user_id));
    const [r] = await this.db.execute<RoundRow>(sql`SELECT * FROM bj_rounds WHERE table_id = ${tableId} ORDER BY seq DESC LIMIT 1`);
    const round =
      r && (r.status === 'active' || r.status === 'done')
        ? bjtView(r.state, { id: r.id, seq: Number(r.seq), deadline: r.deadline ? new Date(r.deadline).getTime() : null, seedHash: r.seed_hash, serverSeed: r.server_seed })
        : null;
    return {
      table: summary(t, seats.length),
      seats: seats.map(
        (s): BjtSeatView => ({ seat: s.seat, uid: Number(s.uid), displayName: s.display_name, avatar: s.avatar, avatarItem: s.avatar_item, frame: s.frame, online: online.has(s.user_id), leaving: s.leaving }),
      ),
      round,
      mySeat: seats.find((s) => s.user_id === viewerId)?.seat ?? null,
    };
  }

  /** Everything at a table is public (all cards but the dealer's hole card), so one view serves all. */
  async broadcast(tableId: string): Promise<void> {
    const view = await this.view(tableId, null);
    this.hub.publishRoom(bjtRoom(tableId), { type: 'event', event: 'bjt', data: view } as unknown as ServerMessage);
  }

  // ---------------------------------------------------------------- seats

  async sit(userId: string, tableId: string, seat: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const t = await this.table(tx, tableId);
      if (t.status !== 'open') throw fail('table_unavailable');
      await assertRoomAccess(tx, 'bj', tableId, userId);
      if (!Number.isInteger(seat) || seat < 0 || seat >= Math.min(t.seats, BJT_SEATS)) throw fail('bad_request');
      const mine = await tx.execute<{ table_id: string }>(sql`SELECT table_id FROM bj_seats WHERE user_id = ${userId}::uuid`);
      if (mine.length) throw fail('already_seated');
      const inserted = await tx.execute(sql`INSERT INTO bj_seats (table_id, seat, user_id) VALUES (${tableId}, ${seat}, ${userId}::uuid) ON CONFLICT DO NOTHING RETURNING seat`);
      if (!inserted.length) throw fail('seat_taken');
    });
    await this.broadcast(tableId);
  }

  /** Leaves the seat now, or after the round when the player still has cards in it. */
  async stand(userId: string, tableId: string): Promise<{ leaving: boolean }> {
    const leaving = await this.db.transaction(async (tx) => {
      const [seat] = await tx.execute<{ seat: number }>(sql`SELECT seat FROM bj_seats WHERE table_id = ${tableId} AND user_id = ${userId}::uuid FOR UPDATE`);
      if (!seat) throw fail('not_seated');
      const [r] = await tx.execute<RoundRow>(sql`SELECT * FROM bj_rounds WHERE table_id = ${tableId} AND status = 'active'`);
      const inRound = r?.state.players.some((p) => p.userId === userId);
      if (inRound) {
        await tx.execute(sql`UPDATE bj_seats SET leaving = true WHERE table_id = ${tableId} AND user_id = ${userId}::uuid`);
        // On their turn, play on for them at once (they stand).
        if (r && bjtCurrent(r.state)?.userId === userId) await tx.execute(sql`UPDATE bj_rounds SET deadline = now() WHERE id = ${r.id}::uuid`);
        return true;
      }
      await tx.execute(sql`DELETE FROM bj_seats WHERE table_id = ${tableId} AND user_id = ${userId}::uuid`);
      return false;
    });
    await this.broadcast(tableId);
    return { leaving };
  }

  private async releaseLeavers(tableId: string, all = false): Promise<void> {
    const gone = all
      ? await this.db.execute(sql`DELETE FROM bj_seats WHERE table_id = ${tableId} RETURNING seat`)
      : await this.db.execute(sql`DELETE FROM bj_seats WHERE table_id = ${tableId} AND (leaving OR idle_rounds >= ${OFFLINE_ROUNDS}) RETURNING seat`);
    if (gone.length) await this.broadcast(tableId);
  }

  // ---------------------------------------------------------------- rounds

  private async openRound(tableId: string): Promise<void> {
    const id = randomUUID();
    const serverSeed = randomBytes(32).toString('hex');
    const opened = await this.db.transaction(async (tx) => {
      const seats = await tx.execute<{ user_id: string }>(sql`SELECT user_id FROM bj_seats WHERE table_id = ${tableId} FOR UPDATE`);
      if (!seats.length) return false;
      // Seats of players who are not connected are released after a few rounds.
      const online = await this.hub.onlineAmong(seats.map((s) => s.user_id));
      await tx.execute(sql`UPDATE bj_seats SET idle_rounds = CASE WHEN user_id::text = ANY(string_to_array(${[...online].join(',')}, ',')) THEN 0 ELSE idle_rounds + 1 END WHERE table_id = ${tableId}`);
      const [{ seq }] = (await tx.execute<{ seq: string }>(sql`SELECT coalesce(max(seq), 0) + 1 AS seq FROM bj_rounds WHERE table_id = ${tableId}`)) as unknown as [{ seq: string }];
      const state = bjtNewRound(bjtShoe(serverSeed, id));
      await tx.execute(sql`
        INSERT INTO bj_rounds (id, table_id, seq, state, server_seed, seed_hash, deadline)
        VALUES (${id}::uuid, ${tableId}, ${seq}, ${JSON.stringify(state)}::jsonb, ${serverSeed}, ${sha256(serverSeed)}, ${deadlineFor(state)!.toISOString()}::timestamptz)
        ON CONFLICT DO NOTHING`);
      return true;
    });
    if (opened) await this.broadcast(tableId);
  }

  /**
   * Locked read-modify-write of one round. `fn` returns the next state (or null for no change)
   * and may move money inside the same transaction. Settles the round when it reaches 'done'.
   */
  private async mutate(roundId: string, fn: (s: BjtState, row: RoundRow, tx: Tx) => Promise<BjtState | null>): Promise<{ tableId: string } | null> {
    const progress = new Map<string, ExpResult>();
    const changed = await this.db.transaction(async (tx) => {
      const [row] = await tx.execute<RoundRow>(sql`SELECT * FROM bj_rounds WHERE id = ${roundId}::uuid FOR UPDATE`);
      if (!row) throw fail('round_not_found');
      if (row.status !== 'active') throw fail('round_finished');
      let next: BjtState | null;
      try {
        next = await fn(row.state, row, tx);
      } catch (err) {
        if (err instanceof BjtIllegal) throw fail('illegal_action');
        throw err;
      }
      if (!next) return null;
      const keys = (next as BjtState & { keys?: string[] }).keys ?? row.state.keys ?? [];
      const done = next.phase === 'done';
      let deadline = done ? null : deadlineFor(next)!;
      // A player who left (or lost connection) on their turn is not waited for: stand at once / after a short grace.
      const turn = bjtCurrent(next);
      if (deadline && turn) {
        const [seat] = await tx.execute<{ leaving: boolean }>(sql`SELECT leaving FROM bj_seats WHERE table_id = ${row.table_id} AND user_id = ${turn.userId}::uuid`);
        if (!seat || seat.leaving) deadline = new Date();
        else if (!(await this.hub.onlineAmong([turn.userId])).size) deadline = new Date(Date.now() + OFFLINE_TURN_MS);
      }
      await tx.execute(sql`
        UPDATE bj_rounds SET state = ${JSON.stringify({ ...next, keys })}::jsonb, version = version + 1,
          deadline = ${deadline ? deadline.toISOString() : null}::timestamptz,
          status = ${done ? 'done' : 'active'}, ended_at = ${done ? new Date().toISOString() : null}::timestamptz
        WHERE id = ${roundId}::uuid`);
      if (done) await this.settle(tx, row, next, progress);
      return { tableId: row.table_id };
    });
    if (!changed) return null;
    for (const [userId, p] of progress) notifyProgress(this.hub, userId, p);
    await this.broadcast(changed.tableId);
    return changed;
  }

  /** Pays every player once and records a game round per player (history, missions, EXP). */
  private async settle(tx: Tx, row: RoundRow, s: BjtState, progress: Map<string, ExpResult>): Promise<void> {
    for (const p of s.players) {
      if (p.payout > 0) await applyDelta(tx, p.userId, p.payout, 'payout', row.id);
      const stake = bjtStake(p);
      await tx
        .insert(gameRounds)
        .values({
          userId: p.userId,
          game: 'blackjack',
          bet: stake,
          payout: p.payout,
          status: 'settled',
          result: { tableId: row.table_id, roundId: row.id, seat: p.seat, hands: p.hands.map((h) => ({ cards: h.cards, outcome: h.outcome, payout: h.payout })), insurance: p.insurance, insurancePayout: p.insurancePayout },
          idempotencyKey: `bjt:${row.id}:${p.seat}`,
          settledAt: new Date(),
        })
        .onConflictDoNothing();
      const exp = await awardGameplayExp(tx, p.userId, `bjt:${row.id}:${p.seat}`, stake);
      if (exp) progress.set(p.userId, exp);
    }
  }

  private async expire(roundId: string, now: Date): Promise<void> {
    await this.mutate(roundId, async (s, row, tx) => {
      if (!row.deadline || new Date(row.deadline) > now) return null;
      if (s.phase === 'betting') {
        if (s.players.length) return bjtDeal(s);
        // Nobody bet: keep the betting window open, or close the round if the table emptied.
        const [n] = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM bj_seats WHERE table_id = ${row.table_id}`);
        if (!n!.n) {
          await tx.execute(sql`UPDATE bj_rounds SET status = 'void', ended_at = now(), deadline = NULL WHERE id = ${roundId}::uuid`);
          return null;
        }
        return { ...s };
      }
      if (s.phase === 'insurance') return bjtCloseInsurance(s);
      if (s.phase === 'playing') return bjtTimeout(s);
      return null;
    }).catch((err) => {
      if (!(err && typeof err === 'object' && 'code' in err)) throw err;
    });
  }

  /** The player's round on this table, with their seat. */
  private async active(tableId: string, userId: string) {
    const [seat] = await this.db.execute<{ seat: number }>(sql`SELECT seat FROM bj_seats WHERE table_id = ${tableId} AND user_id = ${userId}::uuid`);
    if (!seat) throw fail('not_seated');
    const [r] = await this.db.execute<{ id: string }>(sql`SELECT id FROM bj_rounds WHERE table_id = ${tableId} AND status = 'active'`);
    if (!r) throw fail('round_not_found');
    return { seat: seat.seat, roundId: r.id };
  }

  /** Remembers request ids already applied to this round (a retried request is a no-op). */
  private seen(s: BjtState & { keys?: string[] }, key: string): boolean {
    return !!s.keys?.includes(key);
  }
  private remember(s: BjtState, key: string, prev: BjtState & { keys?: string[] }): BjtState {
    return Object.assign(s, { keys: [...(prev.keys ?? []), key].slice(-100) });
  }

  async bet(userId: string, tableId: string, amount: number, key: string): Promise<void> {
    const { seat, roundId } = await this.active(tableId, userId);
    const t = await this.table(this.db, tableId);
    if (!Number.isSafeInteger(amount) || amount < Number(t.min_bet) || amount > Number(t.max_bet)) throw fail('invalid_bet');
    await this.mutate(roundId, async (s, row, tx) => {
      if (this.seen(s, key)) return null;
      const still = await tx.execute(sql`SELECT 1 FROM bj_seats WHERE table_id = ${tableId} AND user_id = ${userId}::uuid AND seat = ${seat} AND NOT leaving`);
      if (!still.length) throw fail('not_seated');
      const next = bjtPlaceBet(s, seat, userId, amount);
      await applyDelta(tx, userId, -amount, 'bet', row.id);
      await tx.execute(sql`UPDATE bj_seats SET idle_rounds = 0 WHERE table_id = ${tableId} AND user_id = ${userId}::uuid`);
      // Everyone seated has bet: deal now instead of waiting for the timer.
      const [n] = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM bj_seats WHERE table_id = ${tableId} AND NOT leaving`);
      const ready = next.players.length >= n!.n ? bjtDeal(next) : next;
      return this.remember(ready, key, s);
    });
    this.hub.sendToUser(userId, { type: 'event', event: 'wallet', data: await getWallet(this.db, userId) });
  }

  async act(userId: string, tableId: string, roundId: string, action: BjtAction, amount: number, key: string): Promise<void> {
    const { seat, roundId: current } = await this.active(tableId, userId);
    if (current !== roundId) throw fail('round_finished');
    await this.mutate(roundId, async (s, row, tx) => {
      if (this.seen(s, key)) return null;
      const player = s.players.find((p) => p.seat === seat && p.userId === userId);
      if (!player) throw fail('illegal_action');
      const extra = bjtExtraStake(s, seat, action, amount);
      // Validate the move before any money moves (the engine throws on illegal moves).
      const next = action === 'insurance' ? bjtInsure(s, seat, amount) : bjtAct(s, seat, action);
      if (extra > 0) await applyDelta(tx, userId, -extra, 'bet', row.id);
      return this.remember(next, key, s);
    });
    this.hub.sendToUser(userId, { type: 'event', event: 'wallet', data: await getWallet(this.db, userId) });
  }

  async setStatus(tableId: string, status: BjtTableSummary['status']) {
    await this.db.execute(sql`UPDATE bj_tables SET status = ${status} WHERE id = ${tableId}`);
    await this.broadcast(tableId);
  }
}
