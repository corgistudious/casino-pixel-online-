import { addMonths, DEFAULT_PARTICIPATION, DEFAULT_RANK_RULES, idempotencyKeySchema, LEVEL_MAX, MAIL_MAX_ATTACHMENTS, mailAttachmentSchema, OFFICIAL_SEASON_REWARDS, participationSchema, SEASON_LENGTH_MONTHS, seasonRewardsSchema } from '@casino/shared';
import { asc, desc, eq, ne, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount } from '../auth/session';
import type { Db } from '../db/client';
import { levelRewards, rankSeasons } from '../db/schema';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { findByUid } from '../services/accounts';
import { runOnce } from '../services/adminOps';
import { audit } from '../services/audit';
import { itemsExist } from '../services/catalog';
import { addExp, levelLadder, levelOf, notifyProgress, recentExpEvents } from '../services/progression';
import { adjustRank, deliverSeasonRewards, endSeason, recentRewardFlags, seasonProjection, seasonRewardReport, setDisqualified, listSeasons, mySeasonResults, progressRank, publicSeason, rankHistory, rankLadder, startSeason } from '../services/rank';
import { makeGuards } from './guards';

const attachments = z.array(mailAttachmentSchema).max(MAIL_MAX_ATTACHMENTS);
const rulesSchema = z.object({
  winRp: z.number().int().min(1).max(200),
  lossRp: z.number().int().min(0).max(200),
  softResetDivisions: z.number().int().min(0).max(40),
});
const rewardsSchema = seasonRewardsSchema;
/** Defaults: 2-month season, official rewards, participation rewards off until the Owner sets them. */
const seasonSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().optional(),
    rules: rulesSchema.default(DEFAULT_RANK_RULES),
    rewards: rewardsSchema.default({ brackets: OFFICIAL_SEASON_REWARDS }),
    participation: participationSchema.default(DEFAULT_PARTICIPATION),
    autoRollover: z.boolean().default(true),
  })
  .refine((s) => !s.endsAt || Date.parse(s.endsAt) > Date.parse(s.startsAt), { path: ['endsAt'], message: 'endsAt must be after startsAt' });
const bracketLists = (r: z.infer<typeof rewardsSchema>) => Object.values(r.brackets);
const reasonSchema = z.string().trim().min(5).max(300);
const idParam = z.object({ id: z.coerce.number().int().positive() });
const uidParam = z.object({ uid: z.coerce.number().int().positive() });
const levelParam = z.object({ level: z.coerce.number().int().min(2).max(LEVEL_MAX) });

async function assertItems(db: Db, list: (z.infer<typeof attachments> | undefined)[]) {
  const ids = [...new Set(list.flatMap((l) => l ?? []).flatMap((a) => (a.type === 'item' ? [a.itemId] : [])))];
  if (!ids.length) return;
  const known = await itemsExist(db, ids);
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length) throw fail('item_not_found', missing.join(', '));
}

