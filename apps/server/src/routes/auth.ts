import {
  captainSetupSchema,
  changePasswordSchema,
  deletionRequestSchema,
  forgotPasswordSchema,
  linkEmailSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@casino/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAccount, signReauthToken, signToken } from '../auth/session';
import { verifyPassword } from '../auth/password';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import type { RealtimeHub } from '../realtime/hub';
import {
  cancelDeletion,
  forgotPassword,
  linkEmail,
  login,
  pendingDeletion,
  registerAccount,
  requestDeletion,
  resendVerification,
  setPasswordWithToken,
  verifyEmailByCode,
  verifyEmailByToken,
  type AccountContext,
} from '../services/accounts';
import { toPublicUser } from '../services/users';
import { changeOwnPassword, completeCaptainSetup } from '../services/captain';
import { audit } from '../services/audit';
import { fail } from '../errors';
import { makeGuards } from './guards';

export function registerAuthRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub, config: Config): void {
  const { authed } = makeGuards(app, db);
  const strict = { rateLimit: { max: 10, timeWindow: '1 minute' } };
  const ctx = (req: FastifyRequest): AccountContext => ({ appUrl: config.APP_URL, ip: req.ip });

  app.post('/api/auth/register', { config: strict }, async (req) => {
    const input = registerSchema.parse(req.body);
    const user = await registerAccount(db, input, ctx(req));
    return { token: signToken(app, user), user: await toPublicUser(db, user) };
  });

  app.post('/api/auth/login', { config: strict }, async (req) => {
    const input = loginSchema.parse(req.body);
    const user = await login(db, input.login, input.password, ctx(req));
    return { token: signToken(app, user), user: await toPublicUser(db, user) };
  });

  /** Keyo Captain's first password, from the one-time link an Owner created (no session needed). */
  app.post('/api/auth/captain-setup', { config: strict }, async (req) => {
    const input = captainSetupSchema.parse(req.body);
    await completeCaptainSetup(db, input.token, input.password, req.ip);
    return { ok: true };
  });

  /** Change my own password (current one required). Other sessions are signed out; this one gets a new token. */
  app.post('/api/me/password', { preHandler: authed, config: strict }, async (req) => {
    const input = changePasswordSchema.parse(req.body);
    const user = await changeOwnPassword(db, requireAccount(req), input.currentPassword, input.password, req.ip);
    hub.kick(user.id);
    return { token: signToken(app, user), user: await toPublicUser(db, user) };
  });

  /** Link-based verification works without a session (the link may open in another browser). */
  app.post('/api/auth/verify-email', { config: strict }, async (req) => {
    const input = verifyEmailSchema.parse(req.body);
    if ('token' in input) {
      const user = await verifyEmailByToken(db, input.token, ctx(req));
      hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: { balance: (await toPublicUser(db, user)).balance } });
      return { ok: true };
    }
    await authed(req);
    const user = await verifyEmailByCode(db, requireAccount(req), input.code, ctx(req));
    const pub = await toPublicUser(db, user);
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: { balance: pub.balance } });
    return { ok: true, user: pub };
  });

  app.post('/api/auth/resend-verification', { config: strict, preHandler: authed }, async (req) => {
    await resendVerification(db, requireAccount(req), ctx(req));
    return { ok: true };
  });

  app.post('/api/auth/link-email', { config: strict, preHandler: authed }, async (req) => {
    const input = linkEmailSchema.parse(req.body);
    const user = await linkEmail(db, requireAccount(req), input.email, input.password, ctx(req));
    return { user: await toPublicUser(db, user) };
  });

  /** Identical response whether or not the email exists. */
  app.post('/api/auth/forgot-password', { config: strict }, async (req) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    await forgotPassword(db, email, ctx(req));
    return { ok: true };
  });

  app.post('/api/auth/reset-password', { config: strict }, async (req) => {
    const input = resetPasswordSchema.parse(req.body);
    const user = await setPasswordWithToken(db, 'reset_password', input, ctx(req));
    hub.kick(user.id);
    return { ok: true };
  });

  app.post('/api/auth/activate', { config: strict }, async (req) => {
    const input = resetPasswordSchema.parse(req.body);
    const user = await setPasswordWithToken(db, 'activate', input, ctx(req));
    return { token: signToken(app, user), user: await toPublicUser(db, user) };
  });

  /**
   * Step-up: re-enter the password to unlock sensitive admin actions for 10 minutes. The returned
   * token goes in the x-keyo-reauth header and is useless as a session token.
   */
  app.post('/api/auth/reauth', { config: strict, preHandler: authed }, async (req) => {
    const { password } = z.object({ password: z.string().min(1).max(128) }).parse(req.body);
    const user = requireAccount(req);
    if (!(await verifyPassword(password, user.passwordHash))) {
      await audit(db, { actorId: user.id, action: 'auth.reauth_failed', targetType: 'user', targetId: user.uid, ip: req.ip });
      throw fail('invalid_credentials');
    }
    await audit(db, { actorId: user.id, action: 'auth.reauth', targetType: 'user', targetId: user.uid, ip: req.ip });
    return signReauthToken(app, user);
  });

  /** Invalidates every token issued to this account (all devices). */
  app.post('/api/auth/logout-all', { preHandler: authed }, async (req) => {
    const user = requireAccount(req);
    await db.update(users).set({ tokenVersion: user.tokenVersion + 1 }).where(eq(users.id, user.id));
    hub.kick(user.id);
    return { ok: true };
  });

  app.get('/api/me/deletion', { preHandler: authed }, async (req) => ({ request: await pendingDeletion(db, requireAccount(req).id) }));

  app.post('/api/me/deletion', { config: strict, preHandler: authed }, async (req) => {
    const input = deletionRequestSchema.parse(req.body);
    const request = await requestDeletion(db, requireAccount(req), input.password, input.reason, ctx(req));
    return { request };
  });

  app.delete('/api/me/deletion', { preHandler: authed }, async (req) => {
    await cancelDeletion(db, requireAccount(req), ctx(req));
    return { ok: true };
  });
}
