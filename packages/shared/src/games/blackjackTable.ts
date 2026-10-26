import { BLACKJACK_MAX_HANDS, cardValue, handValue, insuranceMax, isBlackjack, newHand, stakeOf, type BlackjackHand, type BlackjackOutcome } from './blackjack';
import { cardRank, type Card } from './cards';

/**
 * Shared Blackjack table: up to 5 seats, every player against one dealer and one shoe.
 *
 * Round: betting → (insurance, when the dealer shows an Ace) → playing (seat order, one turn at a
 * time) → dealer → done. Same hand rules as solo Blackjack: natural 3:2, dealer stands on 17,
 * split up to 4 hands (split aces one card each), double on two cards, insurance up to half the
 * bet paying 2:1. Pure functions: the server persists the state, debits stakes before applying
 * an action, credits `payout` at settlement and drives the deadlines.
 */

export const BJT_SEATS = 5;
export const BJT_TIMING = { betMs: 15_000, insuranceMs: 10_000, turnMs: 15_000, breakMs: 4_000 } as const;

export type BjtPhase = 'betting' | 'insurance' | 'playing' | 'done';
export type BjtAction = 'hit' | 'stand' | 'double' | 'split' | 'insurance';

export interface BjtPlayer {
  seat: number;
  userId: string;
  bet: number;
  hands: BlackjackHand[];
  active: number;
  /** Insurance decision: null while pending (insurance phase), else the amount (0 = declined). */
  insurance: number | null;
  insurancePayout: number;
  /** Every hand finished (stood, busted, natural, or the round settled). */
  done: boolean;
  /** Total returned at settlement (stakes included). */
  payout: number;
  /** Consecutive turns that ran out of time. */
  timeouts: number;
}

export interface BjtState {
  phase: BjtPhase;
  shoe: Card[];
  dealer: Card[];
  /** Players with a bet this round, in seat order. */
  players: BjtPlayer[];
  /** Index into `players` of the player to bjtAct (playing phase), else null. */
  turn: number | null;
}

export class BjtIllegal extends Error {}

const draw = (s: BjtState): Card => {
  const c = s.shoe.pop();
  if (!c) throw new Error('shoe exhausted');
  return c;
};

const clone = (s: BjtState): BjtState => ({
  ...s,
  shoe: s.shoe.slice(),
  dealer: s.dealer.slice(),
  players: s.players.map((p) => ({ ...p, hands: p.hands.map((h) => ({ ...h, cards: h.cards.slice() })) })),
});

export function bjtNewRound(shoe: Card[]): BjtState {
  return { phase: 'betting', shoe, dealer: [], players: [], turn: null };
}

export function bjtPlaceBet(prev: BjtState, seat: number, userId: string, bet: number): BjtState {
  if (prev.phase !== 'betting') throw new BjtIllegal('betting closed');
  if (prev.players.some((p) => p.seat === seat || p.userId === userId)) throw new BjtIllegal('already bet');
  const s = clone(prev);
  s.players.push({ seat, userId, bet, hands: [], active: 0, insurance: null, insurancePayout: 0, done: false, payout: 0, timeouts: 0 });
  s.players.sort((a, b) => a.seat - b.seat);
  return s;
}

/** Deals two cards to every bettor and the dealer (dealer's second card face down). */
export function bjtDeal(prev: BjtState): BjtState {
  if (prev.phase !== 'betting' || prev.players.length === 0) throw new BjtIllegal('nothing to deal');
  const s = clone(prev);
  for (let round = 0; round < 2; round++) {
    for (const p of s.players) {
      if (round === 0) p.hands = [newHand([], p.bet)];
      p.hands[0]!.cards.push(draw(s));
    }
    s.dealer.push(draw(s));
  }
  if (cardRank(s.dealer[0]!) === 'A') {
    s.phase = 'insurance';
    return s;
  }
  for (const p of s.players) p.insurance = 0;
  return peek(s);
}

/** Each player decides insurance independently (0 = no insurance). */
export function bjtInsure(prev: BjtState, seat: number, amount: number): BjtState {
  if (prev.phase !== 'insurance') throw new BjtIllegal('insurance not offered');
  const s = clone(prev);
  const p = s.players.find((x) => x.seat === seat);
  if (!p) throw new BjtIllegal('not in this round');
  if (p.insurance !== null) throw new BjtIllegal('already decided');
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > insuranceMax(p.bet)) throw new BjtIllegal('invalid insurance');
  p.insurance = amount;
  return s.players.every((x) => x.insurance !== null) ? peek(s) : s;
}

