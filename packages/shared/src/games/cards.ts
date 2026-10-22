import { type Rng, randInt } from './rng';

export const SUITS = ['S', 'H', 'D', 'C'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
/** Encoded as rank + suit, e.g. "AS", "10H". */
export type Card = `${Rank}${Suit}`;

export function cardRank(card: Card): Rank {
  return card.slice(0, -1) as Rank;
}

export function cardSuit(card: Card): Suit {
  return card.slice(-1) as Suit;
}

export function createShoe(decks: number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) shoe.push(`${r}${s}`);
  return shoe;
}

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
