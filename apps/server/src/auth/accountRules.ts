import { KEYO_CAPTAIN_UID } from '@casino/shared';
import { sql, type SQL } from 'drizzle-orm';

/**
 * Who may sign in and play. Regular players, plus Keyo Captain (UID 1000): it stays a
 * `system_support` account (so every "protected system account" rule keeps applying to it), but it
 * can sign in once a password has been set and then plays under the same rules as everyone else.
 */
export function canSignIn(user: { accountType: string; uid: number }): boolean {
  return user.accountType === 'player' || user.uid === KEYO_CAPTAIN_UID;
}

/** SQL form of canSignIn for a users alias (`u` by default): rankings, ladders, tables. */
export function playableSql(alias = 'u'): SQL {
  const a = sql.raw(alias);
  return sql`(${a}.account_type = 'player' OR ${a}.uid = ${KEYO_CAPTAIN_UID})`;
}
