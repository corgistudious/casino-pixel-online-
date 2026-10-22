import { randomUUID } from 'node:crypto';
import type { BigWinEvent, ServerMessage } from '@casino/shared';
import { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';

export interface Connection {
  userId: string;
  send(msg: ServerMessage): void;
}

type Envelope = { origin: string } & ({ kind: 'all'; msg: ServerMessage } | { kind: 'user'; userId: string; msg: ServerMessage });

const CHANNEL = 'casino:events';
const BIG_WINS_KEY = 'casino:bigwins';
const PRESENCE_PREFIX = 'casino:presence:';
const MAX_BIG_WINS = 20;

/**
 * Tracks live sockets and fans out events. With Redis configured, events and
 * presence are shared across server instances; otherwise everything is local.
 */
export class RealtimeHub {
  private readonly instanceId = randomUUID();
  private readonly byUser = new Map<string, Set<Connection>>();
  private bigWins: BigWinEvent[] = [];
  private pub?: Redis;
  private sub?: Redis;
  private remoteOnline = 0;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly log: FastifyBaseLogger,
    redisUrl?: string,
  ) {
    if (redisUrl) {
      this.pub = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });
      this.sub = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });
      this.pub.on('error', (err) => this.log.warn({ err }, 'redis pub error'));
      this.sub.on('error', (err) => this.log.warn({ err }, 'redis sub error'));
      void this.sub.subscribe(CHANNEL);
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
    if (isNewUser) this.broadcastPresence();
  }

  remove(conn: Connection): void {
    const set = this.byUser.get(conn.userId);
    if (!set) return;
    set.delete(conn);
    if (set.size === 0) {
      this.byUser.delete(conn.userId);
      this.broadcastPresence();
    }
  }

  sendToUser(userId: string, msg: ServerMessage): void {
    this.deliverToUser(userId, msg);
    this.publish({ origin: this.instanceId, kind: 'user', userId, msg });
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
        .lpush(BIG_WINS_KEY, JSON.stringify(win))
        .ltrim(BIG_WINS_KEY, 0, MAX_BIG_WINS - 1)
        .exec()
        .catch((err) => this.log.warn({ err }, 'redis bigwin store failed'));
    }
    this.broadcast({ type: 'event', event: 'bigwin', data: win });
  }

  async recentBigWins(): Promise<BigWinEvent[]> {
    if (this.pub) {
      try {
        const raw = await this.pub.lrange(BIG_WINS_KEY, 0, MAX_BIG_WINS - 1);
        return raw.map((r) => JSON.parse(r) as BigWinEvent);
      } catch (err) {
        this.log.warn({ err }, 'redis bigwin read failed');
      }
    }
    return this.bigWins;
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    await this.pub?.del(PRESENCE_PREFIX + this.instanceId).catch(() => {});
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
    this.pub?.publish(CHANNEL, JSON.stringify(env)).catch((err) => this.log.warn({ err }, 'redis publish failed'));
  }

  private onRemote(raw: string): void {
    try {
      const env = JSON.parse(raw) as Envelope;
      if (env.origin === this.instanceId) return;
      if (env.kind === 'all') this.deliverAll(env.msg);
      else this.deliverToUser(env.userId, env.msg);
    } catch (err) {
      this.log.warn({ err }, 'bad realtime envelope');
    }
  }

  /** Publishes this instance's user count and sums the others' (keys expire if an instance dies). */
  private async heartbeat(): Promise<void> {
    if (!this.pub) return;
    try {
      await this.pub.set(PRESENCE_PREFIX + this.instanceId, String(this.localOnline), 'EX', 30);
      const keys = (await this.pub.keys(PRESENCE_PREFIX + '*')).filter((k) => k !== PRESENCE_PREFIX + this.instanceId);
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
