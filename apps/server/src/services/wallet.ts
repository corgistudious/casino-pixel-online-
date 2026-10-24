import type { Currency } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { ledgerEntries } from '../db/schema';
import { fail } from '../errors';

// 'signup' and 'daily_bonus' are legacy reasons kept for existing ledger rows.
export type LedgerReason = 'signup' | 'daily_bonus' | 'welcome' | 'checkin' | 'shop' | 'rescue' | 'bet' | 'payout' | 'admin_adjust';

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
  currency: Currency = 'silver',
): Promise<number> {
  if (!Number.isSafeInteger(delta)) throw new Error('delta must be a safe integer');
  // Column names come from a fixed whitelist, never from input.
  const column = sql.raw(currency === 'gold' ? 'gold' : 'balance');
  const rows = await tx.execute<{ value: string }>(sql`
    UPDATE wallets SET ${column} = ${column} + ${delta}, updated_at = now()
    WHERE user_id = ${userId} AND ${column} + ${delta} >= 0
    RETURNING ${column} AS value
  `);
  const row = rows[0];
  if (!row) throw fail('insufficient_funds');
  const balance = Number(row.value);
  if (delta !== 0) {
    await tx.insert(ledgerEntries).values({ userId, currency, delta, balanceAfter: balance, reason, roundId });
  }
  return balance;
}

export async function getWallet(db: DbOrTx, userId: string): Promise<{ balance: number; gold: number }> {
  const rows = await db.execute<{ balance: string; gold: string }>(sql`SELECT balance, gold FROM wallets WHERE user_id = ${userId}`);
  return { balance: Number(rows[0]?.balance ?? 0), gold: Number(rows[0]?.gold ?? 0) };
}

export async function getBalance(db: DbOrTx, userId: string): Promise<number> {
  const rows = await db.execute<{ balance: string }>(sql`SELECT balance FROM wallets WHERE user_id = ${userId}`);
  return Number(rows[0]?.balance ?? 0);
}
