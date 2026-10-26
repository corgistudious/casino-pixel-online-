import { randomBytes } from 'node:crypto';
import {
  engineOf,
  ROOM_MAX_SEATS,
  ROOM_RULES,
  ROOM_STAKES,
  roomBlackjackLimits,
  roomCardConfig,
  type CardGame,
  type CardTableConfig,
  type RoomCreateInput,
  type RoomEngine,
  type RoomFilter,
  type RoomGame,
  type RoomSummary,
  type RoomUpdateInput,
  type RoomView,
  type ServerMessage,
} from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Sql } from 'postgres';
import { hashPassword, verifyPassword } from '../auth/password';
import type { Db, DbOrTx } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { bjtRoom, type BlackjackTableEngine } from './blackjackTables';
import { cardRoom, type CardTableEngine } from './cardTables';
import { audit } from './audit';
import { isProtectedDisplayName } from './protectedNames';
import { blockedBetween, isFriend, visiblePlayer } from './social';

type RoomRow = {
  id: string;
  engine: RoomEngine;
  table_id: string;
  game: RoomGame;
  name: string;
  owner_id: string;
  owner_uid: number;
  owner_name: string;
  visibility: 'public' | 'private';
  password_hash: string | null;
  stake: string;
  created_at: string;
  closed_at: string | null;
  seated: number;
  seats: number;
  range_min: string;
  range_max: string;
  playing: boolean;
};

/** Every room column the API may use, with live seat counts and whether a hand/round is running. */
const ROOM_SELECT = sql`
  SELECT r.id, r.engine, r.table_id, r.game, r.name, r.owner_id, o.uid AS owner_uid, o.display_name AS owner_name,
    r.visibility, r.password_hash, r.stake, r.created_at, r.closed_at,
    CASE WHEN r.engine = 'card' THEN (SELECT count(*)::int FROM card_seats s WHERE s.table_id = r.table_id)
         ELSE (SELECT count(*)::int FROM bj_seats s WHERE s.table_id = r.table_id) END AS seated,
    CASE WHEN r.engine = 'card' THEN (SELECT (ct.config->>'seats')::int FROM card_tables ct WHERE ct.id = r.table_id)
         ELSE (SELECT bt.seats FROM bj_tables bt WHERE bt.id = r.table_id) END AS seats,
    CASE WHEN r.engine = 'card' THEN (SELECT (ct.config->>'minBuyIn')::bigint FROM card_tables ct WHERE ct.id = r.table_id)
         ELSE (SELECT bt.min_bet FROM bj_tables bt WHERE bt.id = r.table_id) END AS range_min,
    CASE WHEN r.engine = 'card' THEN (SELECT (ct.config->>'maxBuyIn')::bigint FROM card_tables ct WHERE ct.id = r.table_id)
         ELSE (SELECT bt.max_bet FROM bj_tables bt WHERE bt.id = r.table_id) END AS range_max,
    CASE WHEN r.engine = 'card' THEN EXISTS (SELECT 1 FROM card_hands h WHERE h.table_id = r.table_id AND h.status = 'active')
         ELSE EXISTS (SELECT 1 FROM bj_rounds b WHERE b.table_id = r.table_id AND b.status = 'active' AND jsonb_array_length(b.state->'players') > 0) END AS playing
  FROM game_rooms r JOIN users o ON o.id = r.owner_id`;

const summaryOf = (r: RoomRow): RoomSummary => ({
  id: r.id,
  engine: r.engine,
  tableId: r.table_id,
  game: r.game,
  name: r.name,
  owner: { uid: Number(r.owner_uid), displayName: r.owner_name },
  visibility: r.visibility,
  locked: r.visibility === 'private',
  seated: r.seated,
  seats: r.seats,
  stake: Number(r.stake),
  range: [Number(r.range_min), Number(r.range_max)],
  status: r.playing ? 'playing' : 'waiting',
  createdAt: new Date(r.created_at).toISOString(),
});

/**
 * Player-created rooms on top of the existing table engines: a room is a card_tables / bj_tables
 * row (kind 'room') plus its game_rooms metadata. The engines run the games exactly as at official
 * tables; this service only owns who may enter (password, invitation, removal) and the host.
 */
