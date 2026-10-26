import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { applyDelta, getWallet } from '../services/wallet';
import { makeGuards } from './guards';

const questInput = z.object({ id: z.enum(['daily_play','daily_win','weekly_win','weekly_play']) });
const questDefs = {
  daily_play: { period: 'daily', target: 3, silver: 300, reason: 'bet' },
  daily_win: { period: 'daily', target: 1, silver: 500, reason: 'payout' },
  weekly_play: { period: 'weekly', target: 20, silver: 2500, reason: 'bet' },
  weekly_win: { period: 'weekly', target: 10, silver: 5000, reason: 'payout' },
} as const;

export function registerMissionRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { authed } = makeGuards(app, db);
  app.get('/api/quests', {preHandler:authed},async req=>{
    const me=requireAccount(req);
    const rows=await db.execute<{id:string;progress:string;claimed:boolean}>(sql`
      WITH defs AS (SELECT * FROM (VALUES ('daily_play','bet',3,'daily'),('daily_win','payout',1,'daily'),('weekly_play','bet',20,'weekly'),('weekly_win','payout',10,'weekly')) AS v(id,reason,target,period))
      SELECT d.id, (SELECT count(*)::text FROM ledger_entries l WHERE l.user_id=${me.id}::uuid AND l.reason=d.reason AND l.created_at >= CASE WHEN d.period='daily' THEN date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' ELSE date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' END) AS progress,
      EXISTS(SELECT 1 FROM quest_claims q WHERE q.user_id=${me.id}::uuid AND q.quest_id=d.id AND q.period_key=CASE WHEN d.period='daily' THEN to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD') ELSE to_char(now() AT TIME ZONE 'UTC','IYYY-"W"IW') END) AS claimed
      FROM defs d`);
    return {quests:rows.map(r=>({...questDefs[r.id as keyof typeof questDefs],id:r.id,progress:Number(r.progress),claimed:r.claimed}))};
  });
  app.post('/api/quests/claim', {preHandler:authed},async req=>{
    const me=requireActive(requireAccount(req));const {id}=questInput.parse(req.body);const q=questDefs[id];
    await db.transaction(async tx=>{
      await tx.execute(sql`SELECT id FROM users WHERE id=${me.id}::uuid FOR UPDATE`);
      const period=await tx.execute<{key:string;start:string}>(sql`SELECT CASE WHEN ${q.period}='daily' THEN to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD') ELSE to_char(now() AT TIME ZONE 'UTC','IYYY-"W"IW') END AS key, CASE WHEN ${q.period}='daily' THEN date_trunc('day',now() AT TIME ZONE 'UTC') ELSE date_trunc('week',now() AT TIME ZONE 'UTC') END::text AS start`);
      const periodKey=period[0]!.key;
      const progress=await tx.execute<{n:string}>(sql`SELECT count(*)::text AS n FROM ledger_entries WHERE user_id=${me.id}::uuid AND reason=${q.reason} AND created_at >= (${period[0]!.start}::timestamp AT TIME ZONE 'UTC')`);
      if(Number(progress[0]?.n??0)<q.target)throw fail('forbidden');
      const inserted=await tx.execute(sql`INSERT INTO quest_claims(user_id,quest_id,period_key) VALUES(${me.id}::uuid,${id},${periodKey}) ON CONFLICT DO NOTHING RETURNING quest_id`);
      if(!inserted.length)throw fail('already_owned');
      await applyDelta(tx,me.id,q.silver,'quest_reward',null,'silver',`quest:${id}:${periodKey}`);
    });
    hub.sendToUser(me.id,{type:'event',event:'wallet',data:await getWallet(db,me.id)} as never);
    return {ok:true,reward:q.silver};
  });
}
