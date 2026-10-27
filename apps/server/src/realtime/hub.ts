import { randomUUID } from 'node:crypto';
import type { BigWinEvent, ServerMessage } from '@casino/shared';
import { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';

export interface Connection {
  userId: string;
  send(msg: ServerMessage): void;
  close(reason: string): void;
}

type Envelope = { origin: string } & (
  | { kind: 'all'; msg: ServerMessage }
  | { kind: 'user'; userId: string; msg: ServerMessage }
  | { kind: 'kick'; userId: string }
  | { kind: 'room'; room: string; msg: ServerMessage }
);

const MAX_BIG_WINS = 20;

/** Redis keys and channels used by the hub, all under one namespace so the instance can share a Redis server safely. */
/** Per-account online flag lifetime; refreshed by every instance's 10 s heartbeat. */
const USER_ONLINE_TTL_S = 30;

export function redisKeys(prefix: string) {
  return { channel: `${prefix}events`, bigWins: `${prefix}bigwins`, presence: `${prefix}presence:`, userOnline: `${prefix}online:` };
}

/**
 * Tracks live sockets and fans out events. With Redis configured, events and
 * presence are shared across server instances; otherwise everything is local.
 */
export class RealtimeHub {
  private readonly instanceId = randomUUID();
  private readonly byUser = new Map<string, Set<Connection>>();
  /** Room (e.g. a game table) → sockets watching it on this instance. */
  private readonly rooms = new Map<string, Set<Connection>>();
  private readonly roomKeys = new Set<string>();
  private bigWins: BigWinEvent[] = [];
  private pub?: Redis;
  private sub?: Redis;
  private remoteOnline = 0;
  private timer?: NodeJS.Timeout;
  private readonly keys: ReturnType<typeof redisKeys>;

  constructor(
    private readonly log: FastifyBaseLogger,
    redisUrl?: string,
    redisPrefix = 'keyo:',
  ) {
    this.keys = redisKeys(redisPrefix);
    if (redisUrl) {
      this.pub = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });
      this.sub = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });
      this.pub.on('error', (err) => this.log.warn({ err }, 'redis pub error'));
      this.sub.on('error', (err) => this.log.warn({ err }, 'redis sub error'));
      // Subscribe on every (re)connect: if Redis is down at boot the first attempt fails, and that must neither
      // crash the process (unhandled rejection) nor leave this instance deaf once Redis comes back.
      const subscribe = () => void this.sub!.subscribe(this.keys.channel).catch((err) => this.log.warn({ err }, 'redis subscribe failed'));
      this.sub.on('ready', subscribe);
      this.sub.on('message', (_ch, raw) => this.onRemote(raw));
    }
    this.timer = setInterval(() => void this.heartbeat(), 10_000);
    this.timer.unref();
  }

  get localOnline(): number {
    return this.byUser.size;
  }

  get online(): number {
    return this.localOnline + this.remoteOnline;
  }

  add(conn: Connection): void {
    let set = this.byUser.get(conn.userId);
    const isNewUser = !set;
    if (!set) this.byUser.set(conn.userId, (set = new Set()));
    set.add(conn);
    conn.send({ type: 'event', event: 'presence', data: { online: this.online } });
    if (isNewUser) {
      this.broadcastPresence();
      this.pub?.set(this.keys.userOnline + conn.userId, '1', 'EX', USER_ONLINE_TTL_S).catch(() => {});
    }
  }

  remove(conn: Connection): void {
    for (const [room, members] of this.rooms) {
      if (!members.delete(conn)) continue;
      if (members.size === 0) this.rooms.delete(room);
      void this.syncRoom(room);
    }
    const set = this.byUser.get(conn.userId);
    if (!set) return;
    set.delete(conn);
    if (set.size === 0) {
      this.byUser.delete(conn.userId);
      this.broadcastPresence();
      // Another instance may still hold a socket for this user; its heartbeat re-sets the key.
      this.pub?.del(this.keys.userOnline + conn.userId).catch(() => {});
    }
  }

  /** Which of these accounts have a live connection (this instance, or any instance via Redis). */
  async onlineAmong(userIds: readonly string[]): Promise<Set<string>> {
    const online = new Set(userIds.filter((id) => this.byUser.has(id)));
    const rest = userIds.filter((id) => !online.has(id));
    if (this.pub && rest.length) {
      try {
        const values = await this.pub.mget(rest.map((id) => this.keys.userOnline + id));
        rest.forEach((id, i) => values[i] && online.add(id));
      } catch (err) {
        this.log.warn({ err }, 'redis presence lookup failed');
      }
    }
    return online;
  }

  sendToUser(userId: string, msg: ServerMessage): void {
    this.deliverToUser(userId, msg);
    this.publish({ origin: this.instanceId, kind: 'user', userId, msg });
  }

  /** Closes every live socket of a user (ban, password change, logout everywhere). */
  kick(userId: string): void {
    this.kickLocal(userId);
    this.publish({ origin: this.instanceId, kind: 'kick', userId });
  }

  private kickLocal(userId: string): void {
    for (const conn of [...(this.byUser.get(userId) ?? [])]) conn.close('revoked');
  }

  join(room: string, conn: Connection): void {
    let members = this.rooms.get(room);
    if (!members) this.rooms.set(room, (members = new Set()));
    members.add(conn);
    void this.syncRoom(room);
  }

  leave(room: string, conn: Connection): void {
    const members = this.rooms.get(room);
    members?.delete(conn);
    if (members?.size === 0) this.rooms.delete(room);
    void this.syncRoom(room);
  }

  /** Sockets watching a room on this instance. */
  roomSize(room: string): number {
    return this.rooms.get(room)?.size ?? 0;
  }

  /** Distinct authenticated accounts currently watching a room across instances. */
  async roomUserIds(room: string): Promise<string[]> {
    const ids = new Set([...this.rooms.get(room) ?? []].map((conn) => conn.userId));
    if (this.pub) {
      try {
        const keys = await this.pub.keys(`${this.keys.channel}:room:${room}:*`);
        if (keys.length) {
          const values = await this.pub.mget(keys);
          for (const value of values) if (value) for (const id of JSON.parse(value) as string[]) ids.add(id);
        }
      } catch (err) {
        this.log.warn({ err, room }, 'room presence lookup failed');
      }
    }
    return [...ids];
  }

  private async syncRoom(room: string): Promise<void> {
    if (!this.pub) return;
    const key = `${this.keys.channel}:room:${room}:${this.instanceId}`;
    const ids = [...new Set([...this.rooms.get(room) ?? []].map((conn) => conn.userId))];
    try {
      if (ids.length) {
        this.roomKeys.add(key);
        await this.pub.set(key, JSON.stringify(ids), 'EX', USER_ONLINE_TTL_S);
      } else {
        this.roomKeys.delete(key);
        await this.pub.del(key);
      }
    } catch (err) {
      this.log.warn({ err, room }, 'room presence sync failed');
    }
  }

  /** Sends to everyone watching a room, on every instance. */
  publishRoom(room: string, msg: ServerMessage): void {
    this.deliverRoom(room, msg);
    this.publish({ origin: this.instanceId, kind: 'room', room, msg });
  }

  private deliverRoom(room: string, msg: ServerMessage): void {
    for (const conn of this.rooms.get(room) ?? []) conn.send(msg);
  }

  broadcast(msg: ServerMessage): void {
    this.deliverAll(msg);
    this.publish({ origin: this.instanceId, kind: 'all', msg });
  }

  async recordBigWin(win: BigWinEvent): Promise<void> {
    this.bigWins = [win, ...this.bigWins].slice(0, MAX_BIG_WINS);
    if (this.pub) {
      await this.pub
        .multi()
        .lpush(this.keys.bigWins, JSON.stringify(win))
        .ltrim(this.keys.bigWins, 0, MAX_BIG_WINS - 1)
        .exec()
        .catch((err) => this.log.warn({ err }, 'redis bigwin store failed'));
    }
    this.broadcast({ type: 'event', event: 'bigwin', data: win });
  }

  async recentBigWins(): Promise<BigWinEvent[]> {
    if (this.pub) {
      try {
        const raw = await this.pub.lrange(this.keys.bigWins, 0, MAX_BIG_WINS - 1);
        return raw.map((r) => JSON.parse(r) as BigWinEvent);
      } catch (err) {
        this.log.warn({ err }, 'redis bigwin read failed');
      }
    }
    return this.bigWins;
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    await this.pub?.del(this.keys.presence + this.instanceId).catch(() => {});
    if (this.pub && this.roomKeys.size) await this.pub.del(...this.roomKeys).catch(() => {});
    this.pub?.disconnect();
    this.sub?.disconnect();
  }

  private broadcastPresence(): void {
    this.deliverAll({ type: 'event', event: 'presence', data: { online: this.online } });
  }

  private deliverToUser(userId: string, msg: ServerMessage): void {
    for (const conn of this.byUser.get(userId) ?? []) conn.send(msg);
  }

  private deliverAll(msg: ServerMessage): void {
    for (const set of this.byUser.values()) for (const conn of set) conn.send(msg);
  }

  private publish(env: Envelope): void {
    this.pub?.publish(this.keys.channel, JSON.stringify(env)).catch((err) => this.log.warn({ err }, 'redis publish failed'));
  }

  private onRemote(raw: string): void {
    try {
      const env = JSON.parse(raw) as Envelope;
      if (env.origin === this.instanceId) return;
      if (env.kind === 'all') this.deliverAll(env.msg);
      else if (env.kind === 'kick') this.kickLocal(env.userId);
      else if (env.kind === 'room') this.deliverRoom(env.room, env.msg);
      else this.deliverToUser(env.userId, env.msg);
    } catch (err) {
      this.log.warn({ err }, 'bad realtime envelope');
    }
  }

  /** Publishes this instance's user count and sums the others' (keys expire if an instance dies). */
  private async heartbeat(): Promise<void> {
    if (!this.pub) return;
    try {
      await this.pub.set(this.keys.presence + this.instanceId, String(this.localOnline), 'EX', 30);
      for (const room of this.rooms.keys()) await this.syncRoom(room);
      if (this.byUser.size) {
        const batch = this.pub.multi();
        for (const id of this.byUser.keys()) batch.set(this.keys.userOnline + id, '1', 'EX', USER_ONLINE_TTL_S);
        await batch.exec();
      }
      const keys = (await this.pub.keys(this.keys.presence + '*')).filter((k) => k !== this.keys.presence + this.instanceId);
      const values = keys.length ? await this.pub.mget(keys) : [];
      const remote = values.reduce((s, v) => s + Number(v ?? 0), 0);
      if (remote !== this.remoteOnline) {
        this.remoteOnline = remote;
        this.broadcastPresence();
      }
    } catch (err) {
      this.log.warn({ err }, 'presence heartbeat failed');
    }
  }
}
