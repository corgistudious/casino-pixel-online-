import type { Card } from './cards';
import { bestPokerHand, compareScores, evaluateFive, evaluateLieng, visibleStrength, type HandValue } from './handEval';

/**
 * Seated card games (Poker Texas Hold'em, Liêng, Xì Tố) share one betting engine:
 * - no-limit betting with fold / check / call / bet / raise / all-in;
 * - a raise must be at least the previous raise (an all-in for less does not re-open betting
 *   for players who already acted);
 * - side pots built from each player's total contribution; an uncalled bet is returned;
 * - odd chips of a split pot go to the winner closest to the left of the button.
 * The engine is pure and deterministic: the server stores the state, the deck comes from the
 * provably-fair shuffle.
 */
export const CARD_GAMES = ['poker', 'lieng', 'xito'] as const;
export type CardGame = (typeof CARD_GAMES)[number];

export interface CardTableConfig {
  smallBlind: number;
  bigBlind: number;
  ante: number;
  minBuyIn: number;
  maxBuyIn: number;
  seats: number;
  /** Time each player has to act. */
  turnMs: number;
}

export const DEFAULT_CARD_CONFIG: Record<CardGame, CardTableConfig> = {
  poker: { smallBlind: 50, bigBlind: 100, ante: 0, minBuyIn: 2_000, maxBuyIn: 20_000, seats: 6, turnMs: 20_000 },
  lieng: { smallBlind: 0, bigBlind: 100, ante: 100, minBuyIn: 2_000, maxBuyIn: 20_000, seats: 6, turnMs: 20_000 },
  xito: { smallBlind: 0, bigBlind: 100, ante: 50, minBuyIn: 2_000, maxBuyIn: 20_000, seats: 5, turnMs: 20_000 },
};

/** Betting rounds per game: Hold'em pre-flop/flop/turn/river; Liêng one; Xì Tố after the 2nd–5th card. */
export const STREETS: Record<CardGame, number> = { poker: 4, lieng: 1, xito: 4 };

export type CardActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';
export interface CardAction {
  type: CardActionType;
  /** bet / raise: the total this street the player raises TO. */
  amount?: number;
}

export interface HandPlayer {
  seat: number;
  userId: string;
  /** Chips behind (not yet committed). */
  stack: number;
  /** Committed this betting round. */
  streetBet: number;
  /** Committed this hand (antes, blinds and bets). */
  total: number;
  folded: boolean;
  allIn: boolean;
  /** Acted since the last full raise (decides whether a raise is still allowed). */
  acted: boolean;
  hole: Card[];
  /** Face-up cards (Xì Tố). */
  up: Card[];
  /** Consecutive turns timed out (sit-out / AFK signal). */
  timeouts: number;
}

export interface PotResult {
  amount: number;
  eligible: number[];
  winners: number[];
}

export interface HandResult {
  pots: PotResult[];
  /** Chips won per seat (gross, includes returned uncalled bets). */
  payouts: Record<number, number>;
  /** Net change per seat over the hand. */
  net: Record<number, number>;
  /** Cards revealed at showdown, with the hand category. */
  shown: Record<number, { cards: Card[]; category: string; best: Card[] }>;
  showdown: boolean;
}

export interface Hand {
  game: CardGame;
  button: number;
  players: HandPlayer[];
  deck: Card[];
  board: Card[];
  street: number;
  currentBet: number;
  minRaise: number;
  /** Index in `players` of who must act, or -1. */
  toAct: number;
  bigBlind: number;
  phase: 'betting' | 'done';
  actions: { seat: number; type: CardActionType | 'post' | 'ante' | 'timeout'; amount: number; street: number }[];
  result: HandResult | null;
}

export interface SeatIn {
  seat: number;
  userId: string;
  stack: number;
}

const live = (p: HandPlayer) => !p.folded;
const canAct = (p: HandPlayer) => !p.folded && !p.allIn;

function commit(h: Hand, p: HandPlayer, amount: number, street = true) {
  const a = Math.min(amount, p.stack);
  p.stack -= a;
  p.total += a;
  if (street) p.streetBet += a;
  if (p.stack === 0) p.allIn = true;
  return a;
}

