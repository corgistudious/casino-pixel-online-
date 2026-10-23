import { DEFAULT_FRAME, findFrame } from '@casino/shared';
import { and, eq } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { userItems, users } from '../db/schema';
import { fail } from '../errors';
import { applyDelta } from './wallet';

export async function ownedFrames(db: DbOrTx, userId: string): Promise<string[]> {
  const rows = await db.select({ itemId: userItems.itemId }).from(userItems).where(eq(userItems.userId, userId));
  return [DEFAULT_FRAME, ...rows.map((r) => r.itemId).filter((id) => id !== DEFAULT_FRAME)];
}

/** Buys a built-in frame with Cxu Bạc. Debit and ownership are written in one transaction. */
export async function buyFrame(db: Db, userId: string, itemId: string): Promise<void> {
  const frame = findFrame(itemId);
  if (!frame) throw fail('item_not_found');
  if (frame.price === 0) throw fail('already_owned');
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(userItems).values({ userId, itemId }).onConflictDoNothing().returning();
    if (inserted.length === 0) throw fail('already_owned');
    await applyDelta(tx, userId, -frame.price, 'shop');
  });
}

export async function equipFrame(db: Db, userId: string, itemId: string) {
  if (!findFrame(itemId)) throw fail('item_not_found');
  if (itemId !== DEFAULT_FRAME) {
    const [owned] = await db
      .select()
      .from(userItems)
      .where(and(eq(userItems.userId, userId), eq(userItems.itemId, itemId)));
    if (!owned) throw fail('not_owned');
  }
  const [row] = await db.update(users).set({ frame: itemId }).where(eq(users.id, userId)).returning();
  return row!;
}
