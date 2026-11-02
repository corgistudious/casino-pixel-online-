import {
  DEFAULT_CARD_CONFIG,
  tableBetReturn,
  type Card,
  type CardSeatView,
  type CardTableView,
  type HandPlayerView,
  type HandView,
  type MyTableBet,
  type PublicIdentity,
  type ServerEvent,
  type TableRoundView,
  type TaiXiuOutcome,
} from '@casino/shared';
import { ApiError } from './net/api';

/**
 * UI-preview build only (VITE_DEMO=1, loaded with a dynamic import): answers the game socket so the
 * REAL table screens can be reviewed without a server. Everything here is simulated and local —
 * no network, no account, no real Cxu. Live builds never load this file.
 *
 * - Tài Xỉu: a 23 s round loop (shake → bet → reveal → result). Payouts use the shared
 *   tableBetReturn, the same function the server uses, so the numbers on screen are consistent.
 * - Xì Tố: a 5-seat table where the viewer acts with server-style legal actions and bots answer.
 */
type Emit = (ev: ServerEvent) => void;
let emit: Emit = () => {};
let balance = 128_450;
const DEMO_UID = 100_428;

const rng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

const NAMES = ['Mèo Vàng', 'An Bình', 'Lucky Ngọc', 'Bảo Long', 'Hà My', 'Tuấn Kiệt', 'Thu Trang', 'Đức Anh', 'Minh Châu'];
const FRAMES = ['sapphire', 'ruby', 'emerald', 'gold', 'none'];
function identity(i: number): PublicIdentity {
  return {
    uid: 100_500 + i,
    displayName: NAMES[i % NAMES.length]!,
    avatar: (i * 3) % 12,
    avatarItem: null,
    frame: FRAMES[i % FRAMES.length]!,
    badges: i % 4 === 0 ? ['verified'] : [],
    customAvatar: null,
    vipLevel: 1 + ((i * 5) % 9),
  } as PublicIdentity;
}

// ------------------------------------------------------------------------------------ Tài Xỉu
const SHAKE = 2500, BET = 12_000, REVEAL = 3500, RESULT = 5000, CYCLE = SHAKE + BET + REVEAL + RESULT;
const T0 = Math.floor(Date.now() / CYCLE) * CYCLE;
const myBets = new Map<string, MyTableBet[]>();
const settledRounds = new Set<string>();
let txTable = 'taixiu-1';

function outcomeOf(k: number): TaiXiuOutcome {
  const r = rng(k * 7919 + 17);
  const dice = [1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6)] as [number, number, number];
  const total = dice[0] + dice[1] + dice[2];
  const triple = dice[0] === dice[1] && dice[1] === dice[2];
  return { dice, total, triple, side: triple ? 'triple' : total >= 11 ? 'tai' : 'xiu' };
}

function txView(now = Date.now()): TableRoundView {
  const k = Math.floor((now - T0) / CYCLE);
  const opens = T0 + k * CYCLE;
  const betsOpen = opens + SHAKE, locks = betsOpen + BET, reveal = locks + REVEAL, next = reveal + RESULT;
  const id = `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`;
  const status: TableRoundView['round']['status'] = now < locks ? 'betting' : now < reveal ? 'locked' : 'settled';
  const phase = now < betsOpen ? 'shaking' : now < locks ? 'betting' : now < reveal ? 'revealing' : 'result';
  const outcome = now >= locks ? outcomeOf(k) : null;
  if (status === 'settled' && !settledRounds.has(id)) settle(id, outcomeOf(k));
  const grow = Math.min(1, Math.max(0, (now - betsOpen) / BET));
  const r = rng(k + 3);
  const bettors = Math.round(6 + 30 * grow * r());
  const players = Array.from({ length: Math.min(9, bettors) }, (_, i) => identity(i + k));
  const history = Array.from({ length: 16 }, (_, i) => outcomeOf(k - 1 - i));
  return {
    table: { id: txTable, game: 'taixiu', name: { vi: 'Tài Xỉu Live', en: 'Tài Xỉu Live' }, minBet: 10, maxBet: 1_000_000, status: 'open' },
    round: {
      id,
      seq: 18_240 + k,
      phase,
      opensAt: new Date(opens).toISOString(),
      betsOpenAt: new Date(betsOpen).toISOString(),
      locksAt: new Date(locks).toISOString(),
      revealAt: new Date(reveal).toISOString(),
      nextAt: new Date(next).toISOString(),
      seedHash: `demo-${k.toString(16).padStart(8, '0')}${'0'.repeat(56)}`,
      serverSeed: status === 'settled' ? `demo-seed-${k}` : null,
      outcome,
      status,
    },
    serverNow: now,
    totals: {
      big: { amount: Math.round(1_825_400 * grow + 40_000), players: Math.round(bettors * 0.55) },
      small: { amount: Math.round(1_462_900 * grow + 30_000), players: Math.round(bettors * 0.45) },
      odd: { amount: Math.round(220_000 * grow), players: 3 },
      even: { amount: Math.round(185_000 * grow), players: 2 },
    },
    bettors,
    players,
    watchers: bettors + 11,
    members: Array.from({ length: 12 }, (_, i) => identity(i + 2)),
    history: status === 'settled' ? [outcomeOf(k), ...history.slice(0, 15)] : history,
    myBets: myBets.get(id) ?? [],
  } as TableRoundView;
}