/** Level 999, ranked seasons and their admin. Every change happens on the server. */
export function registerProgressionRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { authed, can, canReauth } = makeGuards(app, db);

  // ---------------------------------------------------------------- player
  app.get('/api/me/progress', { preHandler: authed }, async (req) => {
    const user = requireAccount(req);
    return { level: await levelOf(db, user.id), rank: await progressRank(db, user.id) };
  });

  app.get('/api/me/rank/history', { preHandler: authed }, async (req) => ({ events: await rankHistory(db, requireAccount(req).id) }));
  app.get('/api/me/rank/seasons', { preHandler: authed }, async (req) => ({ results: await mySeasonResults(db, requireAccount(req).id) }));

  app.get('/api/leaderboard/level', async () => ({ entries: await levelLadder(db) }));

  /** Public: seasons with their reward table and participation rewards (what players can earn). */
  app.get('/api/rank/seasons', async () => ({ seasons: await listSeasons(db) }));

  /** Ladder of a season (default: the active one, else the latest). */
  app.get('/api/rank/ladder', async (req) => {
    const { seasonId } = z.object({ seasonId: z.coerce.number().int().positive().optional() }).parse(req.query);
    const [season] = seasonId
      ? await db.select().from(rankSeasons).where(eq(rankSeasons.id, seasonId))
      : await db.select().from(rankSeasons).where(ne(rankSeasons.status, 'scheduled')).orderBy(sql`${rankSeasons.status} = 'active' DESC`, desc(rankSeasons.id)).limit(1);
    if (!season) return { season: null, entries: [] };
    return { season: publicSeason(season), entries: await rankLadder(db, season.id) };
  });

  // ---------------------------------------------------------------- admin: level rewards
  app.get('/api/admin/progression/level-rewards', { preHandler: can('progression.read') }, async () => ({
    rewards: await db.select().from(levelRewards).orderBy(asc(levelRewards.level)),
  }));

  app.put('/api/admin/progression/level-rewards/:level', { preHandler: canReauth('progression.manage') }, async (req) => {
    const { level } = levelParam.parse(req.params);
    const body = z.object({ attachments: attachments.min(1), enabled: z.boolean().default(true) }).parse(req.body);
    await assertItems(db, [body.attachments]);
    const [row] = await db
      .insert(levelRewards)
      .values({ level, attachments: body.attachments, enabled: body.enabled, updatedBy: req.account!.id })
      .onConflictDoUpdate({ target: levelRewards.level, set: { attachments: body.attachments, enabled: body.enabled, updatedBy: req.account!.id, updatedAt: new Date() } })
      .returning();
    await audit(db, { actorId: req.account!.id, action: 'progression.level_reward', targetType: 'level', targetId: String(level), details: body, ip: req.ip });
    return { reward: row };
  });

  app.delete('/api/admin/progression/level-rewards/:level', { preHandler: canReauth('progression.manage') }, async (req) => {
    const { level } = levelParam.parse(req.params);
    const [row] = await db.delete(levelRewards).where(eq(levelRewards.level, level)).returning();
    if (!row) throw fail('not_found');
    await audit(db, { actorId: req.account!.id, action: 'progression.level_reward_delete', targetType: 'level', targetId: String(level), details: { attachments: row.attachments }, ip: req.ip });
    return { ok: true };
  });

  // ---------------------------------------------------------------- admin: seasons
  app.get('/api/admin/rank/seasons', { preHandler: can('progression.read') }, async () => ({ seasons: await listSeasons(db) }));

  app.post('/api/admin/rank/seasons', { preHandler: canReauth('progression.manage') }, async (req) => {
    const input = seasonSchema.parse(req.body);
    await assertItems(db, bracketLists(input.rewards));
    const startsAt = new Date(input.startsAt);
    const [row] = await db
      .insert(rankSeasons)
      .values({
        name: input.name,
        startsAt,
        endsAt: input.endsAt ? new Date(input.endsAt) : addMonths(startsAt, SEASON_LENGTH_MONTHS),
        rules: input.rules,
        rewards: input.rewards,
        participation: input.participation,
        autoRollover: input.autoRollover,
        createdBy: req.account!.id,
      })
      .returning();
    await audit(db, { actorId: req.account!.id, action: 'rank.season_create', targetType: 'rank_season', targetId: String(row!.id), details: input, ip: req.ip });
    return { season: publicSeason(row!) };
  });

  /** Scheduled seasons can change everything; a running one only its end date and rewards. */
  app.patch('/api/admin/rank/seasons/:id', { preHandler: canReauth('progression.manage') }, async (req) => {
    const { id } = idParam.parse(req.params);
    const input = z
      .object({
        name: z.string().trim().min(2).max(60).optional(),
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime().optional(),
        rules: rulesSchema.optional(),
        rewards: rewardsSchema.optional(),
        participation: participationSchema.optional(),
        autoRollover: z.boolean().optional(),
      })
      .parse(req.body);
    const [season] = await db.select().from(rankSeasons).where(eq(rankSeasons.id, id));
    if (!season) throw fail('not_found');
    if (season.status === 'ended') throw fail('bad_request', 'season ended');
    if (season.status === 'active' && (input.name || input.startsAt || input.rules)) throw fail('bad_request', 'a running season can only change its end date, rewards and participation rewards');
    if (input.rewards) await assertItems(db, bracketLists(input.rewards));
    const startsAt = input.startsAt ? new Date(input.startsAt) : season.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : season.endsAt;
    if (endsAt <= startsAt) throw fail('bad_request', 'endsAt must be after startsAt');
    const [row] = await db
      .update(rankSeasons)
      .set({
        name: input.name ?? season.name,
        startsAt,
        endsAt,
        rules: input.rules ?? season.rules,
        rewards: input.rewards ?? season.rewards,
        participation: input.participation ?? season.participation,
        autoRollover: input.autoRollover ?? season.autoRollover,
      })
      .where(eq(rankSeasons.id, id))
      .returning();
    await audit(db, { actorId: req.account!.id, action: 'rank.season_update', targetType: 'rank_season', targetId: String(id), details: input, ip: req.ip });
    return { season: publicSeason(row!) };
  });

  app.post('/api/admin/rank/seasons/:id/start', { preHandler: canReauth('progression.manage') }, async (req) => {
    const { id } = idParam.parse(req.params);
    const row = await db.transaction((tx) => startSeason(tx, id));
    await audit(db, { actorId: req.account!.id, action: 'rank.season_start', targetType: 'rank_season', targetId: String(id), ip: req.ip });
    return { season: publicSeason(row) };
  });

  /** Ends the running season now: final standings, rewards by mail (once), soft reset next season. */
  app.post('/api/admin/rank/seasons/:id/end', { preHandler: canReauth('progression.manage') }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { reason } = z.object({ reason: reasonSchema }).parse(req.body);
    const res = await db.transaction((tx) => endSeason(tx, id));
    if (!res) throw fail('season_inactive');
    await audit(db, { actorId: req.account!.id, action: 'rank.season_end', targetType: 'rank_season', targetId: String(id), details: { reason, ...res }, ip: req.ip });
    const delivery = await deliverSeasonRewards(db);
    return { ...res, delivery };
  });

  // ---------------------------------------------------------------- admin: season rewards
  /** What the season would pay if it ended now (Owner preview of the issuance). */
  app.get('/api/admin/rank/seasons/:id/projection', { preHandler: can('progression.read') }, async (req) => {
    const { id } = idParam.parse(req.params);
    return seasonProjection(db, id);
  });

  /** Reward records of an ended season: recipients, delivery/claim state, Cxu planned and claimed. */
  app.get('/api/admin/rank/seasons/:id/rewards', { preHandler: can('progression.read') }, async (req) => {
    const { id } = idParam.parse(req.params);
    return seasonRewardReport(db, id);
  });

  /** Retries mail delivery of pending rewards now (also retried automatically every minute). */
  app.post('/api/admin/rank/rewards/retry', { preHandler: canReauth('progression.manage') }, async (req) => {
    const res = await deliverSeasonRewards(db);
    await audit(db, { actorId: req.account!.id, action: 'rank.rewards_retry', details: res, ip: req.ip });
    return res;
  });

  app.get('/api/admin/rank/flags', { preHandler: can('progression.read') }, async () => ({ flags: await recentRewardFlags(db) }));

  /** Verified cheating: exclude a player from the season ladder, Top titles and rewards (or restore). */
  app.post('/api/admin/rank/seasons/:id/disqualify', { preHandler: canReauth('progression.manage') }, async (req) => {
    const { id } = idParam.parse(req.params);
    const input = z.object({ uid: z.number().int().positive(), disqualified: z.boolean(), reason: reasonSchema }).parse(req.body);
    const target = await findByUid(db, input.uid);
    if (!target) throw fail('not_found');
    const row = await db.transaction(async (tx) => {
      const r = await setDisqualified(tx, id, target.id, input.disqualified, input.reason);
      await audit(tx, { actorId: req.account!.id, action: input.disqualified ? 'rank.disqualify' : 'rank.requalify', targetType: 'user', targetId: String(input.uid), details: { seasonId: id, reason: input.reason }, ip: req.ip });
      return r;
    });
    return { disqualified: row.disqualified };
  });

  // ---------------------------------------------------------------- admin: a player's progression
  app.get('/api/admin/users/:uid/progression', { preHandler: can('progression.read') }, async (req) => {
    const { uid } = uidParam.parse(req.params);
    const target = await findByUid(db, uid);
    if (!target) throw fail('not_found');
    return {
      level: await levelOf(db, target.id),
      expEvents: await recentExpEvents(db, target.id, 30),
      rank: await progressRank(db, target.id),
      rankEvents: await rankHistory(db, target.id, 30),
      seasons: await mySeasonResults(db, target.id),
    };
  });

  /** EXP / RP correction with a reason; Owner and Super Admin only (Admin cannot change EXP or RP). */
  app.post('/api/admin/users/:uid/progression', { preHandler: canReauth('progression.manage') }, async (req) => {
    const { uid } = uidParam.parse(req.params);
    const input = z
      .object({
        expDelta: z.number().int().min(-10_000_000).max(10_000_000).optional(),
        rpDelta: z.number().int().min(-10_000).max(10_000).optional(),
        reason: reasonSchema,
        idempotencyKey: idempotencyKeySchema,
      })
      .refine((v) => !!v.expDelta || !!v.rpDelta, { message: 'nothing to change' })
      .parse(req.body);
    const target = await findByUid(db, uid);
    if (!target) throw fail('not_found');
    if (target.status === 'deleted' || target.accountType !== 'player') throw fail('system_account');
    const actorId = req.account!.id;
    const { result, replayed } = await runOnce(db, input.idempotencyKey, actorId, 'progression.adjust', { uid, expDelta: input.expDelta, rpDelta: input.rpDelta, reason: input.reason }, async (tx) => {
      const exp = input.expDelta ? await addExp(tx, target.id, { source: 'admin', sourceKey: `admin:${input.idempotencyKey}`, amount: input.expDelta, actorId, note: input.reason }) : null;
      const rank = input.rpDelta ? await adjustRank(tx, target.id, input.rpDelta, actorId, input.reason, input.idempotencyKey) : null;
      await audit(tx, { actorId, action: 'progression.adjust', targetType: 'user', targetId: String(uid), details: { ...input, levelAfter: exp?.level.level ?? null, rankAfter: rank }, ip: req.ip });
      return { exp, rank };
    });
    if (!replayed && result.exp) notifyProgress(hub, target.id, result.exp);
    return { ...result, replayed };
  });
}