/** Insurance deadline passed: undecided players take no insurance. */
export function bjtCloseInsurance(prev: BjtState): BjtState {
  if (prev.phase !== 'insurance') throw new BjtIllegal('insurance not offered');
  const s = clone(prev);
  for (const p of s.players) if (p.insurance === null) p.insurance = 0;
  return peek(s);
}

/** Dealer checks for blackjack: settles everything on a dealer natural, else naturals pay and play starts. */
function peek(s: BjtState): BjtState {
  const dealerBj = isBlackjack(s.dealer);
  for (const p of s.players) {
    p.insurancePayout = dealerBj ? (p.insurance ?? 0) * 3 : 0;
    const h = p.hands[0]!;
    const natural = isBlackjack(h.cards);
    if (dealerBj) Object.assign(h, { outcome: natural ? 'push' : 'dealer_blackjack', payout: natural ? h.bet : 0, done: true });
    else if (natural) Object.assign(h, { outcome: 'blackjack', payout: h.bet + Math.floor((h.bet * 3) / 2), done: true });
    p.done = p.hands.every((x) => x.done);
  }
  if (dealerBj) return finish(s);
  s.phase = 'playing';
  return nextTurn(s, 0);
}

/** Moves the turn to the first unfinished player from `from`; plays the dealer when none is left. */
function nextTurn(s: BjtState, from: number): BjtState {
  for (let i = from; i < s.players.length; i++) {
    const p = s.players[i]!;
    if (!p.done) {
      // Skip hands already at 21 or bust.
      for (let h = p.active; h < p.hands.length; h++) {
        const hand = p.hands[h]!;
        if (!hand.done && handValue(hand.cards).total >= 21) hand.done = true;
        if (!hand.done) {
          p.active = h;
          s.turn = i;
          return s;
        }
      }
      p.done = true;
    }
  }
  s.turn = null;
  return dealerPlays(s);
}

function dealerPlays(s: BjtState): BjtState {
  const live = s.players.some((p) => p.hands.some((h) => h.outcome === null && handValue(h.cards).total <= 21));
  if (live) while (handValue(s.dealer).total < 17) s.dealer.push(draw(s));
  const d = handValue(s.dealer).total;
  for (const p of s.players)
    for (const h of p.hands) {
      if (h.outcome !== null) continue;
      const v = handValue(h.cards).total;
      const stake = stakeOf(h);
      const [outcome, payout]: [BlackjackOutcome, number] = v > 21 ? ['bust', 0] : d > 21 || v > d ? ['win', stake * 2] : v === d ? ['push', stake] : ['lose', 0];
      Object.assign(h, { outcome, payout, done: true });
    }
  return finish(s);
}

function finish(s: BjtState): BjtState {
  for (const p of s.players) {
    p.done = true;
    p.payout = p.hands.reduce((a, h) => a + h.payout, 0) + p.insurancePayout;
  }
  s.phase = 'done';
  s.turn = null;
  return s;
}

export function bjtCurrent(s: BjtState): BjtPlayer | null {
  return s.phase === 'playing' && s.turn !== null ? s.players[s.turn]! : null;
}

export function bjtCanDouble(s: BjtState, seat: number): boolean {
  const p = bjtCurrent(s);
  const h = p?.hands[p.active];
  return !!p && p.seat === seat && !!h && !h.done && h.cards.length === 2 && !h.doubled && !h.splitAces;
}

export function bjtCanSplit(s: BjtState, seat: number): boolean {
  const p = bjtCurrent(s);
  const h = p?.hands[p.active];
  return !!p && p.seat === seat && !!h && !h.done && h.cards.length === 2 && !h.splitAces && p.hands.length < BLACKJACK_MAX_HANDS && cardValue(h.cards[0]!) === cardValue(h.cards[1]!);
}

/** Extra stake an action takes from the player's wallet (debit it before applying). */
export function bjtExtraStake(s: BjtState, seat: number, action: BjtAction, amount = 0): number {
  if (action === 'insurance') return s.phase === 'insurance' ? amount : 0;
  const p = bjtCurrent(s);
  if (!p || p.seat !== seat) return 0;
  return action === 'double' || action === 'split' ? p.hands[p.active]!.bet : 0;
}

