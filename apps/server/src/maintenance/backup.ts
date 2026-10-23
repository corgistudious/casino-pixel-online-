import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** libpq environment for pg_dump/pg_restore, so the password never appears in the process list. */
function pgEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const u = new URL(databaseUrl);
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')),
    ...(u.searchParams.get('sslmode') ? { PGSSLMODE: u.searchParams.get('sslmode')! } : {}),
  };
}

/**
 * Full logical backup (pg_dump custom format) of the Keyo Game database only, verified by
 * reading its table of contents back with pg_restore. Throws if either tool is missing or fails.
 */
export function backupDatabase(databaseUrl: string, dir: string, label: string): { path: string; bytes: number } {
  const env = pgEnv(databaseUrl);
  const outDir = resolve(dir);
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(outDir, `keyo-${env.PGDATABASE}-${label}-${stamp}.dump`);
  const dump = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--file', path], { env, encoding: 'utf8' });
  if (dump.error) throw new Error(`pg_dump is not available (${dump.error.message}); refusing to continue without a backup`);
  if (dump.status !== 0) throw new Error(`pg_dump failed: ${dump.stderr.trim()}`);
  chmodSync(path, 0o600);
  const list = spawnSync('pg_restore', ['--list', path], { env, encoding: 'utf8' });
  if (list.error || list.status !== 0 || !/TABLE DATA public users\b/.test(list.stdout)) {
    throw new Error(`backup verification failed for ${path}: ${list.error?.message ?? list.stderr.trim()}`);
  }
  return { path, bytes: statSync(path).size };
}
