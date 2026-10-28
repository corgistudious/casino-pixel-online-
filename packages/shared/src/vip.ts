import { z } from 'zod';

/**
 * VIP levels. Since migration 0029 the live table is `vip_levels` (edited in the admin panel);
 * VIP_LEVELS below is the Owner's original table, used to seed that table and as a fallback for
 * screens rendered before the levels have loaded. Nothing creates new levels automatically.
 */
export interface VipLevel {
  level: number;
  /** Total VIP EXP required to reach this level. */
  exp: number;
  daily: { silver: number; gold: number };
}

export const VIP_LEVELS: readonly VipLevel[] = [
  { level: 1, exp: 0, daily: { silver: 5_000, gold: 10 } },
  { level: 2, exp: 500, daily: { silver: 6_000, gold: 15 } },
  { level: 3, exp: 1_500, daily: { silver: 7_500, gold: 20 } },
  { level: 4, exp: 3_000, daily: { silver: 9_000, gold: 30 } },
  { level: 5, exp: 5_000, daily: { silver: 11_000, gold: 45 } },
  { level: 6, exp: 8_000, daily: { silver: 13_500, gold: 60 } },
  { level: 7, exp: 12_000, daily: { silver: 16_000, gold: 80 } },
  { level: 8, exp: 18_000, daily: { silver: 19_000, gold: 110 } },
  { level: 9, exp: 26_000, daily: { silver: 23_000, gold: 150 } },
  { level: 10, exp: 38_000, daily: { silver: 28_000, gold: 200 } },
  { level: 11, exp: 55_000, daily: { silver: 34_000, gold: 270 } },
  { level: 12, exp: 78_000, daily: { silver: 41_000, gold: 350 } },
  { level: 13, exp: 110_000, daily: { silver: 50_000, gold: 450 } },
  { level: 14, exp: 155_000, daily: { silver: 62_000, gold: 600 } },
  { level: 15, exp: 220_000, daily: { silver: 80_000, gold: 800 } },
];

export const VIP_MAX = VIP_LEVELS.length;

/**
 * Level reached with the given EXP plus progress towards the next level (EXP keeps growing past the
 * top level). `levels` are the active levels; defaults to the original table.
 */
export function vipProgress<L extends VipLevel>(exp: number, levels: readonly L[] = VIP_LEVELS as unknown as readonly L[]) {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  let current = sorted[0]!;
  for (const lvl of sorted) if (exp >= lvl.exp) current = lvl;
  const next = sorted.find((l) => l.level > current.level && l.exp > current.exp) ?? null;
  const ratio = next ? (exp - current.exp) / (next.exp - current.exp) : 1;
  return { level: current.level, current, next, ratio: Math.min(1, Math.max(0, ratio)), toNext: next ? Math.max(0, next.exp - exp) : 0 };
}

/** Badge look by level: 1–3 silver, 4–6 gold, 7–9 platinum, 10–12 diamond, 13+ royal/legend. */
export const VIP_TIERS = ['silver', 'gold', 'platinum', 'diamond', 'royal'] as const;
export type VipTier = (typeof VIP_TIERS)[number];
export function vipTierOf(level: number): VipTier {
  if (level >= 13) return 'royal';
  if (level >= 10) return 'diamond';
  if (level >= 7) return 'platinum';
  if (level >= 4) return 'gold';
  return 'silver';
}

export interface LocalizedText {
  vi: string;
  en: string;
}

/** A VIP level as configured (public: everyone sees the table). */
export interface VipLevelView extends VipLevel {
  name: LocalizedText;
  description: LocalizedText;
  color: string;
  iconUrl: string | null;
  benefits: LocalizedText[];
  active: boolean;
}

/** My VIP status. `level` is the effective level (a staff grant wins until it ends). */
export interface VipStatusView {
  level: number;
  expLevel: number;
  exp: number;
  current: VipLevelView;
  next: VipLevelView | null;
  ratio: number;
  toNext: number;
  lastClaimDate: string | null;
  override: { level: number; until: string | null } | null;
}

const text = (max: number, min = 0) => z.string().trim().min(min).max(max);
export const vipLevelSchema = z.object({
  level: z.number().int().min(1).max(999),
  name: z.object({ vi: text(40, 1), en: text(40, 1) }),
  description: z.object({ vi: text(500), en: text(500) }).default({ vi: '', en: '' }),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  iconAsset: z.string().max(80).nullable().default(null),
  exp: z.number().int().min(0).max(1_000_000_000),
  daily: z.object({ silver: z.number().int().min(0).max(10_000_000), gold: z.number().int().min(0).max(100_000) }),
  benefits: z.array(z.object({ vi: text(120, 1), en: text(120, 1) })).max(12).default([]),
  active: z.boolean().default(true),
});
export type VipLevelInput = z.infer<typeof vipLevelSchema>;

/** Manual VIP change for one player. Always needs a reason; audited. */
export const vipAdjustSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('exp_add'), amount: z.number().int().min(1).max(10_000_000), reason: text(500, 3), idempotencyKey: z.string().uuid() }),
  z.object({ action: z.literal('exp_remove'), amount: z.number().int().min(1).max(10_000_000), reason: text(500, 3), idempotencyKey: z.string().uuid() }),
  z.object({
    action: z.literal('grant'),
    level: z.number().int().min(1).max(999),
    /** Days until the level falls back to the EXP level; omitted = until revoked. */
    days: z.number().int().min(1).max(3650).optional(),
    reason: text(500, 3),
    idempotencyKey: z.string().uuid(),
  }),
  z.object({ action: z.literal('revoke'), reason: text(500, 3), idempotencyKey: z.string().uuid() }),
]);
export type VipAdjustInput = z.infer<typeof vipAdjustSchema>;

export interface VipEventView {
  id: number;
  kind: 'exp_add' | 'exp_remove' | 'grant' | 'revoke';
  expDelta: number;
  oldExp: number;
  newExp: number;
  oldLevel: number;
  newLevel: number;
  overrideUntil: string | null;
  reason: string;
  actor: { uid: number; displayName: string } | null;
  createdAt: string;
}

export interface StaffVipView {
  uid: number;
  displayName: string;
  status: VipStatusView;
  events: VipEventView[];
}
