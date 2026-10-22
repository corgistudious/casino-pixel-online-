import { GAME_KEYS, type GameKey, type PlayerStats, type RoundSummary } from '@casino/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { gameRounds } from '../db/schema';

export async function playerStats(db: Db, userId: string): Promise<PlayerStats> {
  const rows = await db
    .select({
      game: gameRounds.game,
      rounds: sql<string>`count(*)`,
      wagered: sql<string>`coalesce(sum(${gameRounds.bet}), 0)`,
      won: sql<string>`coalesce(sum(${gameRounds.payout}), 0)`,
      biggest: sql<string>`coalesce(max(${gameRounds.payout}), 0)`,
    })
    .from(gameRounds)
    .where(and(eq(gameRounds.userId, userId), eq(gameRounds.status, 'settled')))
    .groupBy(gameRounds.game);

  const byGame = Object.fromEntries(GAME_KEYS.map((g) => [g, { rounds: 0, wagered: 0, won: 0 }])) as PlayerStats['byGame'];
  const stats: PlayerStats = { rounds: 0, wagered: 0, won: 0, biggestWin: 0, byGame };
  for (const r of rows) {
    const entry = { rounds: Number(r.rounds), wagered: Number(r.wagered), won: Number(r.won) };
    if (r.game in byGame) byGame[r.game as GameKey] = entry;
    stats.rounds += entry.rounds;
    stats.wagered += entry.wagered;
    stats.won += entry.won;
    stats.biggestWin = Math.max(stats.biggestWin, Number(r.biggest));
  }
  return stats;
}

export async function roundHistory(db: Db, userId: string, limit = 30): Promise<RoundSummary[]> {
  const rows = await db
    .select({
      id: gameRounds.id,
      game: gameRounds.game,
      bet: gameRounds.bet,
      payout: gameRounds.payout,
      createdAt: gameRounds.createdAt,
      nonce: gameRounds.nonce,
    })
    .from(gameRounds)
    .where(and(eq(gameRounds.userId, userId), eq(gameRounds.status, 'settled')))
    .orderBy(desc(gameRounds.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, game: r.game as GameKey, createdAt: r.createdAt.toISOString() }));
}
