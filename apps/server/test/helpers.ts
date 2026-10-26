import { randomUUID } from 'node:crypto';
import type { ServerMessage } from '@casino/shared';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import WebSocket from 'ws';
import { KEYO_OWNER_UID } from '@casino/shared';
import { buildApp } from '../src/app';
import { hashPassword } from '../src/auth/password';
import { users, wallets } from '../src/db/schema';
import { bootstrapOwner, grantRole } from '../src/services/rbac';
import { loadConfig } from '../src/config';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://casino:casino@localhost:5432/casino_test';

export async function resetDatabase() {
  const url = new URL(TEST_DB);
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== '25432' ||
    url.pathname !== '/keyo_auth_test' ||
    url.username !== 'keyo_test'
  ) {
    throw new Error('SAFETY: Refusing to reset non-isolated test database');
  }

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
    REDIS_URL: process.env.TEST_REDIS_URL ?? '',
    WS_RATE_PER_SEC: '1000',
    WS_BURST: '1000',
    TABLE_SCHEDULER: 'off',
    HTTP_RATE_PER_MIN: '100000',
    ...env,
  });
  const built = await buildApp(config, { logger: process.env.TEST_LOG ? { level: 'error' } : false });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const address = built.app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { ...built, port };
}

export type TestApp = Awaited<ReturnType<typeof startTestApp>>;

export const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

export const TEST_PASSWORD = 'password123';

/** Registers without verifying the email (account stays pending_verification). */
export async function registerPending(t: TestApp, username = `u_${randomUUID().slice(0, 8)}`, email = `${username}@example.test`) {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, displayName: username, email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD, acceptTerms: true },
    remoteAddress: randomIp(),
  });
  if (res.statusCode !== 200) throw new Error(`register failed: ${res.body}`);
  return res.json() as { token: string; user: { id: string; uid: number; balance: number; username: string; email: string; status: string } };
}

/** Latest queued email to an address. */
export async function lastMail(t: TestApp, to: string) {
  const rows = await t.db.execute<{ subject: string; body_text: string; template: string }>(
    sql`SELECT subject, body_text, template FROM email_outbox WHERE to_address = ${to} ORDER BY id DESC LIMIT 1`,
  );
  return rows[0];
}

export function codeIn(text: string): string {
  const m = text.match(/: (\d{6})\b/);
  if (!m) throw new Error(`no code in: ${text}`);
  return m[1]!;
}

export function tokenIn(text: string): string {
  const m = text.match(/token=([A-Za-z0-9_\-%]+)/);
  if (!m) throw new Error(`no token in: ${text}`);
  return decodeURIComponent(m[1]!);
}

/** Registers and verifies the email, giving a fully active account with the starter reward. */
export async function register(t: TestApp, username = `u_${randomUUID().slice(0, 8)}`) {
  const reg = await registerPending(t, username);
  const mail = await lastMail(t, reg.user.email);
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/auth/verify-email',
    headers: { authorization: `Bearer ${reg.token}` },
    payload: { code: codeIn(mail!.body_text) },
    remoteAddress: randomIp(),
  });
  if (res.statusCode !== 200) throw new Error(`verify failed: ${res.body}`);
  return { token: reg.token, user: res.json().user as { id: string; uid: number; balance: number; username: string; email: string; status: string } };
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

/** Headers for a session plus a fresh password re-confirmation (needed by sensitive admin routes). */
export async function reauthHeaders(t: TestApp, token: string, password = TEST_PASSWORD) {
  const res = await t.app.inject({ method: 'POST', url: '/api/auth/reauth', headers: { authorization: `Bearer ${token}` }, payload: { password }, remoteAddress: randomIp() });
  if (res.statusCode !== 200) throw new Error(`reauth failed: ${res.body}`);
  return { authorization: `Bearer ${token}`, 'x-keyo-reauth': res.json().token as string };
}

/** The Owner account (UID 1002), created the way an operator would: directly, then bootstrapped. */
export async function createOwner(t: TestApp) {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const now = new Date();
  const [u] = await t.db
    .insert(users)
    .values({
      uid: KEYO_OWNER_UID,
      username: 'keyo_gm',
      usernameLower: 'keyo_gm',
      passwordHash,
      displayName: 'Keyo GM',
      email: 'gm@example.test',
      emailLower: 'gm@example.test',
      emailVerifiedAt: now,
      status: 'active',
      starterGrantedAt: now,
    })
    .returning();
  await t.db.insert(wallets).values({ userId: u!.id, balance: 0 });
  await bootstrapOwner(t.db);
  const login = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'keyo_gm', password: TEST_PASSWORD }, remoteAddress: randomIp() });
  if (login.statusCode !== 200) throw new Error(`owner login failed: ${login.body}`);
  const token = login.json().token as string;
  return { token, user: u!, headers: await reauthHeaders(t, token) };
}

/** A verified account holding a staff role (assigned directly, as a bootstrap would). */
export async function createStaff(t: TestApp, role: string, username?: string) {
  const r = await register(t, username);
  await grantRole(t.db, r.user.id, role, null);
  return { ...r, headers: await reauthHeaders(t, r.token) };
}
