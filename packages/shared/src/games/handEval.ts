import { cardRank, cardSuit, type Card } from './cards';

/** Card value for poker comparisons: 2…10, J=11, Q=12, K=13, A=14. */
export function rankValue(card: Card): number {
  const r = cardRank(card);
  if (r === 'A') return 14;
  if (r === 'K') return 13;
  if (r === 'Q') return 12;
  if (r === 'J') return 11;
  return Number(r);
}

export const POKER_CATEGORIES = ['high_card', 'pair', 'two_pair', 'trips', 'straight', 'flush', 'full_house', 'quads', 'straight_flush'] as const;
export type PokerCategory = (typeof POKER_CATEGORIES)[number];

export interface HandValue {
  category: string;
  /** Lexicographic score: higher wins. First entry is the category index. */
  score: number[];
  /** The cards that make the hand (5 for poker, 3 for Liêng). */
  cards: Card[];
}

export function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Value of exactly five cards under standard poker rules (A plays high or in A-2-3-4-5). */
export function evaluateFive(cards: Card[]): HandValue {
  const values = cards.map(rankValue).sort((a, b) => b - a);
  const flush = new Set(cards.map(cardSuit)).size === 1;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  // Groups: by count desc, then value desc.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const unique = [...new Set(values)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0]! - unique[4]! === 4) straightHigh = unique[0]!;
    else if (unique.join(',') === '14,5,4,3,2') straightHigh = 5; // wheel
  }
  const cat = (c: PokerCategory) => POKER_CATEGORIES.indexOf(c);
  let category: PokerCategory;
  let score: number[];
  if (straightHigh && flush) [category, score] = ['straight_flush', [cat('straight_flush'), straightHigh]];
  else if (groups[0]![1] === 4) [category, score] = ['quads', [cat('quads'), groups[0]![0], groups[1]![0]]];
  else if (groups[0]![1] === 3 && groups[1]![1] === 2) [category, score] = ['full_house', [cat('full_house'), groups[0]![0], groups[1]![0]]];
  else if (flush) [category, score] = ['flush', [cat('flush'), ...values]];
  else if (straightHigh) [category, score] = ['straight', [cat('straight'), straightHigh]];
  else if (groups[0]![1] === 3) [category, score] = ['trips', [cat('trips'), groups[0]![0], ...groups.slice(1).map((g) => g[0])]];
  else if (groups[0]![1] === 2 && groups[1]![1] === 2) [category, score] = ['two_pair', [cat('two_pair'), groups[0]![0], groups[1]![0], groups[2]![0]]];
  else if (groups[0]![1] === 2) [category, score] = ['pair', [cat('pair'), groups[0]![0], ...groups.slice(1).map((g) => g[0])]];
  else [category, score] = ['high_card', [cat('high_card'), ...values]];
  return { category, score, cards };
}

/** Best five-card hand out of 5–7 cards. */
export function bestPokerHand(cards: Card[]): HandValue {
  if (cards.length < 5) throw new Error('need at least 5 cards');
  let best: HandValue | null = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const v = evaluateFive([cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!]);
            if (!best || compareScores(v.score, best.score) > 0) best = v;
          }
  return best!;
}

/**
 * Strength of a partial visible hand (Xì Tố up-cards: 1–4 cards), used only to decide who acts
 * first on each street: pairs/trips/quads beat high cards, then values.
 */
export function visibleStrength(cards: Card[]): number[] {
  const values = cards.map(rankValue).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups[0]![1] === 4 ? 4 : groups[0]![1] === 3 ? 3 : groups[0]![1] === 2 && groups[1]?.[1] === 2 ? 2.5 : groups[0]![1] === 2 ? 2 : 1;
  return [shape, ...groups.flatMap(([v, c]) => Array(c).fill(v) as number[])];
}

// ---------------------------------------------------------------- Liêng

/** Suit order used to break Liêng ties: ♥ > ♦ > ♣ > ♠. */
const LIENG_SUIT: Record<string, number> = { H: 4, D: 3, C: 2, S: 1 };
export const LIENG_CATEGORIES = ['diem', 'anh', 'lieng', 'sap'] as const;
export type LiengCategory = (typeof LIENG_CATEGORIES)[number];

/** Liêng high-card order: A > K > Q > J > 10 … 2, then suit. */
const liengHigh = (c: Card) => rankValue(c) * 10 + LIENG_SUIT[cardSuit(c)]!;
/** Points: A = 1, 2–9 face value, 10/J/Q/K = 0 (sum modulo 10). */
const liengPoint = (c: Card) => {
  const r = cardRank(c);
  if (r === 'A') return 1;
  if (r === '10' || r === 'J' || r === 'Q' || r === 'K') return 0;
  return Number(r);
};

/**
 * Liêng (3 cards). Categories, strongest first:
 * - Sáp: three of a kind (Sáp A highest);
 * - Liêng: three consecutive ranks, A-2-3 lowest … Q-K-A highest (K-A-2 is not a Liêng);
 * - Ảnh: three face cards (J, Q, K);
 * - Điểm: sum of points modulo 10 (A = 1, 10/J/Q/K = 0).
 * Ties: highest card (A > K > … > 2), then its suit ♥ > ♦ > ♣ > ♠.
 */
export function evaluateLieng(cards: Card[]): HandValue {
  if (cards.length !== 3) throw new Error('Liêng needs 3 cards');
  const highs = cards.map(liengHigh).sort((a, b) => b - a);
  const ranks = cards.map(rankValue).sort((a, b) => a - b);
  const cat = (c: LiengCategory) => LIENG_CATEGORIES.indexOf(c);
  if (ranks[0] === ranks[2]) return { category: 'sap', score: [cat('sap'), ranks[0]!], cards };
  // Straights with A low (A-2-3) use A = 1.
  const low = cards.map((c) => (cardRank(c) === 'A' ? 1 : rankValue(c))).sort((a, b) => a - b);
  const isRun = (r: number[]) => r[1] === r[0]! + 1 && r[2] === r[1]! + 1;
  if (isRun(ranks)) {
    const top = cards.find((c) => rankValue(c) === ranks[2])!;
    return { category: 'lieng', score: [cat('lieng'), ranks[2]!, LIENG_SUIT[cardSuit(top)]!], cards };
  }
  if (isRun(low) && low[0] === 1) {
    const top = cards.find((c) => cardRank(c) === '3')!;
    return { category: 'lieng', score: [cat('lieng'), 3, LIENG_SUIT[cardSuit(top)]!], cards };
  }
  if (cards.every((c) => ['J', 'Q', 'K'].includes(cardRank(c)))) return { category: 'anh', score: [cat('anh'), ...highs], cards };
  const points = cards.reduce((s, c) => s + liengPoint(c), 0) % 10;
  return { category: 'diem', score: [cat('diem'), points, ...highs], cards };
}
