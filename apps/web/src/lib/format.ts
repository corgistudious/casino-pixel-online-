export function formatChips(n: number, locale = 'vi'): string {
  return new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US').format(n);
}

const COMPACT_UNITS: [number, string][] = [
  [1_000_000_000, 'B'],
  [1_000_000, 'M'],
  [1_000, 'K'],
];

/**
 * Short chip amount: 1.5K, 25K, 1M. Rounds to one decimal FIRST and moves to the next unit when the
 * rounded value reaches 1000 (999 999 → "1M", not "1000K"; 999 950 000 → "1B"). Below 1000 (and
 * negative amounts) the number is shown as is, as before.
 */
export function compactChips(n: number): string {
  for (let i = 0; i < COMPACT_UNITS.length; i++) {
    const [value, suffix] = COMPACT_UNITS[i]!;
    if (n < value) continue;
    const rounded = +(n / value).toFixed(1);
    if (rounded >= 1000 && i > 0) {
      const [up, upSuffix] = COMPACT_UNITS[i - 1]!;
      return `${+(n / up).toFixed(1)}${upSuffix}`;
    }
    return `${rounded}${suffix}`;
  }
  return String(n);
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

/** Chip denominations offered by the chip selector. */
export const CHIP_VALUES = [10, 50, 100, 500, 1_000, 5_000] as const;
