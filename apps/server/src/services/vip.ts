import { KEYO_OWNER_UID, vipProgress, type VipAdjustInput, type VipEventView, type VipLevelInput, type VipLevelView, type VipStatusView } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { fail } from '../errors';
import { runOnce } from './adminOps';
import { assetUrl } from './assets';
import { audit } from './audit';
import { rankOf } from './rbac';

/** Effective VIP level of `vp` (vip_progress) — the same rule as the keyo_vip_level() SQL function. */
export const VIP_LEVEL_SQL = sql`keyo_vip_level(vp.exp, vp.override_level, vp.override_until)`;

type LevelRow = {
  level: number;
  name_vi: string;
  name_en: string;
  desc_vi: string;
  desc_en: string;
  icon_asset: string | null;
  color: string;
  exp_required: string;
  daily_silver: number;
  daily_gold: number;
  benefits: { vi: string; en: string }[];
  active: boolean;
};

const toLevel = (r: LevelRow): VipLevelView => ({
  level: Number(r.level),
  exp: Number(r.exp_required),
  daily: { silver: Number(r.daily_silver), gold: Number(r.daily_gold) },
  name: { vi: r.name_vi, en: r.name_en },
  description: { vi: r.desc_vi, en: r.desc_en },
  color: r.color,
  iconUrl: r.icon_asset ? assetUrl(r.icon_asset) : null,
  benefits: r.benefits ?? [],
  active: r.active,
});

/** The VIP table, lowest level first. Players see active levels; staff see all. */
export async function vipLevels(db: DbOrTx, activeOnly = true): Promise<VipLevelView[]> {
  const rows = await db.execute<LevelRow>(sql`
    SELECT level, name_vi, name_en, desc_vi, desc_en, icon_asset, color, exp_required, daily_silver, daily_gold, benefits, active
    FROM vip_levels ${activeOnly ? sql`WHERE active` : sql``} ORDER BY level`);
  return rows.map(toLevel);
}

type ProgressRow = { exp: string | null; last_claim_date: string | null; override_level: number | null; override_until: string | null; level: number };

async function progressRow(db: DbOrTx, userId: string, lock = false): Promise<ProgressRow> {
  const [r] = await db.execute<ProgressRow>(sql`
    SELECT vp.exp, vp.last_claim_date, vp.override_level, vp.override_until, ${VIP_LEVEL_SQL} AS level
    FROM vip_progress vp WHERE vp.user_id = ${userId}::uuid ${lock ? sql`FOR UPDATE` : sql``}`);
  if (r) return r;
  const [base] = await db.execute<{ level: number }>(sql`SELECT keyo_vip_level(0, NULL, NULL) AS level`);
  return { exp: '0', last_claim_date: null, override_level: null, override_until: null, level: Number(base!.level) };
}

export async function vipStatus(db: DbOrTx, userId: string, levels?: VipLevelView[]): Promise<VipStatusView> {
  const all = levels ?? (await vipLevels(db, false));
  const active = all.filter((l) => l.active);
  const row = await progressRow(db, userId);
  const exp = Number(row.exp ?? 0);
  const p = vipProgress(exp, active);
  const level = Number(row.level);
  const overrideActive = row.override_level !== null && (row.override_until === null || new Date(row.override_until) > new Date());
  return {
    level,
    expLevel: p.level,
    exp,
    // A granted level may be inactive or above the table; fall back to the EXP level's row.
    current: all.find((l) => l.level === level) ?? p.current,
    next: p.next,
    ratio: p.ratio,
    toNext: p.toNext,
    lastClaimDate: row.last_claim_date ? String(row.last_claim_date).slice(0, 10) : null,
    override: overrideActive ? { level: Number(row.override_level), until: row.override_until ? new Date(row.override_until).toISOString() : null } : null,
  };
}

/** Effective VIP levels for many players at once. */
export async function vipLevelsOf(db: DbOrTx, userIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!userIds.length) return out;
  const rows = await db.execute<{ user_id: string; level: number }>(sql`
    SELECT u.id AS user_id, ${VIP_LEVEL_SQL} AS level FROM users u LEFT JOIN vip_progress vp ON vp.user_id = u.id
    WHERE u.id::text = ANY(string_to_array(${userIds.join(',')}, ','))`);
  for (const r of rows) out.set(r.user_id, Number(r.level));
  return out;
}

// ---------------------------------------------------------------- level table (vip.levels)

/** Active levels must start at level 1 with 0 EXP and need strictly more EXP for every higher level. */
function assertValidTable(levels: { level: number; exp: number; active: boolean }[]) {
  const active = levels.filter((l) => l.active).sort((a, b) => a.level - b.level);
  if (!active.length || active[0]!.level !== 1 || active[0]!.exp !== 0) throw fail('vip_levels_invalid', 'level 1 must be active and need 0 EXP');
  for (let i = 1; i < active.length; i++) {
    if (active[i]!.exp <= active[i - 1]!.exp) throw fail('vip_levels_invalid', `VIP ${active[i]!.level} must need more EXP than VIP ${active[i - 1]!.level}`);
  }
}

