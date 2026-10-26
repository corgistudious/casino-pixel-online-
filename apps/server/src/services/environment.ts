import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { environmentState } from '../db/schema';

export const DATA_MODES = ['test', 'production'] as const;
export type DataMode = (typeof DATA_MODES)[number];

export async function getEnvironmentState(db: DbOrTx) {
  const [row] = await db.select().from(environmentState).where(eq(environmentState.id, 1));
  if (!row) throw new Error('environment_state row is missing; run the database migrations');
  return { mode: row.mode as DataMode, launchedAt: row.launchedAt };
}

/**
 * Refuses to run when the server's KEYO_DATA_MODE does not match the database, so a test
 * deployment can never write into a production database and production never runs on test data.
 */
export async function assertDataMode(db: DbOrTx, expected: DataMode): Promise<DataMode> {
  const { mode } = await getEnvironmentState(db);
  if (mode !== expected) {
    throw new Error(
      mode === 'test'
        ? 'KEYO_DATA_MODE=production but the database is still in test mode. Run reset:test-data and launch:production first.'
        : 'KEYO_DATA_MODE=test but the database is a production database. Point the test server at its own database.',
    );
  }
  return mode;
}