/** Index of the next player after `from` (wrapping) that satisfies `pred`, or -1. */
function nextIndex(h: Hand, from: number, pred: (p: HandPlayer) => boolean): number {
  const n = h.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(h.players[i]!)) return i;
  }
  return -1;
}

/** Index of the button, or of the last player seated before it if the button seat was not dealt in. */
function buttonIndex(h: Hand): number {
  let idx = -1;
  h.players.forEach((p, i) => {
    if (p.seat <= h.button) idx = i;
  });
  return idx === -1 ? h.players.length - 1 : idx;
}

function deal(h: Hand, p: HandPlayer, where: 'hole' | 'up') {
  const c = h.deck.shift();
  if (!c) throw new Error('deck exhausted');
  p[where].push(c);
}

/** Xì Tố: the best visible up-cards act first (ties: closest to the left of the button). */
function bestVisibleIndex(h: Hand): number {
  const b = buttonIndex(h);
  let best = -1;
  for (let k = 1; k <= h.players.length; k++) {
    const i = (b + k) % h.players.length;
    const p = h.players[i]!;
    if (!canAct(p)) continue;
    if (best === -1 || compareScores(visibleStrength(p.up), visibleStrength(h.players[best]!.up)) > 0) best = i;
  }
  return best;
}

function firstToAct(h: Hand): number {
  const b = buttonIndex(h);
  if (h.game === 'xito') return bestVisibleIndex(h);
  if (h.game === 'poker' && h.street === 0) {
    if (h.players.length === 2) return canAct(h.players[b]!) ? b : nextIndex(h, b, canAct); // heads-up: button (SB) first
    const bb = nextIndex(h, nextIndex(h, b, () => true), () => true);
    return nextIndex(h, bb, canAct);
  }
  return nextIndex(h, b, canAct);
}

/**
 * Starts a hand: antes, blinds, cards, first player to act. `deck` must be a full shuffled deck.
 * Players with an empty stack are not dealt in; at least two players are needed.
 */
export function startHand(game: CardGame, cfg: Pick<CardTableConfig, 'smallBlind' | 'bigBlind' | 'ante'>, seats: SeatIn[], button: number, deck: Card[]): Hand {
  const players = seats
    .filter((s) => s.stack > 0)
    .sort((a, b) => a.seat - b.seat)
    .map((s) => ({ seat: s.seat, userId: s.userId, stack: s.stack, streetBet: 0, total: 0, folded: false, allIn: false, acted: false, hole: [], up: [], timeouts: 0 }) satisfies HandPlayer);
  if (players.length < 2) throw new Error('need two players');
  const h: Hand = { game, button, players, deck: [...deck], board: [], street: 0, currentBet: 0, minRaise: cfg.bigBlind, toAct: -1, bigBlind: cfg.bigBlind, phase: 'betting', actions: [], result: null };
  const b = buttonIndex(h);

  if (cfg.ante > 0) for (const p of players) h.actions.push({ seat: p.seat, type: 'ante', amount: commit(h, p, cfg.ante, false), street: 0 });
  if (game === 'poker') {
    const sbIdx = players.length === 2 ? b : nextIndex(h, b, () => true);
    const bbIdx = nextIndex(h, sbIdx, () => true);
    h.actions.push({ seat: players[sbIdx]!.seat, type: 'post', amount: commit(h, players[sbIdx]!, cfg.smallBlind), street: 0 });
    h.actions.push({ seat: players[bbIdx]!.seat, type: 'post', amount: commit(h, players[bbIdx]!, cfg.bigBlind), street: 0 });
    h.currentBet = Math.max(...players.map((p) => p.streetBet));
  }
  // Deal starting left of the button.
  const order = players.map((_, k) => players[(b + 1 + k) % players.length]!);
  const holeCount = game === 'poker' ? 2 : game === 'lieng' ? 3 : 1;
  for (let r = 0; r < holeCount; r++) for (const p of order) deal(h, p, 'hole');
  if (game === 'xito') for (const p of order) deal(h, p, 'up');

  h.toAct = firstToAct(h);
  return settleIfStuck(h);
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  /** Chips needed to call (0 when checking is possible). */
  toCall: number;
  canRaise: boolean;
  /** Smallest legal "raise to" / "bet to" (capped at all-in). */
  minRaiseTo: number;
  /** All-in "raise to". */
  maxRaiseTo: number;
}

