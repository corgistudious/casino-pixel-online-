import { type Card, cardRank, createShoe, shuffle } from './cards';
import type { Rng } from './rng';

export const BLACKJACK_DECKS = 6;
/** A round can be split into at most this many hands (three splits). */
export const BLACKJACK_MAX_HANDS = 4;

export type BlackjackAction = 'hit' | 'stand' | 'double' | 'split';
export type BlackjackOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'dealer_blackjack';

/**
 * Rules: 6 decks, dealer stands on all 17s, dealer checks for blackjack before the player acts
 * (a dealer natural ends the round at once), natural pays 3:2. Split any two cards of equal value
 * up to 4 hands; split aces take one card each and cannot be split again; double on any first two
 * cards, also after a split (not on split aces); 21 after a split is not a natural and pays 1:1.
 * No insurance and no surrender.
 */
export interface BlackjackHand {
  cards: Card[];
  /** Stake of this hand before doubling. */
  bet: number;
  doubled: boolean;
  done: boolean;
  /** Created by a split (a two-card 21 is then not a natural). */
  split: boolean;
  splitAces: boolean;
  outcome: BlackjackOutcome | null;
  payout: number;
}

/** Full server-side state. Contains the remaining shoe and must never be sent to clients. */
export interface BlackjackState {
  shoe: Card[];
  dealer: Card[];
  hands: BlackjackHand[];
  /** Index of the hand the player is acting on. */
  active: number;
  /** Opening stake. */
  bet: number;
  phase: 'player' | 'finished';
  /** Summary over all hands (the only hand when there was no split). */
  outcome: BlackjackOutcome | null;
  /** Total returned to the player, stakes included. */
  payout: number;
}

/** State saved by the single-hand version (rounds that were active during the upgrade). */
interface LegacyBlackjackState {
  shoe: Card[];
  player: Card[];
  dealer: Card[];
  bet: number;
  doubled: boolean;
  phase: 'player' | 'finished';
  outcome: BlackjackOutcome | null;
  payout: number;
}

export interface BlackjackHandView {
  cards: Card[];
  total: number;
  soft: boolean;
  bet: number;
  doubled: boolean;
  done: boolean;
  outcome: BlackjackOutcome | null;
  payout: number;
}

/** What a client is allowed to see. */
export interface BlackjackView {
  hands: BlackjackHandView[];
  active: number;
  /** Cards and total of the active hand (kept for older clients). */
  player: Card[];
  playerTotal: number;
  /** While the player acts only the up-card is revealed; the hole card is null. */
  dealer: (Card | null)[];
  dealerTotal: number | null;
  /** Total staked over all hands, doubles included. */
  bet: number;
  doubled: boolean;
  phase: 'player' | 'finished';
  outcome: BlackjackOutcome | null;
  payout: number;
  canDouble: boolean;
  canSplit: boolean;
}

