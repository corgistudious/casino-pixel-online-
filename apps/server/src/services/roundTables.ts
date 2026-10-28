import { randomBytes } from 'node:crypto';
import {
  type PublicIdentity,
  betAreaKey,
  DEFAULT_TIMINGS,
  ECONOMY,
  isValidTableBet,
  rollTaiXiu,
  spinRouletteNumber,
  tableBetReturn,
  type MyTableBet,
  type RoundGame,
  type RoundOutcome,
  type RoundPhase,
  type RoundTimings,
  type ServerMessage,
  type TableBet,
  type TableRoundView,
  type TableSummary,
} from '@casino/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Sql } from 'postgres';
import type { Db } from '../db/client';
import { gameRounds, gameTables, tableBets, tableRounds, users } from '../db/schema';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { fairRng, sha256 } from './fair';
import { isBigWin } from './games';
import { identities } from './identity';
import { badgesOf } from './users';
import { applyDelta, getWallet } from './wallet';
import { awardGameplayExp, notifyProgress, type ExpResult } from './progression';

type TableRow = typeof gameTables.$inferSelect;
type RoundRow = typeof tableRounds.$inferSelect;
interface TableConfig {
  minBet: number;
  maxBet: number;
  timings: RoundTimings;
}

const ROUND_GAMES: readonly string[] = ['taixiu', 'roulette'];
const HISTORY = 20;
export const tableRoom = (tableId: string) => `table:${tableId}`;

/** The outcome is a pure function of the round's server seed and id, so it can be re-checked after the seed is revealed. */
export function roundOutcome(game: RoundGame, serverSeed: string, roundId: string): RoundOutcome {
  const rng = fairRng(serverSeed, roundId, 0);
  return game === 'taixiu' ? rollTaiXiu(rng) : spinRouletteNumber(rng);
}

function configOf(t: TableRow): TableConfig {
  const c = t.config as Partial<TableConfig>;
  const game = t.game as RoundGame;
  return { minBet: c.minBet ?? ECONOMY.minBet, maxBet: c.maxBet ?? ECONOMY.maxBet, timings: { ...DEFAULT_TIMINGS[game], ...c.timings } };
}

export function phaseOf(r: Pick<RoundRow, 'betsOpenAt' | 'locksAt' | 'revealAt' | 'status'>, now: Date): RoundPhase {
  if (r.status === 'settled' || r.status === 'void') return 'result';
  if (r.status === 'locked') return 'revealing';
  if (now < r.betsOpenAt) return 'shaking';
  if (now < r.locksAt) return 'betting';
  return 'revealing';
}

function summary(t: TableRow): TableSummary {
  const c = configOf(t);
  return { id: t.id, game: t.game as RoundGame, name: { vi: t.nameVi, en: t.nameEn }, minBet: c.minBet, maxBet: c.maxBet, status: t.status === 'open' ? 'open' : 'paused' };
}

const toMyBet = (b: typeof tableBets.$inferSelect): MyTableBet => ({
  id: b.id,
  kind: b.kind,
  value: b.value,
  amount: b.amount,
  payout: b.payout,
  status: b.status as MyTableBet['status'],
});

/**
 * Runs Tài Xỉu and Roulette tables. Every transition is a guarded database update
 * (`WHERE status = …`), so a tick can be repeated, run after a restart, or race with another
 * instance without paying twice. Only one instance drives the clock (a PostgreSQL advisory lock);
 * any instance can accept bets.
 */
export class RoundTableEngine {
  private timer?: NodeJS.Timeout;
  private leaderConn?: Awaited<ReturnType<Sql['reserve']>>;
  private ticking = false;
  private lastTotals = new Map<string, string>();
  private lastTotalsAt = new Map<string, number>();

  constructor(
    private readonly db: Db,
    private readonly client: Sql,
    private readonly hub: RealtimeHub,
    private readonly log: FastifyBaseLogger,
  ) {}