export function legalActions(h: Hand, seat: number): LegalActions | null {
  if (h.phase !== 'betting' || h.toAct < 0) return null;
  const p = h.players[h.toAct]!;
  if (p.seat !== seat) return null;
  const toCall = Math.min(h.currentBet - p.streetBet, p.stack);
  const maxRaiseTo = p.streetBet + p.stack;
  const others = h.players.filter((o) => o !== p && canAct(o));
  const canRaise = !p.acted && maxRaiseTo > h.currentBet && others.length > 0;
  return { canFold: true, canCheck: h.currentBet === p.streetBet, toCall, canRaise, minRaiseTo: Math.min(h.currentBet + h.minRaise, maxRaiseTo), maxRaiseTo };
}

export class IllegalAction extends Error {}

/** Applies a player's action and advances the hand (streets, run-out, showdown). Returns a new state. */
export function applyAction(state: Hand, seat: number, action: CardAction): Hand {
  const h: Hand = structuredClone(state);
  const legal = legalActions(h, seat);
  if (!legal) throw new IllegalAction('not your turn');
  const p = h.players[h.toAct]!;
  const raiseTo = (target: number) => {
    if (!legal.canRaise) throw new IllegalAction('raise not allowed');
    if (!Number.isSafeInteger(target) || target <= h.currentBet || target > legal.maxRaiseTo) throw new IllegalAction('bad amount');
    const allIn = target === legal.maxRaiseTo;
    if (target < h.currentBet + h.minRaise && !allIn) throw new IllegalAction('raise too small');
    const increment = target - h.currentBet;
    const full = increment >= h.minRaise;
    commit(h, p, target - p.streetBet);
    if (full) {
      h.minRaise = increment;
      for (const o of h.players) if (o !== p) o.acted = false;
    }
    h.currentBet = target;
  };
  switch (action.type) {
    case 'fold':
      p.folded = true;
      break;
    case 'check':
      if (!legal.canCheck) throw new IllegalAction('cannot check');
      break;
    case 'call':
      if (legal.canCheck) throw new IllegalAction('nothing to call');
      commit(h, p, legal.toCall);
      break;
    case 'bet':
    case 'raise':
      raiseTo(action.amount ?? -1);
      break;
    case 'allin':
      if (legal.maxRaiseTo > h.currentBet && legal.canRaise) raiseTo(legal.maxRaiseTo);
      else commit(h, p, legal.toCall); // all-in call for less (or exactly)
      break;
  }
  p.acted = true;
  p.timeouts = 0; // a real action clears the AFK counter (timeoutAction sets it afterwards)
  h.actions.push({ seat, type: action.type, amount: p.streetBet, street: h.street });
  return advance(h);
}

/** Timeout: check when possible, otherwise fold. */
export function timeoutAction(state: Hand): Hand {
  const p = state.players[state.toAct];
  if (!p) return state;
  const legal = legalActions(state, p.seat)!;
  const next = applyAction(state, p.seat, { type: legal.canCheck ? 'check' : 'fold' });
  const q = next.players.find((x) => x.seat === p.seat)!;
  q.timeouts = p.timeouts + 1;
  next.actions.push({ seat: p.seat, type: 'timeout', amount: 0, street: state.street });
  return next;
}

function roundComplete(h: Hand): boolean {
  return h.players.filter(canAct).every((p) => p.acted && p.streetBet === h.currentBet);
}

function advance(h: Hand): Hand {
  if (h.players.filter(live).length === 1) return finish(h);
  if (!roundComplete(h)) {
    h.toAct = nextIndex(h, h.toAct, (o) => canAct(o) && (!o.acted || o.streetBet < h.currentBet));
    if (h.toAct >= 0) return h;
  }
  return nextStreet(h);
}

