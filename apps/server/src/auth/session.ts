import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from '../db/client';
import { fail } from '../errors';
import { activeBan, BannedError } from '../services/accounts';
import { findUser, type UserRow } from '../services/users';

export interface TokenPayload {
  sub: string;
  tv: number;
  /** Set on short-lived step-up tokens; such tokens are never accepted as a session. */
  purpose?: 'reauth';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    account?: UserRow;
  }
}

export const TOKEN_TTL = '30d';
/** How long a password re-confirmation unlocks sensitive admin actions. */
export const REAUTH_TTL_SECONDS = 10 * 60;
export const REAUTH_HEADER = 'x-keyo-reauth';

export function signToken(app: FastifyInstance, user: UserRow): string {
  return app.jwt.sign({ sub: user.id, tv: user.tokenVersion }, { expiresIn: TOKEN_TTL });
}

/** Verifies a raw token and loads the account (rejects banned users and revoked tokens). */
export async function accountFromToken(app: FastifyInstance, db: Db, token: string): Promise<UserRow> {
  let payload: TokenPayload;
  try {
    payload = app.jwt.verify<TokenPayload>(token);
  } catch {
    throw fail('unauthorized');
  }
  if (payload.purpose) throw fail('unauthorized');
  const user = await findUser(db, payload.sub);
  if (!user || user.tokenVersion !== payload.tv || user.status === 'deleted' || user.accountType !== 'player') throw fail('unauthorized');
  const ban = await activeBan(db, user.id);
  if (ban) throw new BannedError(ban.endsAt, ban.reason);
  return user;
}

/** Step-up token proving the account holder re-entered the password moments ago. */
export function signReauthToken(app: FastifyInstance, user: UserRow): { token: string; expiresAt: string } {
  const token = app.jwt.sign({ sub: user.id, tv: user.tokenVersion, purpose: 'reauth' }, { expiresIn: REAUTH_TTL_SECONDS });
  return { token, expiresAt: new Date(Date.now() + REAUTH_TTL_SECONDS * 1000).toISOString() };
}

/** Throws reauth_required unless the request carries a valid step-up token for this very session's account. */
export function requireReauth(app: FastifyInstance, req: FastifyRequest): void {
  const user = requireAccount(req);
  const raw = req.headers[REAUTH_HEADER];
  if (typeof raw !== 'string' || !raw) throw fail('reauth_required');
  let payload: TokenPayload;
  try {
    payload = app.jwt.verify<TokenPayload>(raw);
  } catch {
    throw fail('reauth_required');
  }
  if (payload.purpose !== 'reauth' || payload.sub !== user.id || payload.tv !== user.tokenVersion) throw fail('reauth_required');
}

export function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
}

export function requireAccount(req: FastifyRequest): UserRow {
  if (!req.account) throw fail('unauthorized');
  return req.account;
}

/** Gameplay, rewards and trading need a fully activated (email-verified) account. */
export function requireActive(user: UserRow): UserRow {
  if (user.status !== 'active') throw fail('email_not_verified');
  return user;
}