export function handValue(cards: readonly Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = cardRank(c);
    if (r === 'A') {
      aces++;
      total += 11;
    } else if (r === 'J' || r === 'Q' || r === 'K') total += 10;
    else total += Number(r);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

const cardValue = (c: Card) => {
  const r = cardRank(c);
  return r === 'A' ? 11 : r === 'J' || r === 'Q' || r === 'K' ? 10 : Number(r);
};

const newHand = (cards: Card[], bet: number, split = false, splitAces = false): BlackjackHand => ({
  cards,
  bet,
  doubled: false,
  done: false,
  split,
  splitAces,
  outcome: null,
  payout: 0,
});

/** Upgrades a state saved by the single-hand version; current states pass through unchanged. */
export function normalizeBlackjack(raw: BlackjackState | LegacyBlackjackState): BlackjackState {
  if ('hands' in raw && Array.isArray(raw.hands)) return raw;
  const legacy = raw as LegacyBlackjackState;
  const hand = { ...newHand(legacy.player.slice(), legacy.bet), doubled: legacy.doubled, done: legacy.phase === 'finished', outcome: legacy.outcome, payout: legacy.payout };
  return { shoe: legacy.shoe, dealer: legacy.dealer, hands: [hand], active: 0, bet: legacy.bet, phase: legacy.phase, outcome: legacy.outcome, payout: legacy.payout };
}

const stakeOf = (h: BlackjackHand) => h.bet * (h.doubled ? 2 : 1);
/** Everything the player has staked in the round so far. */
export function totalStake(state: BlackjackState): number {
  return state.hands.reduce((s, h) => s + stakeOf(h), 0);
}

function draw(state: BlackjackState): Card {
  const card = state.shoe.pop();
  if (!card) throw new Error('shoe exhausted');
  return card;
}

function clone(state: BlackjackState): BlackjackState {
  return { ...state, shoe: state.shoe.slice(), dealer: state.dealer.slice(), hands: state.hands.map((h) => ({ ...h, cards: h.cards.slice() })) };
}

/** Dealer plays (unless every hand busted) and each hand is settled. */
function settle(state: BlackjackState): BlackjackState {
  const live = state.hands.some((h) => handValue(h.cards).total <= 21);
  if (live) while (handValue(state.dealer).total < 17) state.dealer.push(draw(state));
  const d = handValue(state.dealer).total;
  for (const h of state.hands) {
    const p = handValue(h.cards).total;
    const stake = stakeOf(h);
    if (p > 21) [h.outcome, h.payout] = ['bust', 0];
    else if (d > 21 || p > d) [h.outcome, h.payout] = ['win', stake * 2];
    else if (p === d) [h.outcome, h.payout] = ['push', stake];
    else [h.outcome, h.payout] = ['lose', 0];
    h.done = true;
  }
  state.payout = state.hands.reduce((s, h) => s + h.payout, 0);
  if (state.hands.length === 1) state.outcome = state.hands[0]!.outcome;
  else {
    const stake = totalStake(state);
    state.outcome = state.hands.every((h) => h.outcome === 'bust') ? 'bust' : state.payout > stake ? 'win' : state.payout === stake ? 'push' : 'lose';
  }
  state.phase = 'finished';
  return state;
}

/** Marks finished hands done and moves to the next open hand; settles once none are left. */
function advance(state: BlackjackState): BlackjackState {
  for (let i = state.active; i < state.hands.length; i++) {
    const h = state.hands[i]!;
    if (!h.done && handValue(h.cards).total >= 21) h.done = true;
    if (!h.done) {
      state.active = i;
      return state;
    }
  }
  return settle(state);
}

export function startBlackjack(rng: Rng, bet: number): BlackjackState {
  const state: BlackjackState = {
    shoe: shuffle(rng, createShoe(BLACKJACK_DECKS)),
    dealer: [],
    hands: [newHand([], bet)],
    active: 0,
    bet,
    phase: 'player',
    outcome: null,
    payout: 0,
  };
  const hand = state.hands[0]!;
  hand.cards.push(draw(state));
  state.dealer.push(draw(state));
  hand.cards.push(draw(state));
  state.dealer.push(draw(state));

  const pBj = isBlackjack(hand.cards);
  const dBj = isBlackjack(state.dealer);
  const end = (outcome: BlackjackOutcome, payout: number): BlackjackState => {
    Object.assign(hand, { outcome, payout, done: true });
    return { ...state, phase: 'finished', outcome, payout };
  };
  if (pBj && dBj) return end('push', bet);
  if (pBj) return end('blackjack', bet + Math.floor((bet * 3) / 2));
  if (dBj) return end('dealer_blackjack', 0);
  return state;
}

function activeHand(state: BlackjackState): BlackjackHand | undefined {
  return state.phase === 'player' ? state.hands[state.active] : undefined;
}

export function canDouble(raw: BlackjackState): boolean {
  const h = activeHand(normalizeBlackjack(raw));
  return !!h && !h.done && h.cards.length === 2 && !h.doubled && !h.splitAces;
}

export function canSplit(raw: BlackjackState): boolean {
  const state = normalizeBlackjack(raw);
  const h = activeHand(state);
  return !!h && !h.done && h.cards.length === 2 && !h.splitAces && state.hands.length < BLACKJACK_MAX_HANDS && cardValue(h.cards[0]!) === cardValue(h.cards[1]!);
}

/** Extra stake the action takes from the wallet (debit it before applying the action). */
export function extraStake(raw: BlackjackState, action: BlackjackAction): number {
  const h = activeHand(normalizeBlackjack(raw));
  return h && (action === 'double' || action === 'split') ? h.bet : 0;
}

/** Applies a player action to the active hand. Double and split require the caller to debit `extraStake` first. */
export function applyBlackjackAction(prev: BlackjackState, action: BlackjackAction): BlackjackState {
  if (prev.phase !== 'player') throw new Error('round already finished');
  const state = clone(normalizeBlackjack(prev));
  const hand = state.hands[state.active]!;
  switch (action) {
    case 'hit':
      if (hand.splitAces) throw new Error('split aces take one card');
      hand.cards.push(draw(state));
      return advance(state);
    case 'stand':
      hand.done = true;
      return advance(state);
    case 'double':
      if (!canDouble(state)) throw new Error('cannot double now');
      hand.doubled = true;
      hand.cards.push(draw(state));
      hand.done = true;
      return advance(state);
    case 'split': {
      if (!canSplit(state)) throw new Error('cannot split now');
      const aces = cardRank(hand.cards[0]!) === 'A';
      const first = newHand([hand.cards[0]!, draw(state)], hand.bet, true, aces);
      const second = newHand([hand.cards[1]!, draw(state)], hand.bet, true, aces);
      if (aces) first.done = second.done = true;
      state.hands.splice(state.active, 1, first, second);
      return advance(state);
    }
  }
}

export function blackjackView(raw: BlackjackState): BlackjackView {
  const state = normalizeBlackjack(raw);
  const hidden = state.phase === 'player';
  const hands = state.hands.map((h) => ({ cards: h.cards.slice(), ...handValue(h.cards), bet: h.bet, doubled: h.doubled, done: h.done, outcome: h.outcome, payout: h.payout }));
  const active = Math.min(state.active, hands.length - 1);
  return {
    hands,
    active,
    player: hands[active]!.cards,
    playerTotal: hands[active]!.total,
    dealer: hidden ? [state.dealer[0]!, null] : state.dealer.slice(),
    dealerTotal: hidden ? null : handValue(state.dealer).total,
    bet: totalStake(state),
    doubled: hands[active]!.doubled,
    phase: state.phase,
    outcome: state.outcome,
    payout: state.payout,
    canDouble: canDouble(state),
    canSplit: canSplit(state),
  };
}