export class RoomService {
  private timer?: NodeJS.Timeout;
  private leaderConn?: Awaited<ReturnType<Sql['reserve']>>;
  private sweeping = false;

  constructor(
    private readonly db: Db,
    private readonly client: Sql,
    private readonly hub: RealtimeHub,
    private readonly cards: CardTableEngine,
    private readonly bjt: BlackjackTableEngine,
    private readonly log: FastifyBaseLogger,
  ) {}

  async start(intervalMs = 5_000): Promise<void> {
    const tryLead = async () => {
      if (this.leaderConn) return;
      const conn = await this.client.reserve();
      const [row] = await conn`SELECT pg_try_advisory_lock(hashtext('keyo:rooms')) AS ok`;
      if (row?.ok) this.leaderConn = conn;
      else conn.release();
    };
    await tryLead().catch((err) => this.log.warn({ err }, 'room scheduler lock failed'));
    this.timer = setInterval(() => {
      if (this.leaderConn) void this.sweep().catch((err) => this.log.error({ err }, 'room sweep failed'));
      else void tryLead().catch(() => {});
    }, intervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    if (this.leaderConn) {
      await this.leaderConn`SELECT pg_advisory_unlock(hashtext('keyo:rooms'))`.catch(() => {});
      this.leaderConn.release();
      this.leaderConn = undefined;
    }
  }

  // ---------------------------------------------------------------- reads

  private async row(db: DbOrTx, id: string, lock = false): Promise<RoomRow> {
    if (lock) await db.execute(sql`SELECT id FROM game_rooms WHERE id = ${id} FOR UPDATE`);
    const [r] = await db.execute<RoomRow>(sql`${ROOM_SELECT} WHERE r.id = ${id}`);
    if (!r) throw fail('not_found');
    return r;
  }

  private async hasAccess(db: DbOrTx, r: RoomRow, userId: string): Promise<boolean> {
    if (r.owner_id === userId) return true;
    const [a] = await db.execute<{ via: string; kicked: boolean }>(sql`SELECT via, coalesce(kicked_until > now(), false) AS kicked FROM room_access WHERE room_id = ${r.id} AND user_id = ${userId}::uuid`);
    if (a?.kicked) return false;
    return r.visibility === 'public' || !!a;
  }

  async list(viewerId: string, opts: { game?: RoomGame; filter?: RoomFilter }): Promise<RoomSummary[]> {
    const rows = await this.db.execute<RoomRow>(sql`
      ${ROOM_SELECT}
      WHERE r.closed_at IS NULL ${opts.game ? sql`AND r.game = ${opts.game}` : sql``}
        ${opts.filter === 'public' ? sql`AND r.visibility = 'public'` : opts.filter === 'private' ? sql`AND r.visibility = 'private'` : sql``}
        AND NOT EXISTS (SELECT 1 FROM player_blocks b WHERE (b.blocker_id = r.owner_id AND b.blocked_id = ${viewerId}::uuid) OR (b.blocker_id = ${viewerId}::uuid AND b.blocked_id = r.owner_id))
      ORDER BY r.created_at DESC LIMIT 100`);
    const out = rows.map(summaryOf);
    return opts.filter === 'available' ? out.filter((r) => r.seated < r.seats) : out;
  }

  async view(viewerId: string, id: string): Promise<RoomView> {
    const r = await this.row(this.db, id);
    if (r.closed_at) throw fail('room_closed');
    return { ...summaryOf(r), isOwner: r.owner_id === viewerId, access: await this.hasAccess(this.db, r, viewerId) };
  }

  /** The room a table belongs to (for the table pages), or null for an official table. */
  async byTable(viewerId: string, engine: RoomEngine, tableId: string): Promise<RoomView | null> {
    const [r] = await this.db.execute<{ id: string }>(sql`SELECT id FROM game_rooms WHERE engine = ${engine} AND table_id = ${tableId} AND closed_at IS NULL`);
    return r ? this.view(viewerId, r.id) : null;
  }

  // ---------------------------------------------------------------- create / join

  async create(user: { id: string }, input: RoomCreateInput): Promise<RoomView> {
    if (isProtectedDisplayName(input.name)) throw fail('bad_request', 'name');
    const engine = engineOf(input.game);
    const seats = Math.min(input.seats ?? ROOM_MAX_SEATS[input.game], ROOM_MAX_SEATS[input.game]);
    const tableId = `r-${randomBytes(4).toString('hex')}`;
    const id = `${engine}:${tableId}`;
    const hash = input.visibility === 'private' ? await hashPassword(input.password!) : null;
    await this.db.transaction(async (tx) => {
      // One open room per host, serialised on the host's row.
      await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`);
      const open = await tx.execute(sql`SELECT 1 FROM game_rooms WHERE owner_id = ${user.id}::uuid AND closed_at IS NULL`);
      if (open.length) throw fail('room_limit');
      if (engine === 'card') {
        const cfg = roomCardConfig(input.game as CardGame, input.stake, seats);
        await tx.execute(sql`
          INSERT INTO card_tables (id, game, name_vi, name_en, config, mode, status, kind, sort)
          VALUES (${tableId}, ${input.game}, ${input.name}, ${input.name}, ${JSON.stringify(cfg)}::jsonb, 'casual', 'open', 'room', 1000)`);
      } else {
        const { minBet, maxBet } = roomBlackjackLimits(input.stake);
        await tx.execute(sql`
          INSERT INTO bj_tables (id, name_vi, name_en, min_bet, max_bet, seats, status, kind, sort)
          VALUES (${tableId}, ${input.name}, ${input.name}, ${minBet}, ${maxBet}, ${seats}, 'open', 'room', 1000)`);
      }
      await tx.execute(sql`
        INSERT INTO game_rooms (id, engine, table_id, game, name, owner_id, visibility, password_hash, stake)
        VALUES (${id}, ${engine}, ${tableId}, ${input.game}, ${input.name}, ${user.id}::uuid, ${input.visibility}, ${hash}, ${input.stake})`);
    });
    return this.view(user.id, id);
  }

  /**
   * Grants access: public rooms at once; private rooms for the host, invited players or the right
   * password. Wrong passwords count per room and across rooms; past the limit every attempt is
   * refused until the window ends (the correct password too), so guessing gains nothing.
   */
  async join(user: { id: string }, id: string, password?: string): Promise<RoomView> {
    const r = await this.row(this.db, id);
    if (r.closed_at) throw fail('room_closed');
    if (await blockedBetween(this.db, user.id, r.owner_id)) throw fail('blocked');
    const [a] = await this.db.execute<{ via: string; kicked: boolean }>(sql`SELECT via, coalesce(kicked_until > now(), false) AS kicked FROM room_access WHERE room_id = ${id} AND user_id = ${user.id}::uuid`);
    if (a?.kicked) throw fail('room_kicked');
    if (r.owner_id === user.id || (a && r.visibility === 'private') || r.visibility === 'public') {
      if (!a && r.owner_id !== user.id) await this.db.execute(sql`INSERT INTO room_access (room_id, user_id, via) VALUES (${id}, ${user.id}::uuid, 'public') ON CONFLICT DO NOTHING`);
      return this.view(user.id, id);
    }
    if (!password) throw fail('room_locked');
    const window = sql`make_interval(mins => ${ROOM_RULES.attemptWindowMinutes})`;
    const [att] = await this.db.execute<{ here: number; total: number }>(sql`
      SELECT coalesce(sum(failures) FILTER (WHERE room_id = ${id}), 0)::int AS here, coalesce(sum(failures), 0)::int AS total
      FROM room_join_attempts WHERE user_id = ${user.id}::uuid AND window_start > now() - ${window}`);
    if (att!.here >= ROOM_RULES.maxAttempts || att!.total >= ROOM_RULES.maxAttemptsAllRooms) throw fail('too_many_attempts');
    if (!(await verifyPassword(password, r.password_hash!))) {
      await this.db.execute(sql`
        INSERT INTO room_join_attempts (room_id, user_id, failures, window_start) VALUES (${id}, ${user.id}::uuid, 1, now())
        ON CONFLICT (room_id, user_id) DO UPDATE SET
          failures = CASE WHEN room_join_attempts.window_start > now() - ${window} THEN room_join_attempts.failures + 1 ELSE 1 END,
          window_start = CASE WHEN room_join_attempts.window_start > now() - ${window} THEN room_join_attempts.window_start ELSE now() END`);
      throw fail('room_password');
    }
    await this.db.execute(sql`DELETE FROM room_join_attempts WHERE room_id = ${id} AND user_id = ${user.id}::uuid`);
    await this.db.execute(sql`
      INSERT INTO room_access (room_id, user_id, via) VALUES (${id}, ${user.id}::uuid, 'password')
      ON CONFLICT (room_id, user_id) DO UPDATE SET via = 'password', granted_at = now(), kicked_until = NULL`);
    return this.view(user.id, id);
  }

  // ---------------------------------------------------------------- host actions

  private async owned(tx: DbOrTx, id: string, userId: string): Promise<RoomRow> {
    const r = await this.row(tx, id, true);
    if (r.closed_at) throw fail('room_closed');
    if (r.owner_id !== userId) throw fail('not_room_owner');
    return r;
  }

  /** Settings change only between hands: a running hand keeps the rules it started with. */
  async update(user: { id: string }, id: string, input: RoomUpdateInput): Promise<RoomView> {
    if (input.name && isProtectedDisplayName(input.name)) throw fail('bad_request', 'name');
    const hash = input.password ? await hashPassword(input.password) : null;
    await this.db.transaction(async (tx) => {
      const r = await this.owned(tx, id, user.id);
      // Lock the table row too: no hand/round can start while the settings change.
      if (r.engine === 'card') await tx.execute(sql`SELECT id FROM card_tables WHERE id = ${r.table_id} FOR UPDATE`);
      else await tx.execute(sql`SELECT id FROM bj_tables WHERE id = ${r.table_id} FOR UPDATE`);
      const fresh = await this.row(tx, id);
      if (fresh.playing) throw fail('room_busy');
      const visibility = input.visibility ?? r.visibility;
      const newHash = visibility === 'public' ? null : (hash ?? r.password_hash);
      if (visibility === 'private' && !newHash) throw fail('bad_request', 'password required');
      const stake = input.stake ?? Number(r.stake);
      if (!ROOM_STAKES[r.game].includes(stake)) throw fail('bad_request', 'stake');
      const seats = input.seats ?? r.seats;
      if (seats > ROOM_MAX_SEATS[r.game]) throw fail('bad_request', 'seats');
      // Seats cannot shrink below a seat someone is sitting in.
      const [{ top }] = (await tx.execute(
        r.engine === 'card' ? sql`SELECT coalesce(max(seat), -1)::int AS top FROM card_seats WHERE table_id = ${r.table_id}` : sql`SELECT coalesce(max(seat), -1)::int AS top FROM bj_seats WHERE table_id = ${r.table_id}`,
      )) as unknown as [{ top: number }];
      if (seats <= top) throw fail('bad_request', 'seats');
      const name = input.name ?? r.name;
      if (r.engine === 'card') {
        const cfg: CardTableConfig = roomCardConfig(r.game as CardGame, stake, seats);
        await tx.execute(sql`UPDATE card_tables SET config = ${JSON.stringify(cfg)}::jsonb, name_vi = ${name}, name_en = ${name} WHERE id = ${r.table_id}`);
      } else {
        const { minBet, maxBet } = roomBlackjackLimits(stake);
        await tx.execute(sql`UPDATE bj_tables SET min_bet = ${minBet}, max_bet = ${maxBet}, seats = ${seats}, name_vi = ${name}, name_en = ${name} WHERE id = ${r.table_id}`);
      }
      await tx.execute(sql`UPDATE game_rooms SET name = ${name}, visibility = ${visibility}, password_hash = ${newHash}, stake = ${stake}, updated_at = now() WHERE id = ${id}`);
      // A new password (or going private) shuts out whoever only had the old one and is not seated.
      if (hash || (visibility === 'private' && r.visibility === 'public')) {
        const seatTable = r.engine === 'card' ? sql`card_seats` : sql`bj_seats`;
        await tx.execute(sql`
          DELETE FROM room_access a WHERE a.room_id = ${id} AND a.via IN ('password', 'public') AND a.kicked_until IS NULL
            AND NOT EXISTS (SELECT 1 FROM ${seatTable} s WHERE s.table_id = ${r.table_id} AND s.user_id = a.user_id)`);
      }
    });
    await this.publish(id);
    return this.view(user.id, id);
  }

  /** Invites a friend: they get access without the password and a realtime invitation. */
  async invite(user: { id: string; uid: number; displayName: string }, id: string, uid: number): Promise<{ ok: true }> {
    if (uid === user.uid) throw fail('self_social');
    const { otherId, room } = await this.db.transaction(async (tx) => {
      const r = await this.owned(tx, id, user.id);
      const other = await visiblePlayer(tx, uid);
      if (other.status !== 'active') throw fail('not_found');
      if (await blockedBetween(tx, user.id, other.user_id)) throw fail('blocked');
      if (!(await isFriend(tx, user.id, other.user_id))) throw fail('not_friends');
      if (r.seated >= r.seats) throw fail('room_full');
      await tx.execute(sql`
        INSERT INTO room_access (room_id, user_id, via, invited_by) VALUES (${id}, ${other.user_id}::uuid, 'invite', ${user.id}::uuid)
        ON CONFLICT (room_id, user_id) DO UPDATE SET via = 'invite', invited_by = EXCLUDED.invited_by, granted_at = now(), kicked_until = NULL`);
      return { otherId: other.user_id, room: summaryOf(r) };
    });
    this.hub.sendToUser(otherId, { type: 'event', event: 'roomInvite', data: { room, from: { uid: user.uid, displayName: user.displayName } } } as ServerMessage);
    return { ok: true };
  }

  /**
   * Removes a player. Seated players stand the same way as leaving themselves: outside a hand their
   * chips go back to the wallet at once; inside one they are folded/stood on their turn and paid out
   * when it settles. Nobody loses chips or a payout to a kick.
   */
  async kick(user: { id: string; uid: number }, id: string, uid: number): Promise<{ ok: true }> {
    if (uid === user.uid) throw fail('self_social');
    const { otherId, r } = await this.db.transaction(async (tx) => {
      const r = await this.owned(tx, id, user.id);
      const other = await visiblePlayer(tx, uid);
      await tx.execute(sql`
        INSERT INTO room_access (room_id, user_id, via, kicked_until) VALUES (${id}, ${other.user_id}::uuid, 'public', now() + make_interval(mins => ${ROOM_RULES.kickMinutes}))
        ON CONFLICT (room_id, user_id) DO UPDATE SET kicked_until = EXCLUDED.kicked_until`);
      return { otherId: other.user_id, r };
    });
    try {
      if (r.engine === 'card') await this.cards.stand(otherId, r.table_id);
      else await this.bjt.stand(otherId, r.table_id);
    } catch (err) {
      if (!(err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'not_seated')) throw err;
    }
    this.hub.sendToUser(otherId, { type: 'event', event: 'roomKicked', data: { roomId: id, tableId: r.table_id } } as ServerMessage);
    await this.publish(id);
    return { ok: true };
  }

  /** The host closes an empty room. */
  async close(user: { id: string }, id: string): Promise<{ ok: true }> {
    await this.db.transaction(async (tx) => {
      const r = await this.owned(tx, id, user.id);
      if (r.seated > 0 || r.playing) throw fail('room_busy');
      await this.closeRoom(tx, r);
    });
    await this.publish(id, true);
    return { ok: true };
  }

  private async closeRoom(tx: DbOrTx, r: Pick<RoomRow, 'id' | 'engine' | 'table_id'>) {
    await tx.execute(sql`UPDATE game_rooms SET closed_at = now(), updated_at = now() WHERE id = ${r.id} AND closed_at IS NULL`);
    if (r.engine === 'card') await tx.execute(sql`UPDATE card_tables SET status = 'closed' WHERE id = ${r.table_id}`);
    else await tx.execute(sql`UPDATE bj_tables SET status = 'closed' WHERE id = ${r.table_id}`);
  }

  private async publish(id: string, closed = false) {
    const [r] = await this.db.execute<RoomRow>(sql`${ROOM_SELECT} WHERE r.id = ${id}`);
    if (!r) return;
    const msg = { type: 'event', event: 'room', data: { ...summaryOf(r), ...(closed || r.closed_at ? { closed: true } : {}) } } as ServerMessage;
    this.hub.publishRoom(r.engine === 'card' ? cardRoom(r.table_id) : bjtRoom(r.table_id), msg);
  }

  // ---------------------------------------------------------------- staff (rooms.manage)

  /** Every room (open, closed or both) with what staff need; never the password hash. */
  async adminList(opts: { status: 'open' | 'closed' | 'all'; game?: RoomGame; ownerUid?: number }) {
    const rows = await this.db.execute<RoomRow & { table_status: string }>(sql`
      SELECT q.*, CASE WHEN q.engine = 'card' THEN (SELECT status FROM card_tables WHERE id = q.table_id) ELSE (SELECT status FROM bj_tables WHERE id = q.table_id) END AS table_status
      FROM (${ROOM_SELECT}) q
      WHERE TRUE
        ${opts.status === 'open' ? sql`AND q.closed_at IS NULL` : opts.status === 'closed' ? sql`AND q.closed_at IS NOT NULL` : sql``}
        ${opts.game ? sql`AND q.game = ${opts.game}` : sql``}
        ${opts.ownerUid ? sql`AND q.owner_uid = ${opts.ownerUid}` : sql``}
      ORDER BY q.closed_at IS NULL DESC, q.created_at DESC LIMIT 200`);
    return rows.map((r) => ({ ...summaryOf(r), tableStatus: r.table_status as 'open' | 'paused' | 'closed', closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null }));
  }

  private async staffRow(tx: DbOrTx, id: string) {
    const r = await this.row(tx, id, true);
    if (r.closed_at) throw fail('room_closed');
    return r;
  }

  /**
   * Closes a room for everyone. Money stays safe: the engines finish a running hand/round, then
   * cash every seat out to its wallet exactly as when players stand up themselves.
   */
  async adminClose(actorId: string, id: string, reason: string, ip?: string): Promise<{ ok: true }> {
    const r = await this.db.transaction(async (tx) => {
      const r = await this.staffRow(tx, id);
      await tx.execute(sql`UPDATE game_rooms SET closed_at = now(), updated_at = now() WHERE id = ${id}`);
      await audit(tx, { actorId, action: 'rooms.close', targetType: 'game_room', targetId: id, details: { reason, seated: r.seated, playing: r.playing, owner: Number(r.owner_uid) }, ip });
      return r;
    });
    if (r.engine === 'card') await this.cards.setStatus(r.table_id, 'closed');
    else await this.bjt.setStatus(r.table_id, 'closed');
    await this.publish(id, true);
    return { ok: true };
  }

  /** Pauses a room (no new hand/round starts; a running one finishes) or resumes it. */
  async adminSetPaused(actorId: string, id: string, paused: boolean, ip?: string): Promise<{ ok: true }> {
    const r = await this.db.transaction(async (tx) => {
      const r = await this.staffRow(tx, id);
      await audit(tx, { actorId, action: paused ? 'rooms.pause' : 'rooms.resume', targetType: 'game_room', targetId: id, ip });
      return r;
    });
    const status = paused ? 'paused' : 'open';
    if (r.engine === 'card') await this.cards.setStatus(r.table_id, status);
    else await this.bjt.setStatus(r.table_id, status);
    await this.publish(id);
    return { ok: true };
  }

  /** Gives the room to another player who may be in it (seated or with access) and hosts no other open room. */
  async adminTransfer(actorId: string, id: string, uid: number, ip?: string): Promise<{ ok: true }> {
    await this.db.transaction(async (tx) => {
      const r = await this.staffRow(tx, id);
      const other = await visiblePlayer(tx, uid);
      if (other.status !== 'active') throw fail('not_found');
      if (other.user_id === r.owner_id) throw fail('bad_request', 'already the host');
      await tx.execute(sql`SELECT id FROM users WHERE id = ${other.user_id}::uuid FOR UPDATE`);
      const hosts = await tx.execute(sql`SELECT 1 FROM game_rooms WHERE owner_id = ${other.user_id}::uuid AND closed_at IS NULL`);
      if (hosts.length) throw fail('room_limit');
      const seatTable = r.engine === 'card' ? sql`card_seats` : sql`bj_seats`;
      const inRoom = await tx.execute(sql`
        SELECT 1 WHERE EXISTS (SELECT 1 FROM ${seatTable} s WHERE s.table_id = ${r.table_id} AND s.user_id = ${other.user_id}::uuid)
          OR EXISTS (SELECT 1 FROM room_access a WHERE a.room_id = ${id} AND a.user_id = ${other.user_id}::uuid AND (a.kicked_until IS NULL OR a.kicked_until <= now()))`);
      if (!inRoom.length) throw fail('bad_request', 'not in this room');
      await tx.execute(sql`UPDATE game_rooms SET owner_id = ${other.user_id}::uuid, owner_seen_at = now(), updated_at = now() WHERE id = ${id}`);
      await audit(tx, { actorId, action: 'rooms.transfer', targetType: 'game_room', targetId: id, details: { from: Number(r.owner_uid), to: uid }, ip });
    });
    await this.publish(id);
    return { ok: true };
  }

  // ---------------------------------------------------------------- housekeeping

  /**
   * One pass over open rooms: a seated host is "present"; a host away for a while while others
   * play hands the room to the longest-seated player (who hosts no other room); a room empty for
   * long enough closes.
   */
  async sweep(now = new Date()): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const rooms = await this.db.execute<RoomRow & { owner_seen_at: string; last_active_at: string; owner_seated: boolean }>(sql`
        SELECT q.*, g.owner_seen_at, g.last_active_at,
          CASE WHEN q.engine = 'card' THEN EXISTS (SELECT 1 FROM card_seats s WHERE s.table_id = q.table_id AND s.user_id = q.owner_id)
               ELSE EXISTS (SELECT 1 FROM bj_seats s WHERE s.table_id = q.table_id AND s.user_id = q.owner_id) END AS owner_seated
        FROM (${ROOM_SELECT} WHERE r.closed_at IS NULL) q JOIN game_rooms g ON g.id = q.id`);
      for (const r of rooms) {
        const changed = await this.db.transaction(async (tx) => {
          await tx.execute(sql`SELECT id FROM game_rooms WHERE id = ${r.id} FOR UPDATE`);
          if (r.owner_seated) {
            await tx.execute(sql`UPDATE game_rooms SET owner_seen_at = ${now.toISOString()}::timestamptz, last_active_at = ${now.toISOString()}::timestamptz WHERE id = ${r.id}`);
            return false;
          }
          if (r.seated > 0 || r.playing) {
            await tx.execute(sql`UPDATE game_rooms SET last_active_at = ${now.toISOString()}::timestamptz WHERE id = ${r.id}`);
            if (r.seated > 0 && now.getTime() - new Date(r.owner_seen_at).getTime() > ROOM_RULES.ownerAwaySeconds * 1000) {
              const seatTable = r.engine === 'card' ? sql`card_seats` : sql`bj_seats`;
              const [heir] = await tx.execute<{ user_id: string }>(sql`
                SELECT s.user_id FROM ${seatTable} s JOIN users u ON u.id = s.user_id
                WHERE s.table_id = ${r.table_id} AND u.account_type = 'player' AND u.status = 'active'
                  AND NOT EXISTS (SELECT 1 FROM game_rooms g WHERE g.owner_id = s.user_id AND g.closed_at IS NULL)
                ORDER BY s.joined_at, s.seat LIMIT 1`);
              if (heir) {
                await tx.execute(sql`UPDATE game_rooms SET owner_id = ${heir.user_id}::uuid, owner_seen_at = ${now.toISOString()}::timestamptz, updated_at = now() WHERE id = ${r.id}`);
                return true;
              }
            }
            return false;
          }
          if (now.getTime() - new Date(r.last_active_at).getTime() > ROOM_RULES.idleCloseMinutes * 60_000) {
            await this.closeRoom(tx, r);
            return true;
          }
          return false;
        });
        if (changed) await this.publish(r.id);
      }
    } finally {
      this.sweeping = false;
    }
  }
}
