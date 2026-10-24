import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { adminOperations } from '../db/schema';
import { fail } from '../errors';

function hashRequest(kind: string, payload: unknown): string {
  return createHash('sha256').update(kind).update('\0').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Runs an administrative write at most once per idempotency key. The key is claimed inside the
 * same transaction as the change, so a crash leaves neither; a retry with the same key and the
 * same request returns the stored result; reusing a key for a different request is refused.
 */
export async function runOnce<T>(db: Db, key: string, actorId: string, kind: string, payload: unknown, fn: (tx: Tx) => Promise<T>): Promise<{ result: T; replayed: boolean }> {
  const requestHash = hashRequest(kind, payload);
  return db.transaction(async (tx) => {
    const claimed = await tx.insert(adminOperations).values({ id: key, actorId, kind, requestHash }).onConflictDoNothing().returning();
    if (!claimed.length) {
      const [existing] = await tx.select().from(adminOperations).where(eq(adminOperations.id, key));
      if (!existing || existing.actorId !== actorId || existing.requestHash !== requestHash) throw fail('idempotency_conflict');
      return { result: existing.result as T, replayed: true };
    }
    const result = await fn(tx);
    await tx.update(adminOperations).set({ result: result as never }).where(eq(adminOperations.id, key));
    return { result, replayed: false };
  });
}
