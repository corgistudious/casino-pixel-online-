import type { PublicIdentity } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import type { RealtimeHub } from '../realtime/hub';
import { CARD_COLUMNS, CARD_JOIN, toCard, type CardRow } from './social';

const pick = (c: ReturnType<typeof toCard>): PublicIdentity => ({
  uid: c.uid,
  displayName: c.displayName,
  avatar: c.avatar,
  avatarItem: c.avatarItem,
  frame: c.frame,
  badges: c.badges,
  customAvatar: c.customAvatar,
  vipLevel: c.vipLevel,
  rank: c.rank ?? null,
});

/** Public identities (avatar/photo, frame, VIP, rank, badges) for many accounts, keyed by user id. */
export async function identities(db: DbOrTx, userIds: readonly string[]): Promise<Map<string, PublicIdentity>> {
  const out = new Map<string, PublicIdentity>();
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return out;
  const rows = await db.execute<CardRow>(sql`SELECT ${CARD_COLUMNS} FROM users u ${CARD_JOIN} WHERE u.id::text = ANY(string_to_array(${ids.join(',')}, ','))`);
  for (const r of rows) out.set(r.user_id, pick(toCard(r)));
  return out;
}

/**
 * Tells every connected client that a player's look changed (photo, frame, name, VIP, badges), so
 * chat, tables, lists and profiles redraw without a reload. Public fields only. Best effort: a
 * failure here never undoes the change that caused it.
 */
export async function publishIdentity(db: DbOrTx, hub: RealtimeHub, userId: string): Promise<void> {
  try {
    const id = (await identities(db, [userId])).get(userId);
    if (id) hub.broadcast({ type: 'event', event: 'identity', data: id });
  } catch {
    /* clients refetch on their next load or reconnect */
  }
}
