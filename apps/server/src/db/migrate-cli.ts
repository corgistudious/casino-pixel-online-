import { createDb } from './client';
import { runMigrations } from './migrate';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const { db, client } = createDb(url);
await runMigrations(db);
await client.end();
console.log('migrations applied');
