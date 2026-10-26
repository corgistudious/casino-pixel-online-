import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { fail } from '../errors';
import { applyDelta, getWallet } from './wallet';

export type BankCurrency = 'silver' | 'gold';
export type BankDirection = 'deposit' | 'withdraw';

export async function bankOverview(db: Db, userId: string) {
  const [wallet, rows] = await Promise.all([
    getWallet(db, userId),
    db.execute<{ silver: string; gold: string }>(sql`SELECT silver, gold FROM bank_accounts WHERE user_id = ${userId}::uuid`),
  ]);
  return { wallet, bank: { silver: Number(rows[0]?.silver ?? 0), gold: Number(rows[0]?.gold ?? 0) } };
}

/** Exactly-once movement, serialized per player and recorded in the existing wallet ledger.
 * Never expose arbitrary credit or debit endpoints. A bank transfer is always zero-sum.
 */
export async function moveBankFunds(db: Db, userId: string, id: string, currency: BankCurrency, direction: BankDirection, amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000) throw fail('bad_request');
  return db.transaction(async (tx) => {
    // Serialize requests for this account, including concurrent retries.
    await tx.execute(sql`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`);
    const previous = await tx.execute<{ currency: string; direction: string; amount: string; wallet_after: string; bank_after: string }>(sql`
      SELECT currency, direction, amount, wallet_after, bank_after FROM bank_transfers
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
    `);
    if (previous.length) {
      const p = previous[0]!;
      if (p.currency !== currency || p.direction !== direction || Number(p.amount) !== amount) throw fail('idempotency_conflict');
      return { replayed: true, walletAfter: Number(p.wallet_after), bankAfter: Number(p.bank_after) };
    }
    // Reject reuse of another user's idempotency key.
    const used = await tx.execute(sql`SELECT 1 FROM bank_transfers WHERE id = ${id}::uuid`);
    if (used.length) throw fail('idempotency_conflict');
    await tx.execute(sql`INSERT INTO bank_accounts(user_id) VALUES (${userId}::uuid) ON CONFLICT DO NOTHING`);
    const column = sql.raw(currency === 'silver' ? 'silver' : 'gold');
    const signed = direction === 'deposit' ? amount : -amount;
    // Withdrawal must first debit the bank. If wallet debit fails, the transaction rolls back.
    let bankAfter: number;
    if (direction === 'withdraw') {
      const rows = await tx.execute<{ value: string }>(sql`
        UPDATE bank_accounts SET ${column} = ${column} - ${amount}, updated_at = now()
        WHERE user_id = ${userId}::uuid AND ${column} >= ${amount}
        RETURNING ${column} AS value
      `);
      if (!rows.length) throw fail('insufficient_funds');
      bankAfter = Number(rows[0]!.value);
    }
    const walletAfter = await applyDelta(tx, userId, -signed, direction === 'deposit' ? 'bank_deposit' : 'bank_withdraw', null, currency, `bank:${id}`);
    if (direction === 'deposit') {
      const rows = await tx.execute<{ value: string }>(sql`
        UPDATE bank_accounts SET ${column} = ${column} + ${amount}, updated_at = now()
        WHERE user_id = ${userId}::uuid RETURNING ${column} AS value
      `);
      bankAfter = Number(rows[0]!.value);
    }
    await tx.execute(sql`
      INSERT INTO bank_transfers(id, user_id, currency, direction, amount, wallet_after, bank_after)
      VALUES (${id}::uuid, ${userId}::uuid, ${currency}, ${direction}, ${amount}, ${walletAfter}, ${bankAfter!})
    `);
    return { replayed: false, walletAfter, bankAfter: bankAfter! };
  });
}

export interface BankTransferView {
  id: string;
  currency: BankCurrency;
  direction: BankDirection;
  amount: number;
  walletAfter: number;
  bankAfter: number;
  createdAt: string;
}

/** Newest first, 50 per page; `before` is the createdAt of the last row already shown. */
export async function bankHistory(db: Db, userId: string, before?: string): Promise<{ transfers: BankTransferView[] }> {
  const rows = await db.execute<{ id: string; currency: BankCurrency; direction: BankDirection; amount: string; wallet_after: string; bank_after: string; created_at: string }>(sql`
    SELECT id, currency, direction, amount, wallet_after, bank_after, created_at
    FROM bank_transfers WHERE user_id = ${userId}::uuid ${before ? sql`AND created_at < ${before}::timestamptz` : sql``}
    ORDER BY created_at DESC LIMIT 50
  `);
  return {
    transfers: rows.map((r) => ({
      id: r.id,
      currency: r.currency,
      direction: r.direction,
      amount: Number(r.amount),
      walletAfter: Number(r.wallet_after),
      bankAfter: Number(r.bank_after),
      createdAt: new Date(r.created_at).toISOString(),
    })),
  };
}
