import type { RoomEngine } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { fail } from '../errors';

/**
 * Gate for watching and sitting at a table. Official tables are open to everyone. A room needs:
 * not closed, not removed by the host (kicked_until in the future), and for a private room the
 * host, an invitation or the right password (an access row). Engines call this inside their own
 * transaction, so neither the API nor a realtime event can skip it.
 */
export async function assertRoomAccess(db: DbOrTx, engine: RoomEngine, tableId: string, userId: string): Promise<void> {
  const [room] = await db.execute<{ id: string; owner_id: string; visibility: string; closed: boolean; via: string | null; kicked: boolean }>(sql`
    SELECT r.id, r.owner_id, r.visibility, r.closed_at IS NOT NULL AS closed, a.via, coalesce(a.kicked_until > now(), false) AS kicked
    FROM game_rooms r
    LEFT JOIN room_access a ON a.room_id = r.id AND a.user_id = ${userId}::uuid
    WHERE r.engine = ${engine} AND r.table_id = ${tableId}
    FOR SHARE OF r`);
  if (!room) return;
  if (room.closed) throw fail('room_closed');
  if (room.owner_id === userId) return;
  if (room.kicked) throw fail('room_kicked');
  if (room.visibility === 'private' && !room.via) throw fail('room_locked');
}

/** True when the table is a player room (never served by the anonymous table views). */
export async function isRoomTable(db: DbOrTx, engine: RoomEngine, tableId: string): Promise<boolean> {
  const rows = await db.execute(sql`SELECT 1 FROM game_rooms WHERE engine = ${engine} AND table_id = ${tableId}`);
  return rows.length > 0;
}