  /** Becomes the scheduler if no other instance holds the lock; retries every 15 s otherwise. */
  async start(intervalMs = 250): Promise<void> {
    const tryLead = async () => {
      if (this.leaderConn) return;
      const conn = await this.client.reserve();
      const [row] = await conn`SELECT pg_try_advisory_lock(hashtext('keyo:round-tables')) AS ok`;
      if (row?.ok) {
        this.leaderConn = conn;
        this.log.info('round-table scheduler started on this instance');
      } else {
        conn.release();
      }
    };
    await tryLead().catch((err) => this.log.warn({ err }, 'scheduler lock failed'));
    let sinceTry = 0;
    this.timer = setInterval(() => {
      if (this.leaderConn) void this.tick().catch((err) => this.log.error({ err }, 'round-table tick failed'));
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
      await this.leaderConn`SELECT pg_advisory_unlock(hashtext('keyo:round-tables'))`.catch(() => {});
      this.leaderConn.release();
      this.leaderConn = undefined;
    }
  }

  get isLeader(): boolean {
    return !!this.leaderConn;
  }

  /** Advances every round table by at most one step. Safe to call repeatedly or concurrently. */
  async tick(now = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const tables = await this.db.select().from(gameTables).where(inArray(gameTables.game, [...ROUND_GAMES]));
      for (const table of tables) await this.advance(table, now);
    } finally {
      this.ticking = false;
    }
  }

  private async latestRound(tableId: string): Promise<RoundRow | undefined> {
    const [row] = await this.db.select().from(tableRounds).where(eq(tableRounds.tableId, tableId)).orderBy(desc(tableRounds.seq)).limit(1);
    return row;
  }

  private async advance(table: TableRow, now: Date): Promise<void> {
    const round = await this.latestRound(table.id);
    if (!round || ((round.status === 'settled' || round.status === 'void') && now >= round.nextAt)) {
      if (table.status === 'open') {
        await this.openRound(table, (round?.seq ?? 0) + 1, now);
        await this.broadcast(table.id);
      }
      return;
    }
    if (round.status === 'betting' && now >= round.locksAt) {
      if (await this.lockRound(table, round)) await this.broadcast(table.id);
      return;
    }
    if (round.status === 'locked' && now >= round.revealAt) {
      await this.settleRound(round.id);
      await this.broadcast(table.id);
      return;
    }
    if (round.status === 'betting' && now >= round.betsOpenAt) await this.broadcastTotalsIfChanged(table.id, round.id);
  }

  async openRound(table: TableRow, seq: number, now = new Date()): Promise<void> {
    const t = configOf(table).timings;
    const serverSeed = randomBytes(32).toString('hex');
    const betsOpenAt = new Date(now.getTime() + t.shakeMs);
    const locksAt = new Date(betsOpenAt.getTime() + t.betMs);
    const revealAt = new Date(locksAt.getTime() + t.revealMs);
    const nextAt = new Date(revealAt.getTime() + t.breakMs);
    await this.db
      .insert(tableRounds)
      .values({ tableId: table.id, seq, serverSeed, seedHash: sha256(serverSeed), opensAt: now, betsOpenAt, locksAt, revealAt, nextAt })
      .onConflictDoNothing();
  }

  /** Closes betting and fixes the outcome from the committed seed. Bets placed in transactions that started before the lock still count. */
  async lockRound(table: TableRow, round: RoundRow): Promise<boolean> {
    const outcome = roundOutcome(table.game as RoundGame, round.serverSeed, round.id);
    const updated = await this.db
      .update(tableRounds)
      .set({ status: 'locked', outcome })
      .where(and(eq(tableRounds.id, round.id), eq(tableRounds.status, 'betting')))
      .returning({ id: tableRounds.id });
    return updated.length > 0;
  }