function nextStreet(h: Hand): Hand {
  for (const p of h.players) {
    p.streetBet = 0;
    p.acted = false;
  }
  h.currentBet = 0;
  h.minRaise = h.bigBlind;
  if (h.street + 1 >= STREETS[h.game]) return finish(h);
  h.street += 1;
  if (h.game === 'poker') {
    const n = h.street === 1 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const c = h.deck.shift();
      if (!c) throw new Error('deck exhausted');
      h.board.push(c);
    }
  } else if (h.game === 'xito') {
    const b = buttonIndex(h);
    for (let k = 1; k <= h.players.length; k++) {
      const p = h.players[(b + k) % h.players.length]!;
      if (live(p)) deal(h, p, 'up');
    }
  }
  h.toAct = firstToAct(h);
  return settleIfStuck(h);
}

/** No betting possible (at most one player can still act and nobody owes chips): deal out the rest. */
function settleIfStuck(h: Hand): Hand {
  const actors = h.players.filter(canAct);
  const owes = actors.some((p) => p.streetBet < h.currentBet);
  if (h.toAct === -1 || (actors.length <= 1 && !owes)) return nextStreet(h);
  return h;
}

function handValue(h: Hand, p: HandPlayer): HandValue {
  if (h.game === 'poker') return bestPokerHand([...p.hole, ...h.board]);
  if (h.game === 'lieng') return evaluateLieng(p.hole);
  return evaluateFive([...p.hole, ...p.up]);
}

/** Splits `amount` between winners; odd chips go to the winner closest to the left of the button. */
function split(h: Hand, amount: number, winners: number[], payouts: Record<number, number>) {
  const b = buttonIndex(h);
  const order = winners
    .map((seat) => ({ seat, dist: (h.players.findIndex((p) => p.seat === seat) - b + h.players.length) % h.players.length || h.players.length }))
    .sort((x, y) => x.dist - y.dist)
    .map((x) => x.seat);
  const share = Math.floor(amount / order.length);
  let rest = amount - share * order.length;
  for (const seat of order) {
    payouts[seat] = (payouts[seat] ?? 0) + share + (rest > 0 ? 1 : 0);
    if (rest > 0) rest -= 1;
  }
}

function finish(h: Hand): Hand {
  h.phase = 'done';
  h.toAct = -1;
  const payouts: Record<number, number> = {};
  const start = new Map(h.players.map((p) => [p.seat, p.stack + p.total]));
  // Return the uncalled part of the largest contribution.
  const byTotal = [...h.players].sort((a, b) => b.total - a.total);
  const top = byTotal[0]!;
  const second = byTotal[1]?.total ?? 0;
  if (top.total > second) {
    const refund = top.total - second;
    top.total -= refund;
    top.stack += refund;
  }

  const contenders = h.players.filter(live);
  const pots: PotResult[] = [];
  const shown: HandResult['shown'] = {};
  const showdown = contenders.length > 1;
  if (!showdown) {
    const amount = h.players.reduce((s, p) => s + p.total, 0);
    pots.push({ amount, eligible: [contenders[0]!.seat], winners: [contenders[0]!.seat] });
    payouts[contenders[0]!.seat] = amount;
  } else {
    const values = new Map(contenders.map((p) => [p.seat, handValue(h, p)]));
    for (const p of contenders) {
      const v = values.get(p.seat)!;
      shown[p.seat] = { cards: [...p.hole, ...p.up], category: v.category, best: v.cards };
    }
    const levels = [...new Set(contenders.map((p) => p.total))].sort((a, b) => a - b);
    let prev = 0;
    levels.forEach((level, i) => {
      let amount = h.players.reduce((s, p) => s + Math.max(0, Math.min(p.total, level) - prev), 0);
      // Folded chips above the last contender level belong to the last pot.
      if (i === levels.length - 1) amount += h.players.reduce((s, p) => s + Math.max(0, p.total - level), 0);
      const eligible = contenders.filter((p) => p.total >= level).map((p) => p.seat);
      if (amount > 0) {
        let best: number[] = [];
        for (const seat of eligible) {
          const c = best.length ? compareScores(values.get(seat)!.score, values.get(best[0]!)!.score) : 1;
          if (c > 0) best = [seat];
          else if (c === 0) best.push(seat);
        }
        pots.push({ amount, eligible, winners: best });
        split(h, amount, best, payouts);
      }
      prev = level;
    });
  }
  for (const p of h.players) p.stack += payouts[p.seat] ?? 0;
  const net = Object.fromEntries(h.players.map((p) => [p.seat, p.stack - start.get(p.seat)!]));
  h.result = { pots, payouts, net, shown, showdown };
  return h;
}