/** Players whose effective level is `level` right now (granted or by EXP). */
async function playersAtLevel(db: DbOrTx, level: number): Promise<number> {
  const [r] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM vip_progress vp WHERE ${VIP_LEVEL_SQL} = ${level} OR vp.override_level = ${level}`);
  return r!.n;
}

/** Creates or edits one level. Changing thresholds moves players between levels; EXP never changes. */
export async function saveVipLevel(db: Db, actorId: string, input: VipLevelInput, ip?: string): Promise<VipLevelView[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE vip_levels IN SHARE ROW EXCLUSIVE MODE`);
    const before = (await vipLevels(tx, false)).find((l) => l.level === input.level) ?? null;
    if (before && before.active && !input.active) {
      const n = await playersAtLevel(tx, input.level);
      if (n > 0) throw fail('vip_level_in_use', `${n} player(s) are at VIP ${input.level}`);
    }
    if (input.iconAsset) {
      const [a] = await tx.execute(sql`SELECT 1 FROM assets WHERE id = ${input.iconAsset}`);
      if (!a) throw fail('invalid_asset');
    }
    await tx.execute(sql`
      INSERT INTO vip_levels (level, name_vi, name_en, desc_vi, desc_en, icon_asset, color, exp_required, daily_silver, daily_gold, benefits, active, updated_by)
      VALUES (${input.level}, ${input.name.vi}, ${input.name.en}, ${input.description.vi}, ${input.description.en}, ${input.iconAsset}, ${input.color},
        ${input.exp}, ${input.daily.silver}, ${input.daily.gold}, ${JSON.stringify(input.benefits)}::jsonb, ${input.active}, ${actorId}::uuid)
      ON CONFLICT (level) DO UPDATE SET name_vi = EXCLUDED.name_vi, name_en = EXCLUDED.name_en, desc_vi = EXCLUDED.desc_vi, desc_en = EXCLUDED.desc_en,
        icon_asset = EXCLUDED.icon_asset, color = EXCLUDED.color, exp_required = EXCLUDED.exp_required, daily_silver = EXCLUDED.daily_silver,
        daily_gold = EXCLUDED.daily_gold, benefits = EXCLUDED.benefits, active = EXCLUDED.active, updated_by = EXCLUDED.updated_by, updated_at = now()`);
    const after = await vipLevels(tx, false);
    assertValidTable(after);
    await audit(tx, { actorId, action: before ? 'vip.level_update' : 'vip.level_create', targetType: 'vip_level', targetId: String(input.level), details: { before, after: input }, ip });
    return after;
  });
}

