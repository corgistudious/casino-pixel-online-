import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** Comma-separated usernames promoted to admin on login. */
  ADMIN_USERNAMES: z.string().default(''),
  LOG_LEVEL: z.string().default('info'),
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
    corsOrigins: parsed.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    adminUsernames: new Set(parsed.ADMIN_USERNAMES.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)),
  };
}