function settle(roundId: string, outcome: TaiXiuOutcome) {
  settledRounds.add(roundId);
  const bets = myBets.get(roundId);
  if (!bets?.length) return;
  let win = 0;
  const done = bets.map((b) => {
    const payout = tableBetReturn('taixiu', { kind: b.kind, value: b.value ?? undefined, amount: b.amount }, outcome);
    win += payout;
    return { ...b, payout, status: 'settled' as const };
  });
  myBets.set(roundId, done);
  balance += win;
  setTimeout(() => emit({ event: 'wallet', data: { balance } }), 0);
}

let txTimer: ReturnType<typeof setInterval> | null = null;
function startTaiXiuBroadcast() {
  if (txTimer) return;
  let lastPhase = '';
  let tick = 0;
  txTimer = setInterval(() => {
    const v = txView();
    tick++;
    // A broadcast on every phase change, and pool updates while betting (other players' totals).
    if (v.round.phase !== lastPhase || (v.round.phase === 'betting' && tick % 6 === 0)) {
      lastPhase = v.round.phase;
      const { myBets: _mine, ...pub } = v;
      emit({ event: 'table', data: pub });
    }
  }, 250);
}

// ------------------------------------------------------------------------------------- Xì Tố
const SUITS = ['S', 'H', 'D', 'C'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
let xtTable = 'xito-1';
let handSeq = 412;
let seated = true;
let stacks = [9_400, 12_250, 6_800, 15_100, 8_700];
let hand: (HandView & { deck: Card[]; acted: Set<number> }) | null = null;
let xtTimer: ReturnType<typeof setTimeout> | null = null;

function seatViews(): CardSeatView[] {
  const out: CardSeatView[] = [];
  for (let seat = 0; seat < 5; seat++) {
    if (seat === 0 && !seated) continue;
    const id = seat === 0 ? { ...identity(0), uid: DEMO_UID, displayName: 'Corgi Royale', avatar: 3, frame: 'sapphire', vipLevel: 5 } : identity(seat);
    out.push({ ...id, seat, cardBack: null, title: null, stack: stacks[seat]!, status: 'active' } as CardSeatView);
  }
  return out;
}

function newHand() {
  handSeq++;
  const r = rng(handSeq * 31);
  const deck: Card[] = [];
  for (const s of SUITS) for (const k of RANKS) deck.push(`${k}${s}` as Card);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j]!, deck[i]!]; }
  const seats = seatViews().map((s) => s.seat);
  const ante = DEFAULT_CARD_CONFIG.xito.ante;
  const players: HandPlayerView[] = seats.map((seat) => {
    stacks[seat] = stacks[seat]! - ante;
    return { seat, userId: `u${seat}`, stack: stacks[seat]!, streetBet: 0, total: ante, folded: false, allIn: false, hole: [deck.pop()!], up: [deck.pop()!] };
  });
  hand = {
    id: `demo-hand-${handSeq}`, seq: handSeq, game: 'xito', button: seats[handSeq % seats.length]!, street: 1, board: [], players,
    pot: ante * players.length, currentBet: 0, minRaise: 100, toActSeat: seats[0]!, deadline: Date.now() + 20_000, phase: 'betting',
    result: null, seedHash: `demo-${handSeq.toString(16)}${'0'.repeat(58)}`, serverSeed: null, legal: null, deck, acted: new Set(),
  };
  if (hand.toActSeat !== 0) scheduleBot();
}