/** The acting player's move (hit / stand / double / split). */
export function bjtAct(prev: BjtState, seat: number, action: Exclude<BjtAction, 'insurance'>, timedOut = false): BjtState {
  const cur = bjtCurrent(prev);
  if (!cur || cur.seat !== seat) throw new BjtIllegal('not your turn');
  if (action === 'double' && !bjtCanDouble(prev, seat)) throw new BjtIllegal('cannot double');
  if (action === 'split' && !bjtCanSplit(prev, seat)) throw new BjtIllegal('cannot split');
  const s = clone(prev);
  const p = s.players[s.turn!]!;
  p.timeouts = timedOut ? p.timeouts + 1 : 0;
  const h = p.hands[p.active]!;
  switch (action) {
    case 'hit':
      if (h.splitAces) throw new BjtIllegal('split aces take one card');
      h.cards.push(draw(s));
      break;
    case 'stand':
      h.done = true;
      break;
    case 'double':
      h.doubled = true;
      h.cards.push(draw(s));
      h.done = true;
      break;
    case 'split': {
      const aces = cardRank(h.cards[0]!) === 'A';
      const a = newHand([h.cards[0]!, draw(s)], h.bet, true, aces);
      const b = newHand([h.cards[1]!, draw(s)], h.bet, true, aces);
      if (aces) a.done = b.done = true;
      p.hands.splice(p.active, 1, a, b);
      break;
    }
  }
  return nextTurn(s, s.turn!);
}

/** Turn deadline passed: the player stands. */
export function bjtTimeout(prev: BjtState): BjtState {
  const p = bjtCurrent(prev);
  if (!p) throw new BjtIllegal('no turn');
  return bjtAct(prev, p.seat, 'stand', true);
}

/** Everything a player has staked this round. */
export function bjtStake(p: BjtPlayer): number {
  const hands = p.hands.length ? p.hands.reduce((a, h) => a + stakeOf(h), 0) : p.bet;
  return hands + (p.insurance ?? 0);
}

// ---------------------------------------------------------------- views

export interface BjtHandView {
  cards: Card[];
  total: number;
  bet: number;
  doubled: boolean;
  done: boolean;
  outcome: BlackjackOutcome | null;
  payout: number;
}

export interface BjtPlayerView {
  seat: number;
  bet: number;
  hands: BjtHandView[];
  active: number;
  insurance: number | null;
  insurancePayout: number;
  payout: number;
  done: boolean;
}

export interface BjtRoundView {
  id: string;
  seq: number;
  phase: BjtPhase;
  /** Hole card hidden (null) until the round is settled. */
  dealer: (Card | null)[];
  dealerTotal: number | null;
  players: BjtPlayerView[];
  turnSeat: number | null;
  deadline: number | null;
  seedHash: string;
  serverSeed: string | null;
}

export function bjtView(s: BjtState, meta: { id: string; seq: number; deadline: number | null; seedHash: string; serverSeed: string | null }): BjtRoundView {
  const open = s.phase === 'done';
  return {
    ...meta,
    serverSeed: open ? meta.serverSeed : null,
    phase: s.phase,
    dealer: open ? s.dealer.slice() : s.dealer.length ? [s.dealer[0]!, null] : [],
    dealerTotal: open ? handValue(s.dealer).total : null,
    players: s.players.map((p) => ({
      seat: p.seat,
      bet: p.bet,
      hands: p.hands.map((h) => ({ cards: h.cards.slice(), total: handValue(h.cards).total, bet: h.bet, doubled: h.doubled, done: h.done, outcome: h.outcome, payout: h.payout })),
      active: p.active,
      insurance: p.insurance,
      insurancePayout: p.insurancePayout,
      payout: p.payout,
      done: p.done,
    })),
    turnSeat: s.phase === 'playing' && s.turn !== null ? s.players[s.turn]!.seat : null,
  };
}

export interface BjtSeatView {
  seat: number;
  uid: number;
  displayName: string;
  avatar: number;
  avatarItem: string | null;
  frame: string;
  online: boolean;
  leaving: boolean;
}

export interface BjtTableSummary {
  id: string;
  name: { vi: string; en: string };
  minBet: number;
  maxBet: number;
  seats: number;
  seated: number;
  status: 'open' | 'paused' | 'closed';
}

export interface BjtTableView {
  table: BjtTableSummary;
  seats: BjtSeatView[];
  round: BjtRoundView | null;
  mySeat: number | null;
}
