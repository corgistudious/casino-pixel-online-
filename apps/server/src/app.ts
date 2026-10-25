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
import { RoundTableEngine } from './services/roundTables';
import { CardTableEngine } from './services/cardTables';
import { registerCardRoutes } from './routes/cards';
import { registerTableRoutes } from './routes/tables';
import { registerProgressionRoutes } from './routes/progression';
import { registerGiftcodeRoutes } from './routes/giftcodes';
import { registerBankRoutes } from './routes/bank';
import { registerSupportRoutes } from './routes/support';
import { registerMarketRoutes } from './routes/market';
import { registerVipRoutes } from './routes/vip';
import { registerChatRoutes } from './routes/chat';
import { sweepExpiredEquipment } from './services/catalog';
import { tickSeasons } from './services/rank';
import { startMailWorker } from './mail/mailer';
import { BannedError, bootstrapSystemAccounts } from './services/accounts';
import { assertDataMode } from './services/environment';
import { bootstrapOwner, bootstrapRoles } from './services/rbac';
import { registerAdminRoutes } from './routes/admin';
import { registerAdminPanelRoutes } from './routes/adminPanel';
import { registerAdminContentRoutes } from './routes/adminContent';
import { registerCosmeticsRoutes } from './routes/cosmetics';
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
  await assertDataMode(db, config.KEYO_DATA_MODE).catch(async (err) => {
    await client.end();
    throw err;
  });
  await bootstrapRoles(db);
  await bootstrapSystemAccounts(db);
  await bootstrapOwner(db);
  const hub = new RealtimeHub(app.log, config.REDIS_URL, config.REDIS_PREFIX);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    // PUT (image uploads) and DELETE (mail, roles) are needed by the Android/Windows apps, which call the API cross-origin.
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  // Every HTTP route is limited per client IP; auth routes add a stricter limit of their own.
  await app.register(rateLimit, { global: true, max: config.HTTP_RATE_PER_MIN, timeWindow: '1 minute' });
  if (config.adminUsernames.size > 0) {
    app.log.warn('ADMIN_USERNAMES is ignored: roles are no longer granted by username at login (privilege escalation risk). The Owner is UID 1002; staff roles are granted in the admin panel.');
  }
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
  registerAdminPanelRoutes(app, db, hub, config);
  registerAdminContentRoutes(app, db, hub);
  registerCosmeticsRoutes(app, db, hub);
  const tables = new RoundTableEngine(db, client, hub, app.log);
  registerTableRoutes(app, db, tables);
  const cards = new CardTableEngine(db, client, hub, app.log);
  registerCardRoutes(app, db, cards);
  registerProgressionRoutes(app, db, hub);
  registerGiftcodeRoutes(app, db, hub);
  registerBankRoutes(app, db, hub);
  registerSupportRoutes(app, db);
  registerMarketRoutes(app, db);
  registerVipRoutes(app, db);
  registerChatRoutes(app, db, hub);
  let seasonTimer: NodeJS.Timeout | undefined;
  if (config.TABLE_SCHEDULER === 'on') {
    await tables.start();
    await cards.start();
    // Ranked seasons start and end on their dates (guarded updates: safe on every instance).
    const tickRank = () => {
      void tickSeasons(db).then(
        (r) => (r.ended.length || r.started.length) && app.log.info(r, 'rank seasons changed'),
        (err) => app.log.error({ err }, 'season tick failed'),
      );
      // Timed cosmetics (e.g. the 60-day Vương Giả set) are unequipped everywhere once expired.
      void sweepExpiredEquipment(db).then(
        (ids) => ids.forEach((id) => hub.sendToUser(id, { type: 'event', event: 'profile', data: { reason: 'equipment' } })),
        (err) => app.log.error({ err }, 'expiry sweep failed'),
      );
    };
    tickRank();
    seasonTimer = setInterval(tickRank, 60_000);
    seasonTimer.unref();
  }
  registerGateway(app, db, hub, tables, cards, { rate: config.WS_RATE_PER_SEC, burst: config.WS_BURST });

  const stopMail = startMailWorker(db, app.log, config.SMTP_URL, config.MAIL_FROM);
  app.addHook('onClose', async () => {
    stopMail();
    clearInterval(seasonTimer);
    await tables.stop();
    await cards.stop();
    await hub.close();
    await client.end({ timeout: 5 });
  });

  return { app, db, hub, tables, cards };
}
