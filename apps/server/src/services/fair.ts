import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Rng } from '@casino/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { fairSeeds } from '../db/schema';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Provably fair float stream: HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`),
 * each digest yields eight floats built from 4 bytes each.
 */
export function fairRng(serverSeed: string, clientSeed: string, nonce: number): Rng {
  let cursor = 0;
  let buffer: Buffer = Buffer.alloc(0);
  let offset = 0;
  return {
    float() {
      if (offset + 4 > buffer.length) {
        buffer = createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:${cursor++}`).digest();
        offset = 0;
      }
      let f = 0;
      for (let i = 0; i < 4; i++) f += buffer[offset + i]! / 256 ** (i + 1);
      offset += 4;
      return f;
    },
  };
}

export function newSeedPair(clientSeed?: string) {
  const serverSeed = randomBytes(32).toString('hex');
  return { serverSeed, serverSeedHash: sha256(serverSeed), clientSeed: clientSeed ?? randomBytes(8).toString('hex') };
}

export async function createActiveSeed(db: DbOrTx, userId: string, clientSeed?: string) {
  const [row] = await db
    .insert(fairSeeds)
    .values({ userId, ...newSeedPair(clientSeed) })
    .returning();
  return row!;
}

/** Atomically reserves the next nonce of the user's active seed. */
export async function takeNonce(db: DbOrTx, userId: string) {
  const [row] = await db
    .update(fairSeeds)
    .set({ nonce: sql`${fairSeeds.nonce} + 1` })
    .where(and(eq(fairSeeds.userId, userId), eq(fairSeeds.active, true)))
    .returning();
  if (!row) throw new Error(`no active seed for user ${userId}`);
  const nonce = row.nonce - 1;
  return { seedId: row.id, nonce, rng: fairRng(row.serverSeed, row.clientSeed, nonce) };
}

export async function getActiveSeed(db: DbOrTx, userId: string) {
  const [row] = await db
    .select()
    .from(fairSeeds)
    .where(and(eq(fairSeeds.userId, userId), eq(fairSeeds.active, true)));
  return row ?? createActiveSeed(db, userId);
}

/** Reveals the current server seed and starts a new pair. */
export async function rotateSeed(db: DbOrTx, userId: string, clientSeed?: string) {
  const current = await getActiveSeed(db, userId);
  await db.update(fairSeeds).set({ active: false, revealedAt: new Date() }).where(eq(fairSeeds.id, current.id));
  const next = await createActiveSeed(db, userId, clientSeed ?? current.clientSeed);
  return {
    revealed: {
      serverSeed: current.serverSeed,
      serverSeedHash: current.serverSeedHash,
      clientSeed: current.clientSeed,
      finalNonce: current.nonce,
    },
    next,
  };
}