function legalFor(seat: number) {
  if (!hand || hand.phase !== 'betting' || hand.toActSeat !== seat) return null;
  const p = hand.players.find((x) => x.seat === seat)!;
  const toCall = Math.max(0, hand.currentBet - p.streetBet);
  const maxTo = p.streetBet + p.stack;
  return { canFold: true, canCheck: toCall === 0, toCall: Math.min(toCall, p.stack), canRaise: maxTo > hand.currentBet + hand.minRaise, minRaiseTo: Math.min(maxTo, hand.currentBet + Math.max(hand.minRaise, 100)), maxRaiseTo: maxTo };
}

function cardView(): CardTableView {
  const seats = seatViews();
  const mySeat = seated ? 0 : null;
  let h: HandView | null = null;
  if (hand) {
    const { deck: _d, acted: _a, ...pub } = hand;
    h = {
      ...pub,
      players: hand.players.map((p) => ({ ...p, hole: p.seat === mySeat || hand!.result ? p.hole : p.hole.map(() => null) })),
      legal: mySeat !== null ? legalFor(mySeat) : null,
    };
  }
  return {
    table: { id: xtTable, game: 'xito', name: { vi: 'Xì Tố — Bàn Hoàng Kim', en: 'Xì Tố — Golden Table' }, mode: 'casual', status: 'open', config: DEFAULT_CARD_CONFIG.xito, seated: seats.length },
    seats, hand: h, mySeat, match: null, serverNow: Date.now(),
  };
}

const broadcastCard = () => emit({ event: 'card', data: cardView() });

function nextToAct(from: number): number | null {
  if (!hand) return null;
  const live = hand.players.filter((p) => !p.folded && !p.allIn).map((p) => p.seat);
  if (live.length <= 1) return null;
  const order = [...live].sort((a, b) => a - b);
  const after = order.find((s) => s > from) ?? order[0]!;
  const p = hand.players.find((x) => x.seat === after)!;
  if (hand.acted.has(after) && p.streetBet === hand.currentBet) return null; // street complete
  return after;
}

function act(seat: number, action: string, amount?: number) {
  if (!hand) return;
  const p = hand.players.find((x) => x.seat === seat)!;
  const toCall = Math.max(0, hand.currentBet - p.streetBet);
  const put = (n: number) => { const x = Math.min(n, p.stack); p.stack -= x; p.streetBet += x; p.total += x; hand!.pot += x; stacks[seat] = p.stack; if (p.stack === 0) p.allIn = true; };
  if (action === 'fold') p.folded = true;
  else if (action === 'call') put(toCall);
  else if (action === 'allin') { put(p.stack); hand.currentBet = Math.max(hand.currentBet, p.streetBet); hand.acted = new Set(); }
  else if (action === 'bet' || action === 'raise') { put((amount ?? hand.currentBet + 100) - p.streetBet); hand.currentBet = p.streetBet; hand.acted = new Set(); }
  hand.acted.add(seat);
  const live = hand.players.filter((x) => !x.folded);
  if (live.length === 1) return finish();
  const nxt = nextToAct(seat);
  if (nxt === null) return nextStreet();
  hand.toActSeat = nxt;
  hand.deadline = Date.now() + 20_000;
  if (nxt !== 0 || !seated) scheduleBot();
}

function nextStreet() {
  if (!hand) return;
  if (hand.street >= 4) return finish();
  hand.street++;
  for (const p of hand.players) { p.streetBet = 0; if (!p.folded) p.up = [...p.up, hand.deck.pop()!]; }
  hand.currentBet = 0;
  hand.acted = new Set();
  const first = hand.players.filter((p) => !p.folded && !p.allIn).map((p) => p.seat).sort((a, b) => a - b)[0];
  hand.toActSeat = first ?? null;
  hand.deadline = Date.now() + 20_000;
  if (first === undefined) return finish();
  if (first !== 0 || !seated) scheduleBot();
}

