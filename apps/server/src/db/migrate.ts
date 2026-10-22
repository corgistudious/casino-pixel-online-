import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Db } from './client';

/** Locate the drizzle/ folder both from source (src/db) and from the bundle (dist). */
function migrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [resolve(here, '../../drizzle'), resolve(here, '../drizzle'), resolve(process.cwd(), 'drizzle')]) {
    if (existsSync(resolve(candidate, 'meta/_journal.json'))) return candidate;
  }
  throw new Error('drizzle migrations folder not found');
}

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