  /**
   * Pays every bet of a locked round exactly once: the round row is locked and its status moves
   * to "settled" in the same transaction as the ledger entries.
   */
  async settleRound(roundId: string): Promise<boolean> {
    const result = await this.db.transaction(async (tx) => {
      const [round] = await tx.select().from(tableRounds).where(and(eq(tableRounds.id, roundId), eq(tableRounds.status, 'locked'))).for('update');
      if (!round) return null;
      const [table] = await tx.select().from(gameTables).where(eq(gameTables.id, round.tableId));
      const game = table!.game as RoundGame;
      const outcome = round.outcome as RoundOutcome;
      const bets = await tx.select().from(tableBets).where(and(eq(tableBets.roundId, roundId), eq(tableBets.status, 'placed')));
      const perUser = new Map<string, { bet: number; payout: number; bets: { kind: string; value: number | null; amount: number; payout: number }[] }>();
      for (const b of bets) {
        const payout = tableBetReturn(game, { kind: b.kind, value: b.value ?? undefined, amount: b.amount }, outcome);
        await tx.update(tableBets).set({ payout, status: 'settled' }).where(eq(tableBets.id, b.id));
        const u = perUser.get(b.userId) ?? { bet: 0, payout: 0, bets: [] };
        u.bet += b.amount;
        u.payout += payout;
        u.bets.push({ kind: b.kind, value: b.value, amount: b.amount, payout });
        perUser.set(b.userId, u);
      }
      const progress = new Map<string, ExpResult>();
      for (const [userId, u] of perUser) {
        if (u.payout > 0) await applyDelta(tx, userId, u.payout, 'payout', null, 'silver', `round:${roundId}`);
        const p = await awardGameplayExp(tx, userId, `table:${roundId}`, u.bet);
        if (p) progress.set(userId, p);
        // One history row per player and round, so stats, history and the dashboard include table games.
        await tx
          .insert(gameRounds)
          .values({
            userId,
            game,
            bet: u.bet,
            payout: u.payout,
            status: 'settled',
            result: { tableId: round.tableId, tableRoundId: roundId, seq: round.seq, outcome, bets: u.bets },
            idempotencyKey: `table:${roundId}`,
            settledAt: new Date(),
          })
          .onConflictDoNothing();
      }
      await tx.update(tableRounds).set({ status: 'settled', settledAt: new Date() }).where(eq(tableRounds.id, roundId));
      return { game, perUser, progress };
    });
    if (!result) return false;
    for (const [userId, u] of result.perUser) {
      this.hub.sendToUser(userId, { type: 'event', event: 'wallet', data: await getWallet(this.db, userId) });
      const p = result.progress.get(userId);
      if (p) notifyProgress(this.hub, userId, p);
      if (isBigWin(u)) {
        const [user] = await this.db.select().from(users).where(eq(users.id, userId));
        if (user) void this.hub.recordBigWin({ displayName: user.displayName, badges: badgesOf(user), game: result.game, bet: u.bet, payout: u.payout, at: new Date().toISOString() });
      }
    }
    return true;
  }

  /** Cancels an unsettled round and refunds every stake (used by staff when something went wrong). */
  async voidRound(roundId: string, reason: string): Promise<number> {
    const refunded = await this.db.transaction(async (tx) => {
      const [round] = await tx
        .select()
        .from(tableRounds)
        .where(and(eq(tableRounds.id, roundId), inArray(tableRounds.status, ['betting', 'locked'])))
        .for('update');
      if (!round) throw fail('round_finished');
      const bets = await tx.select().from(tableBets).where(and(eq(tableBets.roundId, roundId), eq(tableBets.status, 'placed')));
      const perUser = new Map<string, number>();
      for (const b of bets) perUser.set(b.userId, (perUser.get(b.userId) ?? 0) + b.amount);
      for (const [userId, amount] of perUser) await applyDelta(tx, userId, amount, 'refund', null, 'silver', `round:${roundId}`);
      await tx.update(tableBets).set({ status: 'refunded', payout: 0 }).where(and(eq(tableBets.roundId, roundId), eq(tableBets.status, 'placed')));
      // The round ends now; the next one starts after the table's normal break.
      const [table] = await tx.select().from(gameTables).where(eq(gameTables.id, round.tableId));
      const t = configOf(table!).timings.breakMs;
      await tx
        .update(tableRounds)
        .set({ status: 'void', voidReason: reason, settledAt: new Date(), nextAt: new Date(Date.now() + t) })
        .where(eq(tableRounds.id, roundId));
      return { tableId: round.tableId, users: [...perUser.keys()] };
    });
    for (const userId of refunded.users) this.hub.sendToUser(userId, { type: 'event', event: 'wallet', data: await getWallet(this.db, userId) });
    await this.broadcast(refunded.tableId);
    return refunded.users.length;
  }