function finish() {
  if (!hand) return;
  const live = hand.players.filter((p) => !p.folded);
  // Demo showdown: a fixed, readable winner choice (no real hand ranking here — preview only).
  const winner = live[(handSeq % live.length + live.length) % live.length]!;
  const net: Record<number, number> = {};
  const payouts: Record<number, number> = {};
  for (const p of hand.players) net[p.seat] = -p.total;
  net[winner.seat] = hand.pot - winner.total;
  payouts[winner.seat] = hand.pot;
  stacks[winner.seat] = stacks[winner.seat]! + hand.pot;
  winner.stack = stacks[winner.seat]!;
  const shown: NonNullable<HandView['result']>['shown'] = {};
  if (live.length > 1) for (const p of live) shown[p.seat] = { cards: [...p.hole, ...p.up] as Card[], category: p.seat === winner.seat ? 'two_pair' : 'pair', best: [] };
  hand.result = { pots: [], payouts, net, shown, showdown: live.length > 1 };
  hand.phase = 'done';
  hand.toActSeat = null;
  hand.deadline = null;
  hand.serverSeed = `demo-seed-${handSeq}`;
  broadcastCard();
  if (xtTimer) clearTimeout(xtTimer);
  xtTimer = setTimeout(() => { newHand(); broadcastCard(); }, 4500);
}

function scheduleBot() {
  if (xtTimer) clearTimeout(xtTimer);
  broadcastCard();
  xtTimer = setTimeout(() => {
    if (!hand || hand.toActSeat === null || (hand.toActSeat === 0 && seated)) return;
    const seat = hand.toActSeat;
    const r = rng(handSeq * 13 + seat * 7 + hand.street)();
    const p = hand.players.find((x) => x.seat === seat)!;
    const toCall = hand.currentBet - p.streetBet;
    if (toCall > 0 && r < 0.18) act(seat, 'fold');
    else if (r > 0.82 && hand.street < 4) act(seat, hand.currentBet > 0 ? 'raise' : 'bet', hand.currentBet + 200);
    else act(seat, 'call');
    broadcastCard();
  }, 1100);
}

// ----------------------------------------------------------------------------------- requests
export async function demoRequest(type: string, payload: Record<string, unknown>, onEvent: Emit): Promise<unknown> {
  emit = onEvent;
  await new Promise((r) => setTimeout(r, 90));
  switch (type) {
    case 'table.join':
      txTable = String(payload.tableId || txTable);
      startTaiXiuBroadcast();
      return txView();
    case 'table.leave':
      if (txTimer) clearInterval(txTimer);
      txTimer = null;
      return { ok: true };
    case 'table.bet': {
      const v = txView();
      if (payload.roundId !== v.round.id || v.round.phase !== 'betting') throw new ApiError('betting_closed');
      const bets = payload.bets as { kind: string; value?: number; amount: number }[];
      const total = bets.reduce((s, b) => s + b.amount, 0);
      if (total > balance) throw new ApiError('insufficient_funds');
      balance -= total;
      const list = myBets.get(v.round.id) ?? [];
      for (const b of bets) list.push({ id: `b${Date.now()}${list.length}`, kind: b.kind, value: b.value ?? null, amount: b.amount, payout: null, status: 'placed' });
      myBets.set(v.round.id, list);
      return { myBets: list, balance };
    }
    case 'card.join':
      xtTable = String(payload.tableId || xtTable);
      if (!hand) newHand();
      return cardView();
    case 'card.leave':
      return { ok: true };
    case 'card.act': {
      if (!hand || hand.toActSeat !== 0 || !seated) throw new ApiError('illegal_action');
      act(0, String(payload.action), payload.amount as number | undefined);
      broadcastCard();
      return { ok: true };
    }
    case 'card.stand':
      seated = false;
      if (hand) { const p = hand.players.find((x) => x.seat === 0); if (p && !p.folded) { p.folded = true; if (hand.toActSeat === 0) { const n = nextToAct(0); if (n === null) nextStreet(); else { hand.toActSeat = n; scheduleBot(); } } } }
      setTimeout(broadcastCard, 0);
      return { cashedOut: stacks[0], leaving: false };
    case 'card.sit':
      seated = true;
      stacks[0] = Number(payload.buyIn) || 10_000;
      return cardView();
    case 'card.back':
      return cardView();
    case 'ping':
      return { now: Date.now() };
    default:
      throw new ApiError('bad_request');
  }
}
