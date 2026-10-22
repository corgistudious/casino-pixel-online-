import { type Card, cardRank, createShoe, shuffle } from './cards';
import type { Rng } from './rng';

export const BLACKJACK_DECKS = 6;

export type BlackjackAction = 'hit' | 'stand' | 'double';
export type BlackjackOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'dealer_blackjack';

/** Full server-side state. Contains the remaining shoe and must never be sent to clients. */
export interface BlackjackState {
  shoe: Card[];
  player: Card[];
  dealer: Card[];
  bet: number;
  doubled: boolean;
  phase: 'player' | 'finished';
  outcome: BlackjackOutcome | null;
  payout: number;
}

/** What a client is allowed to see. */
export interface BlackjackView {
  player: Card[];
  /** While the player acts only the up-card is revealed; the hole card is null. */
  dealer: (Card | null)[];
  playerTotal: number;
  dealerTotal: number | null;
  bet: number;
  doubled: boolean;
  phase: 'player' | 'finished';
  outcome: BlackjackOutcome | null;
  payout: number;
  canDouble: boolean;
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

function draw(state: BlackjackState): Card {
  const card = state.shoe.pop();
  if (!card) throw new Error('shoe exhausted');
  return card;
}

/** Dealer draws to 17 and stands on all 17s, then the hand is settled. */
function finish(state: BlackjackState): BlackjackState {
  const p = handValue(state.player).total;
  if (p > 21) {
    return { ...state, phase: 'finished', outcome: 'bust', payout: 0 };
  }
  while (handValue(state.dealer).total < 17) state.dealer.push(draw(state));
  const d = handValue(state.dealer).total;
  const stake = state.bet * (state.doubled ? 2 : 1);
  let outcome: BlackjackOutcome;
  let payout: number;
  if (d > 21 || p > d) {
    outcome = 'win';
    payout = stake * 2;
  } else if (p === d) {
    outcome = 'push';
    payout = stake;
  } else {
    outcome = 'lose';
    payout = 0;
  }
  return { ...state, phase: 'finished', outcome, payout };
}

export function startBlackjack(rng: Rng, bet: number): BlackjackState {
  const state: BlackjackState = {
    shoe: shuffle(rng, createShoe(BLACKJACK_DECKS)),
    player: [],
    dealer: [],
    bet,
    doubled: false,
    phase: 'player',
    outcome: null,
    payout: 0,
  };
  state.player.push(draw(state));
  state.dealer.push(draw(state));
  state.player.push(draw(state));
  state.dealer.push(draw(state));

  const pBj = isBlackjack(state.player);
  const dBj = isBlackjack(state.dealer);
  if (pBj && dBj) return { ...state, phase: 'finished', outcome: 'push', payout: bet };
  if (pBj) return { ...state, phase: 'finished', outcome: 'blackjack', payout: bet + Math.floor((bet * 3) / 2) };
  if (dBj) return { ...state, phase: 'finished', outcome: 'dealer_blackjack', payout: 0 };
  return state;
}

export function canDouble(state: BlackjackState): boolean {
  return state.phase === 'player' && state.player.length === 2 && !state.doubled;
}

/** Applies a player action. Doubling requires the caller to debit an extra `bet` first. */
export function applyBlackjackAction(prev: BlackjackState, action: BlackjackAction): BlackjackState {
  if (prev.phase !== 'player') throw new Error('round already finished');
  const state: BlackjackState = { ...prev, shoe: prev.shoe.slice(), player: prev.player.slice(), dealer: prev.dealer.slice() };
  switch (action) {
    case 'hit': {
      state.player.push(draw(state));
      const total = handValue(state.player).total;
      if (total > 21) return finish(state);
      if (total === 21) return finish(state);
      return state;
    }
    case 'stand':
      return finish(state);
    case 'double': {
      if (!canDouble(state)) throw new Error('cannot double now');
      state.doubled = true;
      state.player.push(draw(state));
      return finish(state);
    }
  }
}

export function blackjackView(state: BlackjackState): BlackjackView {
  const hidden = state.phase === 'player';
  return {
    player: state.player.slice(),
    dealer: hidden ? [state.dealer[0]!, null] : state.dealer.slice(),
    playerTotal: handValue(state.player).total,
    dealerTotal: hidden ? null : handValue(state.dealer).total,
    bet: state.bet,
    doubled: state.doubled,
    phase: state.phase,
    outcome: state.outcome,
    payout: state.payout,
    canDouble: canDouble(state),
  };
}
