import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().optional(),
  /** Namespace for every Redis key and channel, so Keyo Game can share a Redis server with other apps. */
  REDIS_PREFIX: z.string().regex(/^[a-z0-9_-]+:$/, 'REDIS_PREFIX must look like "keyo:"').default('keyo:'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** Comma-separated usernames promoted to admin on login. */
  /** Deprecated and ignored (kept so existing .env files still load); see SECURITY_AUDIT.md. */
  ADMIN_USERNAMES: z.string().default(''),
  /** Requests per minute per client IP across the HTTP API. */
  HTTP_RATE_PER_MIN: z.coerce.number().int().positive().default(300),
  LOG_LEVEL: z.string().default('info'),
  /** Must match environment_state.mode in the database (checked at startup). */
  KEYO_DATA_MODE: z.enum(['test', 'production']).default('test'),
  /** 'off' stops this instance from driving shared-round tables (tests drive them by hand). */
  TABLE_SCHEDULER: z.enum(['on', 'off']).default('on'),
  /** Public URL of the web client, used in email links. */
  APP_URL: z.string().url().default('http://localhost:5173'),
  /** e.g. smtps://user:pass@smtp.example.com:465 — without it mail stays queued in email_outbox. */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Keyo Game <no-reply@keyo.game>'),
  /** WebSocket token bucket: sustained messages per second and burst size. */
  WS_RATE_PER_SEC: z.coerce.number().positive().default(8),
  WS_BURST: z.coerce.number().positive().default(16),
});

export type Config = z.infer<typeof envSchema> & {
  corsOrigins: string[];
  adminUsernames: Set<string>;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env);
  return {
    ...parsed,
    REDIS_URL: parsed.REDIS_URL || undefined,
    SMTP_URL: parsed.SMTP_URL || undefined,
    corsOrigins: parsed.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    adminUsernames: new Set(parsed.ADMIN_USERNAMES.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)),
  };
}
