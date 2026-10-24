import type { ClientMessage, ErrorCode, ResponseMap, ServerEvent, ServerMessage } from '@casino/shared';
import { wsUrl } from '../config';
import { ApiError } from './api';

type Payload<K extends ClientMessage['type']> = Omit<Extract<ClientMessage, { type: K }>, 'type' | 'id'>;
export type SocketStatus = 'idle' | 'connecting' | 'online' | 'offline';

interface Pending {
  resolve: (data: unknown) => void;
  reject: (err: ApiError) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 15_000;

function uuid(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Authenticated WebSocket with request/response correlation and automatic reconnect.
 * Every request id is a fresh UUID that the server also uses as idempotency key.
 */
export class GameSocket {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private token: string | null = null;
  private retry = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private ready: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;

  onEvent: (ev: ServerEvent) => void = () => {};
  private listeners = new Set<(ev: ServerEvent) => void>();
  onStatus: (status: SocketStatus) => void = () => {};
  onAuthFailed: (code: ErrorCode) => void = () => {};

  start(token: string) {
    this.stop();
    this.token = token;
    this.connect();
  }

  /** Extra event subscribers (e.g. a table screen); returns the unsubscribe function. */
  listen(fn: (ev: ServerEvent) => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  stop() {
    this.token = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.failAll('network');
    this.onStatus('idle');
  }

  async request<K extends keyof ResponseMap & ClientMessage['type']>(type: K, payload: Payload<K>): Promise<ResponseMap[K]> {
    if (!this.ready) throw new ApiError('network');
    await Promise.race([
      this.ready,
      new Promise((_, reject) => setTimeout(() => reject(new ApiError('network')), REQUEST_TIMEOUT_MS)),
    ]);
    return this.send(type, payload) as Promise<ResponseMap[K]>;
  }

  private send(type: string, payload: object): Promise<unknown> {
    const id = uuid();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ApiError('network'));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.ws?.send(JSON.stringify({ type, id, ...payload }));
    });
  }

  private connect() {
    if (!this.token) return;
    this.onStatus('connecting');
    this.ready = new Promise((r) => (this.resolveReady = r));
    const ws = new WebSocket(wsUrl());
    this.ws = ws;

    ws.onopen = () => {
      const id = uuid();
      const timer = setTimeout(() => ws.close(), REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        timer,
        resolve: () => {
          this.retry = 0;
          this.onStatus('online');
          this.resolveReady?.();
        },
        reject: (err) => {
          this.onAuthFailed(err.code as ErrorCode);
          this.stop();
        },
      });
      ws.send(JSON.stringify({ type: 'auth', id, token: this.token }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as ServerMessage;
      if (msg.type === 'event') {
        const { type: _t, ...ev } = msg;
        this.onEvent(ev as ServerEvent);
        for (const fn of this.listeners) fn(ev as ServerEvent);
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.data);
      else p.reject(new ApiError(msg.error.code));
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.failAll('network');
      if (!this.token) return;
      this.onStatus('offline');
      const delay = Math.min(15_000, 500 * 2 ** this.retry++);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  private failAll(code: 'network') {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new ApiError(code));
    }
    this.pending.clear();
  }
}

export const socket = new GameSocket();
