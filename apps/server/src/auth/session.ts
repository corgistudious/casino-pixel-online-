import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from '../db/client';
import { fail } from '../errors';
import { findUser, type UserRow } from '../services/users';

export interface TokenPayload {
  sub: string;
  tv: number;
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
  const user = await findUser(db, payload.sub);
  if (!user || user.tokenVersion !== payload.tv) throw fail('unauthorized');
  if (user.banned) throw fail('banned');
  return user;
}

export function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
}

export function requireAccount(req: FastifyRequest): UserRow {
  if (!req.account) throw fail('unauthorized');
  return req.account;
}
