import { randomUUID } from 'node:crypto';
import type { ServerMessage } from '@casino/shared';
import postgres from 'postgres';
import WebSocket from 'ws';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://casino:casino@localhost:5432/casino_test';

export async function resetDatabase() {
  const sql = postgres(TEST_DB, { onnotice: () => {} });
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql.end();
}

export async function startTestApp(env: Record<string, string> = {}) {
  await resetDatabase();
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    ADMIN_USERNAMES: 'boss',
    REDIS_URL: process.env.TEST_REDIS_URL ?? '',
    WS_RATE_PER_SEC: '1000',
    WS_BURST: '1000',
    ...env,
  });
  const built = await buildApp(config, { logger: false });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const address = built.app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { ...built, port };
}

export type TestApp = Awaited<ReturnType<typeof startTestApp>>;

export async function register(t: TestApp, username = `u_${randomUUID().slice(0, 8)}`) {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, password: 'password123' },
    remoteAddress: `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
  });
  if (res.statusCode !== 200) throw new Error(`register failed: ${res.body}`);
  return res.json() as { token: string; user: { id: string; balance: number; username: string } };
}

/** Minimal request/response WebSocket client used by the tests. */
export class TestSocket {
  readonly events: ServerMessage[] = [];
  private pending = new Map<string, (msg: ServerMessage) => void>();

  private constructor(private ws: WebSocket) {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (msg.type === 'res') {
        this.pending.get(msg.id)?.(msg);
        this.pending.delete(msg.id);
      } else this.events.push(msg);
    });
  }

  static async connect(port: number, token?: string) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    const s = new TestSocket(ws);
    if (token) {
      const res = await s.request({ type: 'auth', token });
      if (!res.ok) throw new Error('auth failed');
    }
    return s;
  }

  request(msg: Record<string, unknown> & { type: string }, id: string = randomUUID()): Promise<ServerMessage & { type: 'res' }> {
    return new Promise((resolve) => {
      this.pending.set(id, resolve as (m: ServerMessage) => void);
      this.ws.send(JSON.stringify({ id, ...msg }));
    });
  }

  async ok<T = any>(msg: Record<string, unknown> & { type: string }, id?: string): Promise<T> {
    const res = await this.request(msg, id);
    if (!res.ok) throw new Error(`request ${msg.type} failed: ${JSON.stringify(res.error)}`);
    return res.data as T;
  }

  close() {
    this.ws.close();
  }

  waitClose(): Promise<number> {
    return new Promise((resolve) => this.ws.once('close', (code) => resolve(code)));
  }
}
