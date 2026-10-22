import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { ledgerEntries } from '../db/schema';
import { fail } from '../errors';

export type LedgerReason = 'signup' | 'daily_bonus' | 'rescue' | 'bet' | 'payout' | 'admin_adjust';

/**
 * Atomically applies a balance change and records it in the ledger.
 * Must run inside a transaction together with whatever caused the change.
 */
export async function applyDelta(
  tx: DbOrTx,
  userId: string,
  delta: number,
  reason: LedgerReason,
  roundId: string | null = null,
): Promise<number> {
  if (!Number.isSafeInteger(delta)) throw new Error('delta must be a safe integer');
  const rows = await tx.execute<{ balance: string }>(sql`
    UPDATE wallets SET balance = balance + ${delta}, updated_at = now()
    WHERE user_id = ${userId} AND balance + ${delta} >= 0
    RETURNING balance
  `);
  const row = rows[0];
  if (!row) throw fail('insufficient_funds');
  const balance = Number(row.balance);
  if (delta !== 0) {
    await tx.insert(ledgerEntries).values({ userId, delta, balanceAfter: balance, reason, roundId });
  }
  return balance;
}

export async function getBalance(db: DbOrTx, userId: string): Promise<number> {
  const rows = await db.execute<{ balance: string }>(sql`SELECT balance FROM wallets WHERE user_id = ${userId}`);
  return Number(rows[0]?.balance ?? 0);
}