/** Deletes a level nobody is at (and that no grant points to). Level 1 is never deleted. */
export async function deleteVipLevel(db: Db, actorId: string, level: number, ip?: string): Promise<VipLevelView[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE vip_levels IN SHARE ROW EXCLUSIVE MODE`);
    if (level === 1) throw fail('vip_level_in_use', 'VIP 1 is the base level');
    const before = (await vipLevels(tx, false)).find((l) => l.level === level);
    if (!before) throw fail('not_found');
    const n = await playersAtLevel(tx, level);
    if (n > 0) throw fail('vip_level_in_use', `${n} player(s) are at VIP ${level}`);
    await tx.execute(sql`DELETE FROM vip_levels WHERE level = ${level}`);
    const after = await vipLevels(tx, false);
    assertValidTable(after);
    await audit(tx, { actorId, action: 'vip.level_delete', targetType: 'vip_level', targetId: String(level), details: { before }, ip });
    return after;
  });
}

// ---------------------------------------------------------------- per-player changes (vip.manage)

type Target = { id: string; uid: number; account_type: string; status: string };

/**
 * Who a staff member may change VIP / Charm for: real player accounts only, never Keyo Support;
 * the Owner account only by the Owner; never yourself (except the Owner); never a staff member
 * ranked at or above you.
 */
export async function assertStaffTarget(db: DbOrTx, actorId: string, uid: number): Promise<Target> {
  const [t] = await db.execute<Target>(sql`SELECT id, uid, account_type, status FROM users WHERE uid = ${uid}`);
  if (!t || t.status === 'deleted') throw fail('not_found');
  if (t.account_type !== 'player') throw fail('system_account');
  const [actor] = await db.execute<{ uid: number }>(sql`SELECT uid FROM users WHERE id = ${actorId}::uuid`);
  const actorIsOwner = Number(actor?.uid) === KEYO_OWNER_UID;
  if (Number(t.uid) === KEYO_OWNER_UID && !actorIsOwner) throw fail('protected_account');
  if (actorIsOwner) return t;
  if (t.id === actorId) throw fail('self_action_forbidden');
  const [actorRank, targetRank] = await Promise.all([rankOf(db, actorId), rankOf(db, t.id)]);
  if (targetRank >= actorRank) throw fail('forbidden');
  return t;
}

export async function adjustVip(db: Db, actorId: string, uid: number, input: VipAdjustInput, ip?: string): Promise<{ status: VipStatusView; userId: string; replayed: boolean }> {
  const target = await assertStaffTarget(db, actorId, uid);
  const { replayed } = await runOnce(db, input.idempotencyKey, actorId, 'vip.adjust', { uid, ...input }, async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${target.id}::uuid FOR UPDATE`);
    await tx.execute(sql`INSERT INTO vip_progress (user_id) VALUES (${target.id}::uuid) ON CONFLICT DO NOTHING`);
    const before = await progressRow(tx, target.id, true);
    const oldExp = Number(before.exp ?? 0);
    let newExp = oldExp;
    let until: Date | null = null;
    if (input.action === 'exp_add') newExp = oldExp + input.amount;
    if (input.action === 'exp_remove') newExp = Math.max(0, oldExp - input.amount);
    if (input.action === 'exp_add' || input.action === 'exp_remove') {
      await tx.execute(sql`UPDATE vip_progress SET exp = ${newExp}, updated_at = now() WHERE user_id = ${target.id}::uuid`);
    } else if (input.action === 'grant') {
      const [lvl] = await tx.execute(sql`SELECT 1 FROM vip_levels WHERE level = ${input.level}`);
      if (!lvl) throw fail('not_found');
      until = input.days ? new Date(Date.now() + input.days * 86_400_000) : null;
      await tx.execute(sql`
        UPDATE vip_progress SET override_level = ${input.level}, override_until = ${until ? until.toISOString() : null}::timestamptz,
          override_reason = ${input.reason}, override_by = ${actorId}::uuid, updated_at = now()
        WHERE user_id = ${target.id}::uuid`);
    } else {
      await tx.execute(sql`
        UPDATE vip_progress SET override_level = NULL, override_until = NULL, override_reason = NULL, override_by = NULL, updated_at = now()
        WHERE user_id = ${target.id}::uuid`);
    }
    const after = await progressRow(tx, target.id);
    await tx.execute(sql`
      INSERT INTO vip_events (user_id, actor_id, kind, exp_delta, old_exp, new_exp, old_level, new_level, override_until, reason)
      VALUES (${target.id}::uuid, ${actorId}::uuid, ${input.action}, ${newExp - oldExp}, ${oldExp}, ${newExp}, ${Number(before.level)}, ${Number(after.level)},
        ${until ? until.toISOString() : null}::timestamptz, ${input.reason})`);
    await audit(tx, {
      actorId,
      action: `vip.${input.action}`,
      targetType: 'user',
      targetId: uid,
      details: { oldExp, newExp, oldLevel: Number(before.level), newLevel: Number(after.level), until: until?.toISOString() ?? null, reason: input.reason, idempotencyKey: input.idempotencyKey },
      ip,
    });
    return { done: true };
  });
  return { status: await vipStatus(db, target.id), userId: target.id, replayed };
}

export async function staffVipView(db: Db, uid: number) {
  const [u] = await db.execute<{ id: string; uid: number; display_name: string }>(sql`SELECT id, uid, display_name FROM users WHERE uid = ${uid} AND status <> 'deleted'`);
  if (!u) throw fail('not_found');
  const events = await db.execute<{
    id: string;
    kind: VipEventView['kind'];
    exp_delta: string;
    old_exp: string;
    new_exp: string;
    old_level: number;
    new_level: number;
    override_until: string | null;
    reason: string;
    created_at: string;
    actor_uid: number | null;
    actor_name: string | null;
  }>(sql`
    SELECT e.id, e.kind, e.exp_delta, e.old_exp, e.new_exp, e.old_level, e.new_level, e.override_until, e.reason, e.created_at, a.uid AS actor_uid, a.display_name AS actor_name
    FROM vip_events e LEFT JOIN users a ON a.id = e.actor_id WHERE e.user_id = ${u.id}::uuid ORDER BY e.id DESC LIMIT 100`);
  return {
    uid: Number(u.uid),
    displayName: u.display_name,
    status: await vipStatus(db, u.id),
    events: events.map(
      (e): VipEventView => ({
        id: Number(e.id),
        kind: e.kind,
        expDelta: Number(e.exp_delta),
        oldExp: Number(e.old_exp),
        newExp: Number(e.new_exp),
        oldLevel: Number(e.old_level),
        newLevel: Number(e.new_level),
        overrideUntil: e.override_until ? new Date(e.override_until).toISOString() : null,
        reason: e.reason,
        actor: e.actor_uid === null ? null : { uid: Number(e.actor_uid), displayName: e.actor_name! },
        createdAt: new Date(e.created_at).toISOString(),
      }),
    ),
  };
}
