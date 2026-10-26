import { isProtectedDisplayName } from './protectedNames';
import { eq, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { users } from '../db/schema';
import { fail } from '../errors';
import { applyDelta } from './wallet';

const WAIT_DAYS = 60;
export const RENAME_CARD_PRICE_GOLD = 300;
export const RENAME_CARD_ID = 'keyo-rename-card';

export async function renameInfo(db: DbOrTx, userId: string) {
  const rows = await db.execute<{free_used:boolean; last_renamed_at:Date|null; cards:number}>(sql`
    SELECT COALESCE(r.free_used,false) AS free_used, r.last_renamed_at,
           COALESCE(c.quantity,0)::int AS cards
    FROM users u
    LEFT JOIN keyo_rename_state r ON r.user_id=u.id
    LEFT JOIN keyo_rename_cards c ON c.user_id=u.id
    WHERE u.id=${userId}::uuid`);
  const r=rows[0];
  const nextFreeAt = r?.last_renamed_at
    ? new Date(new Date(r.last_renamed_at).getTime() + WAIT_DAYS * 86400000)
    : null;

  const freeAvailable =
    !r?.free_used ||
    !nextFreeAt ||
    Date.now() >= nextFreeAt.getTime();

  return {
    renameFreeAvailable: freeAvailable,
    renameCards: r?.cards ?? 0,
    renameAvailableAt: freeAvailable ? null : nextFreeAt.toISOString(),
  };
}

export async function buyRenameCard(db: Db, userId: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`);
    await applyDelta(tx,userId,-RENAME_CARD_PRICE_GOLD,'shop',null,'gold',RENAME_CARD_ID);
    await tx.execute(sql`INSERT INTO keyo_rename_cards(user_id,quantity) VALUES(${userId}::uuid,1)
      ON CONFLICT(user_id) DO UPDATE SET quantity=keyo_rename_cards.quantity+1`);
  });
}

export async function renamePlayer(db: Db,userId:string,name:string,useCard:boolean) {
  if (isProtectedDisplayName(name)) throw fail('username_taken');

  return db.transaction(async tx => {
    const [user]=await tx.select().from(users).where(eq(users.id,userId)).for('update');
    if (!user || user.accountType!=='player') throw fail('forbidden');
    if (user.displayName===name) throw fail('bad_request');
    await tx.execute(sql`INSERT INTO keyo_rename_state(user_id) VALUES(${userId}::uuid) ON CONFLICT DO NOTHING`);
    const state=await tx.execute<{free_used:boolean;last_renamed_at:Date|null}>(sql`
      SELECT free_used,last_renamed_at FROM keyo_rename_state WHERE user_id=${userId}::uuid FOR UPDATE`);
    const s=state[0]!;
    const canFree=!s.free_used || !s.last_renamed_at || Date.now()-new Date(s.last_renamed_at).getTime()>=WAIT_DAYS*86400000;
    if (!canFree) {
      if (!useCard) throw fail('too_soon');
      const consumed=await tx.execute(sql`UPDATE keyo_rename_cards SET quantity=quantity-1
        WHERE user_id=${userId}::uuid AND quantity>0 RETURNING quantity`);
      if (!consumed.length) throw fail('not_owned');
    }
    await tx.update(users).set({displayName:name}).where(eq(users.id,userId));
    await tx.execute(sql`UPDATE keyo_rename_state SET free_used=true,last_renamed_at=now() WHERE user_id=${userId}::uuid`);
  });
}
