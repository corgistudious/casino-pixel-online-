import type { RouletteBet, SicBoBet } from '@casino/shared';

/** Stable key used to stack chips on the same table spot. */
export function rouletteKey(b: Pick<RouletteBet, 'kind' | 'value'>): string {
  return b.value === undefined ? b.kind : `${b.kind}:${b.value}`;
}

export function sicBoKey(b: Pick<SicBoBet, 'kind' | 'value'>): string {
  return b.value === undefined ? b.kind : `${b.kind}:${b.value}`;
}

export function parseKey<K extends string>(key: string): { kind: K; value?: number } {
  const [kind, value] = key.split(':');
  return value === undefined ? { kind: kind as K } : { kind: kind as K, value: Number(value) };
}

/** Adds a chip to a spot. Bets are kept as a key → amount map. */
export function addChip(bets: Record<string, number>, key: string, amount: number): Record<string, number> {
  return { ...bets, [key]: (bets[key] ?? 0) + amount };
}

export function totalOf(bets: Record<string, number>): number {
  return Object.values(bets).reduce((a, b) => a + b, 0);
}

export function toBetList<K extends string>(bets: Record<string, number>): { kind: K; value?: number; amount: number }[] {
  return Object.entries(bets)
    .filter(([, amount]) => amount > 0)
    .map(([key, amount]) => ({ ...parseKey<K>(key), amount }));
}