// ---------------------------------------------------------------- client view

export interface HandPlayerView {
  seat: number;
  userId: string;
  stack: number;
  streetBet: number;
  total: number;
  folded: boolean;
  allIn: boolean;
  /** Own cards, or cards revealed at showdown; otherwise null placeholders (count only). */
  hole: (Card | null)[];
  up: Card[];
}

export interface HandView {
  id: string;
  seq: number;
  game: CardGame;
  button: number;
  street: number;
  board: Card[];
  players: HandPlayerView[];
  pot: number;
  currentBet: number;
  minRaise: number;
  toActSeat: number | null;
  /** Server time (ms) when the current player's turn runs out. */
  deadline: number | null;
  phase: 'betting' | 'done';
  result: HandResult | null;
  /** Provably fair: hash before, seed after the hand. */
  seedHash: string;
  serverSeed: string | null;
  legal: LegalActions | null;
}

/** What one viewer may see: never other players' hidden cards before showdown, never the deck. */
export function viewHand(h: Hand, meta: { id: string; seq: number; seedHash: string; serverSeed: string | null; deadline: number | null }, viewerId: string | null): HandView {
  const mySeat = h.players.find((p) => p.userId === viewerId)?.seat ?? null;
  return {
    id: meta.id,
    seq: meta.seq,
    game: h.game,
    button: h.button,
    street: h.street,
    board: h.board,
    players: h.players.map((p) => {
      const reveal = p.userId === viewerId || (h.result?.showdown && h.result.shown[p.seat]);
      return { seat: p.seat, userId: p.userId, stack: p.stack, streetBet: p.streetBet, total: p.total, folded: p.folded, allIn: p.allIn, hole: reveal ? p.hole : p.hole.map(() => null), up: p.up };
    }),
    pot: h.players.reduce((s, p) => s + p.total, 0),
    currentBet: h.currentBet,
    minRaise: h.minRaise,
    toActSeat: h.toAct >= 0 ? h.players[h.toAct]!.seat : null,
    deadline: meta.deadline,
    phase: h.phase,
    result: h.result,
    seedHash: meta.seedHash,
    serverSeed: meta.serverSeed,
    legal: mySeat !== null ? legalActions(h, mySeat) : null,
  };
}

// ---------------------------------------------------------------- table views & API

export interface CardSeatView {
  seat: number;
  uid: number;
  displayName: string;
  avatar: number;
  avatarItem: string | null;
  frame: string;
  cardBack: string | null;
  title: string | null;
  stack: number;
  status: 'active' | 'sitting_out' | 'leaving';
}

export interface CardTableSummary {
  id: string;
  game: CardGame;
  name: { vi: string; en: string };
  mode: 'casual' | 'ranked';
  status: 'open' | 'paused' | 'closed';
  config: CardTableConfig;
  seated: number;
}

export interface CardTableView {
  table: CardTableSummary;
  seats: CardSeatView[];
  hand: HandView | null;
  /** The viewer's seat, if seated. */
  mySeat: number | null;
  /** Ranked match info (ranked tables only). */
  match: { id: string; hands: number; maxHands: number; status: string; winnerUid: number | null } | null;
  serverNow: number;
}

/** Ranked heads-up match: fixed match chips, never Cxu; the result changes RP. */
export const RANKED_MATCH = { stack: 10_000, maxHands: 30, hardCapHands: 40, afkTimeouts: 3 } as const;
