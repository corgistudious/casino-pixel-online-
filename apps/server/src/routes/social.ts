import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { applyDelta, getWallet } from '../services/wallet';
import { makeGuards } from './guards';

const uidInput = z.object({ uid: z.coerce.number().int().min(1000) });
const messageInput = z.object({ body: z.string().trim().min(1).max(500) });
const guildName = z.object({ name: z.string().trim().min(3).max(40) });
const questInput = z.object({ id: z.enum(['daily_play','daily_win','weekly_win','weekly_play']) });
const questDefs = {
  daily_play: { period: 'daily', target: 3, silver: 300, reason: 'bet' },
  daily_win: { period: 'daily', target: 1, silver: 500, reason: 'payout' },
  weekly_play: { period: 'weekly', target: 20, silver: 2500, reason: 'bet' },
  weekly_win: { period: 'weekly', target: 10, silver: 5000, reason: 'payout' },
} as const;
const rankFor = (points: number) => points >= 100000 ? 'Supreme' : points >= 50000 ? 'SSS' : points >= 25000 ? 'SS' : points >= 10000 ? 'S' : points >= 5000 ? 'A' : points >= 2000 ? 'B' : points >= 500 ? 'C' : 'D';

export function registerSocialRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { authed } = makeGuards(app, db);
  const target = async (uid: number) => {
    const rows = await db.execute<{id:string;uid:number;display_name:string}>(sql`SELECT id,uid,display_name FROM users WHERE uid=${uid} AND status='active'`);
    if (!rows.length) throw fail('not_found');
    return rows[0]!;
  };
  const support = async () => target(1000);
  const ensureSupport = async (id:string) => {
    const s = await support();
    if (id !== s.id) await db.execute(sql`INSERT INTO friendships(user_id,friend_id) VALUES (${id}::uuid,${s.id}::uuid) ON CONFLICT DO NOTHING`);
  };
  app.get('/api/friends', { preHandler: authed }, async req => {
    const me = requireAccount(req); await ensureSupport(me.id);
    const friends = await db.execute(sql`SELECT u.uid,u.display_name, f.created_at FROM friendships f JOIN users u ON u.id=f.friend_id WHERE f.user_id=${me.id}::uuid ORDER BY u.uid=1000 DESC,f.created_at DESC`);
    const incoming = await db.execute(sql`SELECT u.uid,u.display_name,r.created_at FROM friend_requests r JOIN users u ON u.id=r.sender_id WHERE r.receiver_id=${me.id}::uuid ORDER BY r.created_at DESC`);
    return { friends, incoming };
  });
  app.post('/api/friends/request', { preHandler: authed, config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async req => {
    const me=requireActive(requireAccount(req));const {uid}=uidInput.parse(req.body);const other=await target(uid);
    if(other.id===me.id || uid===1000) throw fail('bad_request');
    await db.execute(sql`INSERT INTO friend_requests(sender_id,receiver_id) SELECT ${me.id}::uuid,${other.id}::uuid WHERE NOT EXISTS(SELECT 1 FROM friendships WHERE user_id=${me.id}::uuid AND friend_id=${other.id}::uuid) ON CONFLICT DO NOTHING`);
    hub.sendToUser(other.id,{type:'event',event:'social',data:{kind:'request'}} as never);
    return {ok:true};
  });
  app.post('/api/friends/accept', { preHandler: authed }, async req => {
    const me=requireActive(requireAccount(req));const {uid}=uidInput.parse(req.body);const other=await target(uid);
    await db.transaction(async tx=>{
      const pending=await tx.execute(sql`DELETE FROM friend_requests WHERE sender_id=${other.id}::uuid AND receiver_id=${me.id}::uuid RETURNING sender_id`);
      if(!pending.length) throw fail('not_found');
      await tx.execute(sql`INSERT INTO friendships(user_id,friend_id) VALUES (${me.id}::uuid,${other.id}::uuid),(${other.id}::uuid,${me.id}::uuid) ON CONFLICT DO NOTHING`);
      await tx.execute(sql`DELETE FROM friend_requests WHERE sender_id=${me.id}::uuid AND receiver_id=${other.id}::uuid`);
    });
    hub.sendToUser(other.id,{type:'event',event:'social',data:{kind:'accepted'}} as never);
    return {ok:true};
  });
  app.post('/api/friends/remove', { preHandler: authed }, async req=>{
    const me=requireActive(requireAccount(req));const {uid}=uidInput.parse(req.body);if(uid===1000)throw fail('protected_account');const other=await target(uid);
    await db.transaction(async tx=>{
      await tx.execute(sql`DELETE FROM friendships WHERE (user_id=${me.id}::uuid AND friend_id=${other.id}::uuid) OR (user_id=${other.id}::uuid AND friend_id=${me.id}::uuid)`);
      await tx.execute(sql`DELETE FROM friend_requests WHERE (sender_id=${me.id}::uuid AND receiver_id=${other.id}::uuid) OR (sender_id=${other.id}::uuid AND receiver_id=${me.id}::uuid)`);
    });return {ok:true};
  });
  app.get('/api/dm/:uid', {preHandler:authed}, async req=>{
    const me=requireAccount(req);const {uid}=uidInput.parse(req.params);if(uid===1000)throw fail('protected_account');const other=await target(uid);
    const rows=await db.execute(sql`SELECT m.id,u.uid AS sender_uid,m.body,m.created_at,m.read_at FROM direct_messages m JOIN users u ON u.id=m.sender_id WHERE (m.sender_id=${me.id}::uuid AND m.receiver_id=${other.id}::uuid) OR (m.sender_id=${other.id}::uuid AND m.receiver_id=${me.id}::uuid) ORDER BY m.id DESC LIMIT 100`);
    await db.execute(sql`UPDATE direct_messages SET read_at=now() WHERE sender_id=${other.id}::uuid AND receiver_id=${me.id}::uuid AND read_at IS NULL`);
    return {messages:[...rows].reverse()};
  });
  app.post('/api/dm/:uid', {preHandler:authed,config:{rateLimit:{max:15,timeWindow:'1 minute'}}},async req=>{
    const me=requireActive(requireAccount(req));const {uid}=uidInput.parse(req.params);const {body}=messageInput.parse(req.body);
    if(uid===1000)throw fail('protected_account');const other=await target(uid);if(other.id===me.id)throw fail('bad_request');
    const rows=await db.transaction(async tx=>{
      const f=await tx.execute(sql`SELECT 1 FROM friendships WHERE user_id=${me.id}::uuid AND friend_id=${other.id}::uuid`);
      if(!f.length)throw fail('forbidden');
      const recent=await tx.execute(sql`SELECT 1 FROM direct_messages WHERE sender_id=${me.id}::uuid AND created_at>now()-interval '2 seconds' LIMIT 1`);
      if(recent.length)throw fail('too_soon');
      return tx.execute(sql`INSERT INTO direct_messages(sender_id,receiver_id,body) VALUES(${me.id}::uuid,${other.id}::uuid,${body}) RETURNING id`);
    });
    hub.sendToUser(other.id,{type:'event',event:'social',data:{kind:'dm',from:me.uid}} as never);
    return {id:rows[0]?.id,ok:true};
  });
  app.get('/api/social/unread', {preHandler:authed},async req=>{
    const me=requireAccount(req);const rows=await db.execute<{count:string}>(sql`SELECT count(*)::text AS count FROM direct_messages WHERE receiver_id=${me.id}::uuid AND read_at IS NULL`);
    return {count:Number(rows[0]?.count??0)};
  });
  app.get('/api/guild', {preHandler:authed},async req=>{
    const me=requireAccount(req);
    const rows=await db.execute<{id:string;name:string;points:string;role:string}>(sql`SELECT g.id,g.name,g.points,m.role FROM guild_members m JOIN guilds g ON g.id=m.guild_id WHERE m.user_id=${me.id}::uuid`);
    if(!rows.length)return {guild:null};const g=rows[0]!;
    const members=await db.execute(sql`SELECT u.uid,u.display_name,m.role FROM guild_members m JOIN users u ON u.id=m.user_id WHERE m.guild_id=${g.id}::uuid ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END,u.uid`);
    return {guild:{...g,points:Number(g.points),rank:rankFor(Number(g.points)),members}};
  });
  app.post('/api/guild', {preHandler:authed,config:{rateLimit:{max:3,timeWindow:'1 minute'}}},async req=>{
    const me=requireActive(requireAccount(req));const {name}=guildName.parse(req.body);
    const guildId=randomUUID();
    await db.transaction(async tx=>{
      await tx.execute(sql`SELECT id FROM users WHERE id=${me.id}::uuid FOR UPDATE`);
      const existing=await tx.execute(sql`SELECT 1 FROM guild_members WHERE user_id=${me.id}::uuid`);
      if(existing.length)throw fail('already_owned');
      await applyDelta(tx,me.id,-300,'guild_create',null,'gold',`guild:${guildId}`);
      await tx.execute(sql`INSERT INTO guilds(id,name,owner_id) VALUES(${guildId}::uuid,${name},${me.id}::uuid)`);
      await tx.execute(sql`INSERT INTO guild_members(user_id,guild_id,role) VALUES(${me.id}::uuid,${guildId}::uuid,'owner')`);
    });
    hub.sendToUser(me.id,{type:'event',event:'wallet',data:await getWallet(db,me.id)} as never);
    return {id:guildId};
  });
  app.post('/api/guild/join', {preHandler:authed},async req=>{
    const me=requireActive(requireAccount(req));const input=z.object({id:z.string().uuid()}).parse(req.body);
    await db.transaction(async tx=>{
      await tx.execute(sql`SELECT id FROM users WHERE id=${me.id}::uuid FOR UPDATE`);
      const existing=await tx.execute(sql`SELECT 1 FROM guild_members WHERE user_id=${me.id}::uuid`);if(existing.length)throw fail('already_owned');
      const g=await tx.execute(sql`SELECT id FROM guilds WHERE id=${input.id}::uuid`);if(!g.length)throw fail('not_found');
      await tx.execute(sql`INSERT INTO guild_members(user_id,guild_id,role) VALUES(${me.id}::uuid,${input.id}::uuid,'member')`);
    });return {ok:true};
  });
  app.get('/api/guild/list', {preHandler:authed},async()=>({guilds:await db.execute(sql`SELECT id,name,points FROM guilds ORDER BY points DESC,created_at LIMIT 100`)}));
  app.get('/api/guild/chat', {preHandler:authed},async req=>{
    const me=requireAccount(req);const rows=await db.execute(sql`SELECT c.id,u.uid,c.body,c.created_at FROM guild_messages c JOIN guild_members m ON m.guild_id=c.guild_id JOIN users u ON u.id=c.user_id WHERE m.user_id=${me.id}::uuid ORDER BY c.id DESC LIMIT 100`);
    return {messages:[...rows].reverse()};
  });
  app.post('/api/guild/chat', {preHandler:authed,config:{rateLimit:{max:8,timeWindow:'1 minute'}}},async req=>{
    const me=requireActive(requireAccount(req));const {body}=messageInput.parse(req.body);
    const rows=await db.transaction(async tx=>{
      const membership=await tx.execute<{guild_id:string}>(sql`SELECT guild_id FROM guild_members WHERE user_id=${me.id}::uuid`);
      if(!membership.length)throw fail('forbidden');
      const recent=await tx.execute(sql`SELECT 1 FROM guild_messages WHERE user_id=${me.id}::uuid AND created_at>now()-interval '2 seconds' LIMIT 1`);if(recent.length)throw fail('too_soon');
      return tx.execute(sql`INSERT INTO guild_messages(guild_id,user_id,body) VALUES(${membership[0]!.guild_id}::uuid,${me.id}::uuid,${body}) RETURNING id`);
    });return {id:rows[0]?.id};
  });
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
