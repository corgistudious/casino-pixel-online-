import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import type { Config } from './config';
import { createDb } from './db/client';
import { runMigrations } from './db/migrate';
import { AppError } from './errors';
import { registerGateway } from './realtime/gateway';
import { RealtimeHub } from './realtime/hub';
import { startMailWorker } from './mail/mailer';
import { BannedError, bootstrapSystemAccounts } from './services/accounts';
import { bootstrapRoles } from './services/rbac';
import { registerAdminRoutes } from './routes/admin';
import { registerApiRoutes } from './routes/api';
import { registerAuthRoutes } from './routes/auth';

export async function buildApp(config: Config, opts: { logger?: FastifyServerOptions['logger']; migrate?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger ?? { level: config.LOG_LEVEL },
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });

  const { db, client } = createDb(config.DATABASE_URL);
  if (opts.migrate ?? true) await runMigrations(db);
  await bootstrapRoles(db);
  await bootstrapSystemAccounts(db);
  const hub = new RealtimeHub(app.log, config.REDIS_URL);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  });
  await app.register(rateLimit, { global: false });
  await app.register(jwt, { secret: config.JWT_SECRET });
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof BannedError) {
      return reply.status(403).send({ error: { code: 'banned', endsAt: err.endsAt?.toISOString() ?? null, reason: err.reason } });
    }
    if (err instanceof AppError) return reply.status(err.status).send({ error: { code: err.code } });
    if (err instanceof ZodError) return reply.status(400).send({ error: { code: 'bad_request', issues: err.issues } });
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) return reply.status(429).send({ error: { code: 'rate_limited' } });
    if (status && status >= 400 && status < 500) return reply.status(status).send({ error: { code: 'bad_request' } });
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'internal' } });
  });

  registerAuthRoutes(app, db, hub, config);
  registerApiRoutes(app, db, hub, config);
  registerAdminRoutes(app, db, hub, config);
  registerGateway(app, db, hub, { rate: config.WS_RATE_PER_SEC, burst: config.WS_BURST });

  const stopMail = startMailWorker(db, app.log, config.SMTP_URL, config.MAIL_FROM);
  app.addHook('onClose', async () => {
    stopMail();
    await hub.close();
    await client.end({ timeout: 5 });
  });

  return { app, db, hub };
}
