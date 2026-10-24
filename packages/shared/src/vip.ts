/**
 * VIP table from the owner's specification (thresholds and total daily rewards).
 * Presentation data only — the VIP system itself is not implemented on the server yet.
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

/** Level reached with the given EXP plus progress towards the next level (EXP keeps growing past VIP 15). */
export function vipProgress(exp: number) {
  let current = VIP_LEVELS[0]!;
  for (const lvl of VIP_LEVELS) if (exp >= lvl.exp) current = lvl;
  const next = VIP_LEVELS[current.level] ?? null;
  const ratio = next ? (exp - current.exp) / (next.exp - current.exp) : 1;
  return { level: current.level, current, next, ratio: Math.min(1, Math.max(0, ratio)), toNext: next ? next.exp - exp : 0 };
}