  /**
   * Places bets on the current round. The round must be in its betting window by the database
   * clock (the same clock the scheduler locks with); stakes are debited in the same transaction.
   * `key` is the client's message id: retrying the same message never bets twice.
   */
  async placeBets(userId: string, tableId: string, roundId: string, bets: TableBet[], key: string): Promise<{ myBets: MyTableBet[]; balance: number }> {
    const [table] = await this.db.select().from(gameTables).where(eq(gameTables.id, tableId));
    if (!table || !ROUND_GAMES.includes(table.game)) throw fail('table_not_found');
    const game = table.game as RoundGame;
    const cfg = configOf(table);
    if (!bets.every((b) => isValidTableBet(game, b))) throw fail('invalid_bet');
    if (bets.some((b) => b.amount < cfg.minBet)) throw fail('bet_too_low');
    const total = bets.reduce((s, b) => s + b.amount, 0);
    const keys = bets.map((_, i) => `${key}:${i}`);

    const existing = await this.db.select().from(tableBets).where(and(eq(tableBets.userId, userId), inArray(tableBets.idempotencyKey, keys)));
    if (existing.length) return { myBets: await this.myBets(roundId, userId), balance: (await getWallet(this.db, userId)).balance };

    try {
      const balance = await this.db.transaction(async (tx) => {
        const [round] = await tx
          .select({ id: tableRounds.id })
          .from(tableRounds)
          .where(and(eq(tableRounds.id, roundId), eq(tableRounds.tableId, tableId), eq(tableRounds.status, 'betting'), sql`now() >= ${tableRounds.betsOpenAt} AND now() < ${tableRounds.locksAt}`))
          .for('share');
        if (!round) throw fail('betting_closed');
        // One player's concurrent bets are serialised so the per-round limit holds.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${roundId}`}))`);
        const [{ placed }] = (await tx.execute(sql`SELECT coalesce(sum(amount), 0) AS placed FROM table_bets WHERE round_id = ${roundId} AND user_id = ${userId}`)) as unknown as [{ placed: string }];
        if (Number(placed) + total > cfg.maxBet) throw fail('bet_too_high');
        await tx.insert(tableBets).values(bets.map((b, i) => ({ roundId, userId, kind: b.kind, value: b.value ?? null, amount: b.amount, idempotencyKey: keys[i]! })));
        return applyDelta(tx, userId, -total, 'bet', null, 'silver', `round:${roundId}`);
      });
      return { myBets: await this.myBets(roundId, userId), balance };
    } catch (err) {
      // The same message raced with itself: return what was stored.
      if ((err as { code?: string }).code === '23505' || String((err as { cause?: { code?: string } }).cause?.code) === '23505') {
        return { myBets: await this.myBets(roundId, userId), balance: (await getWallet(this.db, userId)).balance };
      }
      throw err;
    }
  }

  async myBets(roundId: string, userId: string): Promise<MyTableBet[]> {
    const rows = await this.db.select().from(tableBets).where(and(eq(tableBets.roundId, roundId), eq(tableBets.userId, userId))).orderBy(tableBets.createdAt);
    return rows.map(toMyBet);
  }

  async listTables(): Promise<TableSummary[]> {
    const rows = await this.db.select().from(gameTables).where(inArray(gameTables.game, [...ROUND_GAMES])).orderBy(gameTables.sort);
    return rows.map(summary);
  }

