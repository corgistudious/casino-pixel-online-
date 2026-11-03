import {
  DEFAULT_CARD_CONFIG,
  applyAction,
  applyBlackjackAction,
  bjtAct,
  bjtCloseInsurance,
  bjtDeal,
  bjtExtraStake,
  bjtInsure,
  bjtNewRound,
  bjtPlaceBet,
  bjtTimeout,
  bjtView,
  blackjackView,
  cardValue,
  createShoe,
  extraStake,
  legalActions,
  rollSicBo,
  seededRng,
  shuffle,
  spinRoulette,
  spinRouletteNumber,
  spinSlots,
  startBlackjack,
  startHand,
  tableBetReturn,
  timeoutAction,
  viewHand,
  type BjtSeatView,
  type BjtState,
  type BjtTableView,
  type BlackjackAction,
  type BlackjackState,
  type CardAction,
  type CardGame,
  type CardSeatView,
  type CardTableView,
  type Hand,
  type MyTableBet,
  type RoundOutcome,
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
 * Results and payouts come from the shared game rules (the same code the server runs), so the numbers
 * on screen are consistent; only the randomness and the other players are simulated.
 * - Tài Xỉu / Roulette live tables: a round loop (shake → bet → reveal → result) per table.
 * - Poker / Liêng / Xì Tố: the shared hand engine with bots in the other seats.
 * - Blackjack multiplayer: the shared table engine with four bots; the viewer may take seat 3.
 * - Solo Roulette, Sic Bo, Slots and Blackjack: the shared spin / roll / deal functions.
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
type RoundGame = 'taixiu' | 'roulette';
const TIMING: Record<RoundGame, { shake: number; bet: number; reveal: number; result: number }> = {
  taixiu: { shake: 2500, bet: 12_000, reveal: 3500, result: 5000 },
  roulette: { shake: 0, bet: 12_000, reveal: 9000, result: 4000 },
};
const cycleOf = (g: RoundGame) => TIMING[g].shake + TIMING[g].bet + TIMING[g].reveal + TIMING[g].result;
const T0 = Math.floor(Date.now() / 60_000) * 60_000;
const myBets = new Map<string, MyTableBet[]>();
const settledRounds = new Set<string>();
let txTable = 'taixiu-1';
const roundGame = (): RoundGame => (/roulette/.test(txTable) ? 'roulette' : 'taixiu');

function outcomeOf(game: RoundGame, k: number): RoundOutcome {
  const r = seededRng(k * 2_654_435_761 + (game === 'roulette' ? 17 : 0));
  if (game === 'roulette') return spinRouletteNumber(r);
  const d = (): number => 1 + Math.floor(r.float() * 6);
  const dice = [d(), d(), d()] as [number, number, number];
  const total = dice[0] + dice[1] + dice[2];
  const triple = dice[0] === dice[1] && dice[1] === dice[2];
  return { dice, total, triple, side: triple ? 'triple' : total >= 11 ? 'tai' : 'xiu' } as TaiXiuOutcome;
}

function txView(now = Date.now()): TableRoundView {
  const game = roundGame();
  const T = TIMING[game];
  const CYCLE = cycleOf(game);
  const k = Math.floor((now - T0) / CYCLE);
  const opens = T0 + k * CYCLE;
  const betsOpen = opens + T.shake, locks = betsOpen + T.bet, reveal = locks + T.reveal, next = reveal + T.result;
  const id = `00000000-0000-4000-8${game === 'roulette' ? '1' : '0'}00-${String(k).padStart(12, '0')}`;
  const status: TableRoundView['round']['status'] = now < locks ? 'betting' : now < reveal ? 'locked' : 'settled';
  const phase = now < betsOpen ? 'shaking' : now < locks ? 'betting' : now < reveal ? 'revealing' : 'result';
  const outcome = now >= locks ? outcomeOf(game, k) : null;
  if (status === 'settled' && !settledRounds.has(id)) settle(game, id, outcomeOf(game, k));
  const grow = Math.min(1, Math.max(0, (now - betsOpen) / T.bet));
  const r = rng(k + 3);
  const bettors = Math.round(6 + 30 * grow * r());
  const players = Array.from({ length: Math.min(9, bettors) }, (_, i) => identity(i + k));
  const history = Array.from({ length: 16 }, (_, i) => outcomeOf(game, k - 1 - i));
  const totals: Record<string, { amount: number; players: number }> =
    game === 'taixiu'
      ? {
          big: { amount: Math.round(1_825_400 * grow + 40_000), players: Math.round(bettors * 0.55) },
          small: { amount: Math.round(1_462_900 * grow + 30_000), players: Math.round(bettors * 0.45) },
          odd: { amount: Math.round(220_000 * grow), players: 3 },
          even: { amount: Math.round(185_000 * grow), players: 2 },
        }
      : {
          red: { amount: Math.round(962_000 * grow + 20_000), players: Math.round(bettors * 0.4) },
          black: { amount: Math.round(884_500 * grow + 15_000), players: Math.round(bettors * 0.35) },
          straight: { amount: Math.round(310_000 * grow), players: Math.round(bettors * 0.25) },
        };
  return {
    table: {
      id: txTable,
      game,
      name: game === 'taixiu' ? { vi: 'Tài Xỉu Live', en: 'Tài Xỉu Live' } : { vi: 'Roulette Live', en: 'Roulette Live' },
      minBet: 10,
      maxBet: 1_000_000,
      status: 'open',
    },
    round: {
      id,
      seq: (game === 'taixiu' ? 18_240 : 7_310) + k,
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
    totals,
    bettors,
    players,
    watchers: bettors + 11,
    members: Array.from({ length: 12 }, (_, i) => identity(i + 2)),
    history: status === 'settled' ? [outcomeOf(game, k), ...history.slice(0, 15)] : history,
    myBets: myBets.get(id) ?? [],
  } as TableRoundView;
}

function settle(game: RoundGame, roundId: string, outcome: RoundOutcome) {
  settledRounds.add(roundId);
  const bets = myBets.get(roundId);
  if (!bets?.length) return;
  let win = 0;
  const done = bets.map((b) => {
    const payout = tableBetReturn(game, { kind: b.kind, value: b.value ?? undefined, amount: b.amount } as never, outcome);
    win += payout;
    return { ...b, payout, status: 'settled' as const };
  });
  myBets.set(roundId, done);
  balance += win;
  setTimeout(() => emit({ event: 'wallet', data: { balance } }), 0);
}

let txTimer: ReturnType<typeof setInterval> | null = null;
function startTaiXiuBroadcast() {
  if (txTimer) clearInterval(txTimer);
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

// ------------------------------------------------------------------------- Poker · Liêng · Xì Tố
// Uses the shared hand engine (startHand / legalActions / applyAction / viewHand) — the same rules
// the server runs — with bots in the other seats. The viewer sits in seat 0.
const ME = `u${DEMO_UID}`;
let cardTable = 'xito-1';
let cardGame: CardGame = 'xito';
let handSeq = 412;
let seated = true;
let stacks: Record<number, number> = {};
let hand: Hand | null = null;
let deadline: number | null = null;
let cardTimer: ReturnType<typeof setTimeout> | null = null;

const gameOfTable = (id: string): CardGame => (/poker/.test(id) ? 'poker' : /lieng/.test(id) ? 'lieng' : 'xito');
const cfgOf = () => DEFAULT_CARD_CONFIG[cardGame];
/** Bots fill every seat but the last, so the seat chooser has a free seat after standing up. */
const botSeats = () => Array.from({ length: cfgOf().seats - 2 }, (_, i) => i + 1);

function resetCardTable(id: string) {
  cardTable = id;
  cardGame = gameOfTable(id);
  stacks = { 0: 9_300 };
  for (const s of botSeats()) stacks[s] = 6_000 + ((s * 3_731) % 9_000);
  seated = true;
  hand = null;
}

function seatViews(): CardSeatView[] {
  const out: CardSeatView[] = [];
  const seats = [...(seated ? [0] : []), ...botSeats()];
  for (const seat of seats) {
    const id = seat === 0 ? { ...identity(0), uid: DEMO_UID, displayName: 'Corgi Royale', avatar: 3, frame: 'sapphire', vipLevel: 5 } : identity(seat);
    out.push({ ...id, seat, cardBack: null, title: null, stack: stacks[seat] ?? 0, status: 'active' } as CardSeatView);
  }
  return out;
}

function newHand() {
  handSeq++;
  for (const s of Object.keys(stacks)) if ((stacks[Number(s)] ?? 0) < 500) stacks[Number(s)] = 8_000; // demo bots rebuy
  const seats = seatViews().map((s) => ({ seat: s.seat, userId: s.seat === 0 ? ME : `bot${s.seat}`, stack: stacks[s.seat]! }));
  const deck = shuffle(seededRng(handSeq * 7919), createShoe(1));
  hand = startHand(cardGame, cfgOf(), seats, seats[handSeq % seats.length]!.seat, deck);
  syncStacks();
  deadline = Date.now() + cfgOf().turnMs;
  driveCard();
}

function syncStacks() {
  if (!hand) return;
  for (const p of hand.players) stacks[p.seat] = p.stack;
}

function cardView(): CardTableView {
  const seats = seatViews();
  const mySeat = seated ? 0 : null;
  const h = hand
    ? viewHand(hand, { id: `demo-hand-${handSeq}`, seq: handSeq, seedHash: `demo-${handSeq.toString(16)}${'0'.repeat(58)}`, serverSeed: hand.phase === 'done' ? `demo-seed-${handSeq}` : null, deadline: hand.phase === 'done' ? null : deadline }, seated ? ME : null)
    : null;
  const names: Record<CardGame, { vi: string; en: string }> = {
    poker: { vi: "Texas Hold'em — Bàn Kim Cương", en: "Texas Hold'em — Diamond Table" },
    lieng: { vi: 'Liêng — Bàn Phượng Hoàng', en: 'Liêng — Phoenix Table' },
    xito: { vi: 'Xì Tố — Bàn Hoàng Kim', en: 'Xì Tố — Golden Table' },
  };
  return {
    table: { id: cardTable, game: cardGame, name: names[cardGame], mode: 'casual', status: 'open', config: cfgOf(), seated: seats.length },
    seats, hand: h, mySeat, match: null, serverNow: Date.now(),
  };
}

const broadcastCard = () => emit({ event: 'card', data: cardView() });

/** After every change: settle a finished hand, or let the bot to act think for a moment. */
function driveCard() {
  if (cardTimer) clearTimeout(cardTimer);
  broadcastCard();
  if (!hand) return;
  if (hand.phase === 'done') {
    syncStacks();
    cardTimer = setTimeout(() => newHand(), 5000);
    return;
  }
  const p = hand.players[hand.toAct];
  if (!p) return;
  if (p.userId === ME) {
    // My turn: the server would fold/check for me when the clock runs out.
    cardTimer = setTimeout(() => {
      if (!hand || hand.phase === 'done') return;
      hand = timeoutAction(hand);
      syncStacks();
      deadline = Date.now() + cfgOf().turnMs;
      driveCard();
    }, Math.max(0, (deadline ?? Date.now()) - Date.now()));
    return;
  }
  cardTimer = setTimeout(() => {
    if (!hand || hand.phase === 'done') return;
    const legal = legalActions(hand, p.seat);
    if (!legal) return;
    const r = rng(handSeq * 13 + p.seat * 7 + hand.street + hand.actions.length)();
    let action: CardAction;
    if (!legal.canCheck && r < 0.15) action = { type: 'fold' };
    else if (legal.canRaise && r > 0.85) action = { type: hand.currentBet > 0 ? 'raise' : 'bet', amount: legal.minRaiseTo };
    else action = legal.canCheck ? { type: 'check' } : { type: 'call' };
    try {
      hand = applyAction(hand, p.seat, action);
    } catch {
      hand = timeoutAction(hand);
    }
    syncStacks();
    deadline = Date.now() + cfgOf().turnMs;
    driveCard();
  }, 1000);
}

// -------------------------------------------------------------------------- solo games
const soloRng = () => seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
let nonce = 0;
function envelope<T>(result: T) {
  nonce++;
  return { roundId: `demo-solo-${Date.now()}-${nonce}`, balance, nonce, result };
}
function stake(amount: number) {
  if (amount > balance) throw new ApiError('insufficient_funds');
  balance -= amount;
}
let bj: BlackjackState | null = null;

// ------------------------------------------------------------------- Blackjack multiplayer
const BJT_SEAT_OF_ME = 2;
let bjtTableId = 'bj-1';
let bjtMySeat: number | null = null;
let bjtState: BjtState | null = null;
let bjtSeq = 90;
let bjtDeadline: number | null = null;
let bjtTimer: ReturnType<typeof setTimeout> | null = null;
let bjtPaid = false;
const BJT_BOTS = [0, 1, 3, 4];

function bjtSeats(): BjtSeatView[] {
  const seats = [...BJT_BOTS, ...(bjtMySeat !== null ? [bjtMySeat] : [])].sort();
  return seats.map((seat) => {
    const id = seat === bjtMySeat ? { ...identity(0), uid: DEMO_UID, displayName: 'Corgi Royale', avatar: 3, frame: 'sapphire', vipLevel: 5 } : identity(seat + 4);
    return { ...id, seat, online: true, leaving: false } as BjtSeatView;
  });
}

function bjtTableView(): BjtTableView {
  return {
    table: { id: bjtTableId, name: { vi: 'Blackjack — Bàn Ngọc Lục Bảo', en: 'Blackjack — Emerald Table' }, minBet: 100, maxBet: 50_000, seats: 5, seated: bjtSeats().length, status: 'open' },
    seats: bjtSeats(),
    round: bjtState ? bjtView(bjtState, { id: `demo-bjt-${bjtSeq}`, seq: bjtSeq, deadline: bjtDeadline, seedHash: `demo-${bjtSeq.toString(16)}${'0'.repeat(58)}`, serverSeed: `demo-seed-${bjtSeq}` }) : null,
    mySeat: bjtMySeat,
  };
}
const bjtBroadcast = () => emit({ event: 'bjt', data: bjtTableView() });
const myBjt = () => bjtState?.players.find((p) => p.seat === bjtMySeat) ?? null;

function bjtNew() {
  bjtSeq++;
  bjtPaid = false;
  bjtState = bjtNewRound(shuffle(seededRng(bjtSeq * 104_729), createShoe(6)));
  bjtDeadline = Date.now() + 12_000;
  // Bots bet over the first seconds of the betting window.
  BJT_BOTS.forEach((seat, i) =>
    setTimeout(() => {
      if (!bjtState || bjtState.phase !== 'betting') return;
      bjtState = bjtPlaceBet(bjtState, seat, `bot${seat}`, [200, 500, 1_000, 2_000][(seat + bjtSeq) % 4]!);
      bjtBroadcast();
    }, 800 + i * 700),
  );
  bjtSchedule(12_000, bjtAdvance);
  bjtBroadcast();
}

function bjtSchedule(ms: number, fn: () => void) {
  if (bjtTimer) clearTimeout(bjtTimer);
  bjtTimer = setTimeout(fn, ms);
}

/** Server-style clock: deal after betting, close insurance, time out a slow turn, start the next round. */
function bjtAdvance() {
  if (!bjtState) return bjtNew();
  if (bjtState.phase === 'betting') {
    if (!bjtState.players.length) return bjtNew();
    bjtState = bjtDeal(bjtState);
    if (bjtState.phase === 'insurance') {
      for (const seat of BJT_BOTS) if (bjtState.players.some((p) => p.seat === seat)) bjtState = bjtInsure(bjtState, seat, 0);
      if (bjtState.phase === 'insurance') {
        bjtDeadline = Date.now() + 10_000;
        bjtSchedule(10_000, () => {
          if (bjtState?.phase === 'insurance') bjtState = bjtCloseInsurance(bjtState);
          bjtDrive();
        });
        return bjtBroadcast();
      }
    }
    return bjtDrive();
  }
  if (bjtState.phase === 'playing') {
    bjtState = bjtTimeout(bjtState);
    return bjtDrive();
  }
  bjtNew();
}

function bjtDrive() {
  if (!bjtState) return;
  if (bjtState.phase === 'done') {
    const me = myBjt();
    if (me && !bjtPaid) {
      bjtPaid = true;
      balance += me.payout;
      setTimeout(() => emit({ event: 'wallet', data: { balance } }), 0);
    }
    bjtDeadline = null;
    bjtBroadcast();
    return bjtSchedule(5_000, bjtNew);
  }
  if (bjtState.phase !== 'playing' || bjtState.turn === null) return bjtBroadcast();
  const p = bjtState.players[bjtState.turn]!;
  bjtDeadline = Date.now() + (p.seat === bjtMySeat ? 15_000 : 1_000);
  bjtBroadcast();
  if (p.seat === bjtMySeat) return bjtSchedule(15_000, bjtAdvance);
  bjtSchedule(1_000, () => {
    if (!bjtState || bjtState.phase !== 'playing') return;
    const h = p.hands[p.active]!;
    const total = h.cards.reduce((a, c) => a + Math.min(10, cardValue(c)), 0);
    bjtState = bjtAct(bjtState, p.seat, total < 16 ? 'hit' : 'stand');
    bjtDrive();
  });
}

// ----------------------------------------------------------------------------------- requests
export async function demoRequest(type: string, payload: Record<string, unknown>, onEvent: Emit): Promise<unknown> {
  emit = onEvent;
  await new Promise((r) => setTimeout(r, 90));
  switch (type) {
    // ---- live round tables (Tài Xỉu, Roulette)
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
      stake(bets.reduce((s, b) => s + b.amount, 0));
      const list = myBets.get(v.round.id) ?? [];
      for (const b of bets) list.push({ id: `b${Date.now()}${list.length}`, kind: b.kind, value: b.value ?? null, amount: b.amount, payout: null, status: 'placed' } as MyTableBet);
      myBets.set(v.round.id, list);
      return { myBets: list, balance };
    }
    // ---- Poker / Liêng / Xì Tố
    case 'card.join': {
      const id = String(payload.tableId || cardTable);
      if (id !== cardTable || !hand) {
        resetCardTable(id);
        newHand();
      }
      return cardView();
    }
    case 'card.leave':
      if (cardTimer) clearTimeout(cardTimer);
      return { ok: true };
    case 'card.act': {
      if (!hand || !seated || hand.players[hand.toAct]?.userId !== ME) throw new ApiError('illegal_action');
      try {
        hand = applyAction(hand, 0, { type: payload.action as CardAction['type'], amount: payload.amount as number | undefined });
      } catch {
        throw new ApiError('illegal_action');
      }
      syncStacks();
      deadline = Date.now() + cfgOf().turnMs;
      setTimeout(driveCard, 0);
      return { ok: true };
    }
    case 'card.stand': {
      const cash = stacks[0] ?? 0;
      if (hand && hand.phase === 'betting') {
        const me = hand.players.find((p) => p.userId === ME);
        if (me && !me.folded) {
          if (hand.players[hand.toAct]?.userId === ME) hand = applyAction(hand, 0, { type: 'fold' });
          else me.folded = true;
        }
      }
      seated = false;
      balance += cash;
      stacks[0] = 0;
      setTimeout(() => {
        emit({ event: 'wallet', data: { balance } });
        driveCard();
      }, 0);
      return { cashedOut: cash, leaving: false };
    }
    case 'card.sit': {
      const buyIn = Number(payload.buyIn) || cfgOf().minBuyIn;
      stake(buyIn);
      seated = true;
      stacks[0] = buyIn;
      setTimeout(() => emit({ event: 'wallet', data: { balance } }), 0);
      return cardView();
    }
    case 'card.back':
      return cardView();
    // ---- solo games
    case 'roulette.spin': {
      const bets = payload.bets as { kind: string; value?: number; amount: number }[];
      stake(bets.reduce((s, b) => s + b.amount, 0));
      const result = spinRoulette(soloRng(), bets as never);
      balance += result.payout;
      return envelope(result);
    }
    case 'sicbo.roll': {
      const bets = payload.bets as { kind: string; value?: number; amount: number }[];
      stake(bets.reduce((s, b) => s + b.amount, 0));
      const result = rollSicBo(soloRng(), bets as never);
      balance += result.payout;
      return envelope(result);
    }
    case 'slots.spin': {
      const bet = Number(payload.bet);
      stake(bet);
      const result = spinSlots(soloRng(), bet);
      balance += result.payout;
      return envelope(result);
    }
    case 'blackjack.start': {
      const bet = Number(payload.bet);
      stake(bet);
      bj = startBlackjack(soloRng(), bet);
      if (bj.phase === 'finished') balance += bj.payout;
      return envelope(blackjackView(bj));
    }
    case 'blackjack.action': {
      if (!bj || bj.phase === 'finished') throw new ApiError('bad_request');
      const action = payload.action as BlackjackAction;
      const amount = Number(payload.amount ?? 0);
      stake(extraStake(bj, action, amount));
      try {
        bj = applyBlackjackAction(bj, action, amount);
      } catch {
        throw new ApiError('illegal_action');
      }
      if (bj.phase === 'finished') balance += bj.payout;
      return envelope(blackjackView(bj));
    }
    case 'blackjack.resume':
      return bj && bj.phase !== 'finished' ? envelope(blackjackView(bj)) : null;
    // ---- Blackjack multiplayer
    case 'bjt.join':
      bjtTableId = String(payload.tableId || bjtTableId);
      if (!bjtState) bjtNew();
      return bjtTableView();
    case 'bjt.leave':
      return { ok: true };
    case 'bjt.sit':
      bjtMySeat = Number(payload.seat ?? BJT_SEAT_OF_ME);
      if (BJT_BOTS.includes(bjtMySeat)) throw new ApiError('bad_request');
      setTimeout(bjtBroadcast, 0);
      return bjtTableView();
    case 'bjt.stand':
      bjtMySeat = null;
      setTimeout(bjtBroadcast, 0);
      return { leaving: false };
    case 'bjt.bet': {
      if (!bjtState || bjtState.phase !== 'betting' || bjtMySeat === null) throw new ApiError('betting_closed');
      const amount = Number(payload.amount);
      stake(amount);
      bjtState = bjtPlaceBet(bjtState, bjtMySeat, ME, amount);
      setTimeout(() => {
        emit({ event: 'wallet', data: { balance } });
        bjtBroadcast();
      }, 0);
      return { ok: true };
    }
    case 'bjt.act': {
      if (!bjtState || bjtMySeat === null) throw new ApiError('illegal_action');
      const action = String(payload.action) as BlackjackAction;
      try {
        if (action === 'insurance') {
          const amount = Number(payload.amount ?? 0);
          stake(amount);
          bjtState = bjtInsure(bjtState, bjtMySeat, amount);
          if (bjtState.phase !== 'insurance') setTimeout(bjtDrive, 0);
          else setTimeout(bjtBroadcast, 0);
        } else {
          stake(bjtExtraStake(bjtState, bjtMySeat, action));
          bjtState = bjtAct(bjtState, bjtMySeat, action);
          setTimeout(bjtDrive, 0);
        }
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError('illegal_action');
      }
      setTimeout(() => emit({ event: 'wallet', data: { balance } }), 0);
      return { ok: true };
    }
    case 'ping':
      return { now: Date.now() };
    default:
      throw new ApiError('bad_request');
  }
}