  /** Full table state. The outcome is included only once bets are locked, the seed only after payout. */
  async view(tableId: string, userId?: string, now = new Date()): Promise<TableRoundView> {
    const [table] = await this.db.select().from(gameTables).where(eq(gameTables.id, tableId));
    if (!table || !ROUND_GAMES.includes(table.game)) throw fail('table_not_found');
    const round = await this.latestRound(tableId);
    if (!round) throw fail('table_unavailable');
    const [totalsRows, history, mine] = await Promise.all([
      this.db
        .select({ kind: tableBets.kind, value: tableBets.value, amount: sql<string>`sum(${tableBets.amount})`, players: sql<string>`count(DISTINCT ${tableBets.userId})` })
        .from(tableBets)
        .where(eq(tableBets.roundId, round.id))
        .groupBy(tableBets.kind, tableBets.value),
      this.db
        .select({ outcome: tableRounds.outcome })
        .from(tableRounds)
        .where(and(eq(tableRounds.tableId, tableId), eq(tableRounds.status, 'settled')))
        .orderBy(desc(tableRounds.seq))
        .limit(HISTORY),
      userId ? this.myBets(round.id, userId) : Promise.resolve([]),
    ]);
    const roomUserIds = await this.hub.roomUserIds(tableRoom(tableId));
    const [bettors, bettorRows] = await Promise.all([
      this.db.execute<{ n: string }>(sql`SELECT count(DISTINCT user_id) AS n FROM table_bets WHERE round_id = ${round.id}`),
      this.db.selectDistinct({ userId: tableBets.userId }).from(tableBets).where(eq(tableBets.roundId, round.id)).limit(60),
    ]);
    // Public identities only (photo/avatar, frame, VIP, rank, badges): never bet amounts or balances.
    const watching = roomUserIds.slice(0, 100);
    const ids = await identities(this.db, [...bettorRows.map((b) => b.userId), ...watching]);
    const players = bettorRows.map((b) => ids.get(b.userId)).filter((x): x is PublicIdentity => !!x);
    const members = watching.map((id) => ids.get(id)).filter((x): x is PublicIdentity => !!x);
    const showOutcome = round.status === 'locked' || round.status === 'settled';
    return {
      table: summary(table),
      round: {
        id: round.id,
        seq: round.seq,
        phase: phaseOf(round, now),
        opensAt: round.opensAt.toISOString(),
        betsOpenAt: round.betsOpenAt.toISOString(),
        locksAt: round.locksAt.toISOString(),
        revealAt: round.revealAt.toISOString(),
        nextAt: round.nextAt.toISOString(),
        seedHash: round.seedHash,
        serverSeed: round.status === 'settled' ? round.serverSeed : null,
        outcome: showOutcome ? (round.outcome as RoundOutcome) : null,
        status: round.status as TableRoundView['round']['status'],
      },
      serverNow: now.getTime(),
      totals: Object.fromEntries(totalsRows.map((r) => [betAreaKey({ kind: r.kind, value: r.value ?? undefined }), { amount: Number(r.amount), players: Number(r.players) }])),
      bettors: Number(bettors[0]?.n ?? 0),
      players,
      watchers: roomUserIds.length,
      members,
      history: history.map((h) => h.outcome as RoundOutcome),
      myBets: mine,
    };
  }

  private async broadcast(tableId: string): Promise<void> {
    const { myBets: _mine, ...view } = await this.view(tableId);
    this.lastTotals.set(tableId, JSON.stringify(view.totals));
    const msg: ServerMessage = { type: 'event', event: 'table', data: view };
    this.hub.publishRoom(tableRoom(tableId), msg);
  }

  /** Live pool totals during betting, sent only when they change. */
  private async broadcastTotalsIfChanged(tableId: string, _roundId: string): Promise<void> {
    if (Date.now() - (this.lastTotalsAt.get(tableId) ?? 0) < 1_000) return;
    this.lastTotalsAt.set(tableId, Date.now());
    const { myBets: _mine, ...view } = await this.view(tableId);
    const key = JSON.stringify(view.totals);
    if (this.lastTotals.get(tableId) === key) return;
    this.lastTotals.set(tableId, key);
    this.hub.publishRoom(tableRoom(tableId), { type: 'event', event: 'table', data: view });
  }
}
