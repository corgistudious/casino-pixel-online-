import { describe, expect, it } from 'vitest';
import { createShoe, shuffle, type Card } from '../src/games/cards';
import { bestPokerHand, compareScores, evaluateFive, evaluateLieng } from '../src/games/handEval';
import { fairLikeRng } from './rngHelper';
import { applyAction, IllegalAction, legalActions, startHand, timeoutAction, type Hand } from '../src/games/seated';

const c = (s: string) => s.split(' ') as Card[];
const beats = (a: string, b: string) => compareScores(bestPokerHand(c(a)).score, bestPokerHand(c(b)).score);

describe('poker hand evaluation', () => {
  it('ranks every category correctly', () => {
    const order = [
      '2S 5H 9D JC KS 3D 7C', // high card
      '2S 2H 9D JC KS 3D 7C', // pair
      '2S 2H 9D 9C KS 3D 7C', // two pair
      '2S 2H 2D 9C KS 3D 7C', // trips
      '2S 3H 4D 5C 6S JD KC', // straight
      '2H 5H 9H JH KH 3D 7C', // flush
      '2S 2H 2D 9C 9S 3D 7C', // full house
      '2S 2H 2D 2C KS 3D 7C', // quads
      '5H 6H 7H 8H 9H 2D 2C', // straight flush
    ];
    for (let i = 1; i < order.length; i++) expect(beats(order[i]!, order[i - 1]!)).toBeGreaterThan(0);
    expect(bestPokerHand(c(order[8]!)).category).toBe('straight_flush');
  });
  it('handles the wheel, kickers and board plays', () => {
    expect(evaluateFive(c('AS 2H 3D 4C 5S')).category).toBe('straight');
    expect(beats('2S 3H 4D 5C 6S 9D 9C', 'AS 2H 3D 4C 5S 9D 9C')).toBeGreaterThan(0); // 6-high beats wheel
    expect(beats('AS KH 9D 9C 4S 3D 2C', 'AS QH 9D 9C 4S 3D 2C')).toBeGreaterThan(0); // kicker
    expect(beats('2S 3H AD KC QS JD 10C', '4S 5H AD KC QS JD 10C')).toBe(0); // board plays: split
  });
});

describe('Liêng evaluation', () => {
  const L = (s: string) => evaluateLieng(c(s));
  const cmp = (a: string, b: string) => compareScores(L(a).score, L(b).score);
  it('Sáp > Liêng > Ảnh > Điểm', () => {
    expect(L('7S 7H 7D').category).toBe('sap');
    expect(L('QS KH AD').category).toBe('lieng');
    expect(L('AS 2H 3D').category).toBe('lieng');
    expect(L('KS AH 2D').category).toBe('diem'); // K-A-2 is not a Liêng
    expect(L('JS QH KD').category).toBe('lieng'); // J-Q-K is a run: Liêng beats Ảnh
    expect(L('JS JH KD').category).toBe('anh');
    expect(cmp('2S 2H 2D', 'QS KH AD')).toBeGreaterThan(0);
    expect(cmp('AS 2H 3D', 'JS JH KD')).toBeGreaterThan(0);
    expect(cmp('JS JH KD', '4S 5H 9D')).toBeGreaterThan(0);
  });
  it('compares within categories and breaks ties by highest card then suit ♥ > ♦ > ♣ > ♠', () => {
    expect(cmp('AS AH AD', 'KS KH KD')).toBeGreaterThan(0);
    expect(cmp('QS KH AD', 'AS 2H 3D')).toBeGreaterThan(0); // Q-K-A highest, A-2-3 lowest
    expect(L('4S 5H 10D').score[1]).toBe(9);
    expect(L('KS QH 10D').score[1]).toBe(0); // 10/J/Q/K count 0
    expect(cmp('4S 5H 10D', '2S 3H 3D')).toBeGreaterThan(0); // 9 points > 8
    expect(cmp('KH 4S 5D', 'KS 4H 5C')).toBeGreaterThan(0); // same points, K♥ beats K♠
  });
});

const players = (stacks: number[]) => stacks.map((stack, i) => ({ seat: i, userId: `u${i}`, stack }));
const deckOf = (seed: number) => shuffle(fairLikeRng(seed), createShoe(1));
const act = (h: Hand, type: Parameters<typeof applyAction>[2]['type'], amount?: number) => applyAction(h, h.players[h.toAct]!.seat, { type, amount });
const totalChips = (h: Hand) => h.players.reduce((s, p) => s + p.stack + p.total * (h.phase === 'done' ? 0 : 1), 0);

describe('Hold\'em betting engine', () => {
  const cfg = { smallBlind: 50, bigBlind: 100, ante: 0 };

  it('posts blinds, deals 2 cards each and lets the big blind check its option', () => {
    let h = startHand('poker', cfg, players([1000, 1000, 1000]), 0, deckOf(1));
    expect(h.players.map((p) => p.streetBet)).toEqual([0, 50, 100]);
    expect(h.players.every((p) => p.hole.length === 2)).toBe(true);
    expect(h.players[h.toAct]!.seat).toBe(0); // UTG = button in 3-handed
    h = act(h, 'call');
    h = act(h, 'call'); // SB completes
    expect(legalActions(h, 2)!.canCheck).toBe(true); // BB option
    h = act(h, 'check');
    expect(h.street).toBe(1);
    expect(h.board).toHaveLength(3);
    expect(h.players[h.toAct]!.seat).toBe(1); // first after the button post-flop
  });

  it('heads-up: the button posts the small blind and acts first pre-flop, last after', () => {
    let h = startHand('poker', cfg, players([1000, 1000]), 0, deckOf(2));
    expect(h.players[0]!.streetBet).toBe(50);
    expect(h.players[h.toAct]!.seat).toBe(0);
    h = act(h, 'call');
    h = act(h, 'check');
    expect(h.players[h.toAct]!.seat).toBe(1);
  });

  it('enforces minimum raises and turn order; rejects illegal actions', () => {
    let h = startHand('poker', cfg, players([5000, 5000, 5000]), 0, deckOf(3));
    expect(() => applyAction(h, 2, { type: 'call' })).toThrow(IllegalAction); // not your turn
    expect(() => act(h, 'raise', 150)).toThrow(IllegalAction); // min raise to 200
    h = act(h, 'raise', 300);
    expect(h.minRaise).toBe(200);
    expect(() => act(h, 'raise', 400)).toThrow(IllegalAction);
    h = act(h, 'raise', 500);
    expect(legalActions(h, 2)!.minRaiseTo).toBe(700);
    expect(() => act(h, 'check')).toThrow(IllegalAction);
  });

  it('builds side pots correctly with three all-ins of different sizes', () => {
    // Seat 0: 300, seat 1: 700, seat 2: 1500, seat 3: 1500. All in pre-flop.
    let h = startHand('poker', cfg, players([300, 700, 1500, 1500]), 3, deckOf(4));
    while (h.phase === 'betting') h = act(h, 'allin');
    const r = h.result!;
    expect(r.showdown).toBe(true);
    expect(r.pots.map((p) => p.amount)).toEqual([1200, 1200, 1600]);
    expect(r.pots.map((p) => p.eligible.length)).toEqual([4, 3, 2]);
    expect(Object.values(r.payouts).reduce((a, b) => a + b, 0)).toBe(4000);
    expect(h.players.reduce((s, p) => s + p.stack, 0)).toBe(4000);
    // Every pot winner was eligible for it.
    for (const pot of r.pots) for (const w of pot.winners) expect(pot.eligible).toContain(w);
  });

  it('returns the uncalled part of a bet and pays an uncontested pot without showdown', () => {
    let h = startHand('poker', cfg, players([1000, 1000, 1000]), 0, deckOf(5));
    h = act(h, 'raise', 600);
    h = act(h, 'fold');
    h = act(h, 'fold');
    expect(h.phase).toBe('done');
    expect(h.result!.showdown).toBe(false);
    expect(h.result!.shown).toEqual({});
    expect(h.players.map((p) => p.stack)).toEqual([1150, 950, 900]);
  });

  it('a short all-in raise does not re-open betting for players who already acted', () => {
    let h = startHand('poker', cfg, players([5000, 5000, 350]), 0, deckOf(6));
    h = act(h, 'call'); // seat 0 calls 100
    h = act(h, 'call'); // seat 1 (SB) completes
    // Seat 2 (BB, 350 total) shoves: raise of 250 is more than the min (100) → full raise
    h = act(h, 'allin');
    expect(legalActions(h, 0)!.canRaise).toBe(true);
    // Incomplete raise: button 2, SB = seat 3 (380 chips), BB = seat 0, UTG = seat 1.
    let g = startHand('poker', cfg, players([5000, 5000, 5000, 380]), 2, deckOf(7));
    expect(g.players[g.toAct]!.seat).toBe(1);
    g = act(g, 'raise', 300); // UTG raises to 300 (raise of 200)
    g = act(g, 'call'); // button calls
    g = act(g, 'allin'); // SB all-in to 380: +80, less than a full raise
    expect(g.currentBet).toBe(380);
    expect(legalActions(g, 0)!.canRaise).toBe(true); // BB has not acted yet
    g = act(g, 'call');
    expect(g.players[g.toAct]!.seat).toBe(1);
    expect(legalActions(g, 1)).toMatchObject({ canRaise: false, toCall: 80 }); // already acted: call or fold only
  });

  it('runs the board out when everyone is all-in and conserves chips', () => {
    for (let seed = 10; seed < 60; seed++) {
      let h = startHand('poker', cfg, players([500, 800, 1200]), seed % 3, deckOf(seed));
      while (h.phase === 'betting') h = act(h, 'allin');
      expect(h.board).toHaveLength(5);
      expect(h.players.reduce((s, p) => s + p.stack, 0)).toBe(2500);
    }
  });

  it('timeouts check when possible, else fold, and count consecutive timeouts', () => {
    let h = startHand('poker', cfg, players([1000, 1000, 1000]), 0, deckOf(8));
    h = timeoutAction(h); // UTG must call 100 → fold
    expect(h.players[0]!.folded).toBe(true);
    expect(h.players[0]!.timeouts).toBe(1);
    h = act(h, 'call');
    h = timeoutAction(h); // BB can check
    expect(h.players[2]!.folded).toBe(false);
    expect(h.street).toBe(1);
  });

  it('random full hands always conserve chips and end with valid pots', () => {
    for (let seed = 100; seed < 300; seed++) {
      const r = fairLikeRng(seed);
      let h = startHand('poker', cfg, players([2000, 1500, 3000, 800, 2500]), seed % 5, deckOf(seed));
      const before = 2000 + 1500 + 3000 + 800 + 2500;
      let guard = 0;
      while (h.phase === 'betting' && guard++ < 200) {
        const l = legalActions(h, h.players[h.toAct]!.seat)!;
        const roll = r.float();
        if (roll < 0.15) h = act(h, 'fold');
        else if (roll < 0.6) h = act(h, l.canCheck ? 'check' : 'call');
        else if (roll < 0.9 && l.canRaise) h = act(h, 'raise', l.minRaiseTo);
        else h = act(h, 'allin');
      }
      expect(h.phase).toBe('done');
      expect(h.players.reduce((s, p) => s + p.stack, 0)).toBe(before);
      expect(totalChips(h)).toBe(before);
    }
  });
});

describe('Liêng and Xì Tố', () => {
  it('Liêng: antes, 3 cards, one betting round, showdown by Liêng ranking', () => {
    let h = startHand('lieng', { smallBlind: 0, bigBlind: 100, ante: 100 }, players([1000, 1000, 1000]), 0, deckOf(20));
    expect(h.players.every((p) => p.hole.length === 3 && p.total === 100)).toBe(true);
    h = act(h, 'bet', 200);
    h = act(h, 'call');
    h = act(h, 'fold');
    expect(h.phase).toBe('done');
    expect(h.result!.pots[0]!.amount).toBe(700);
    const [a, b] = h.result!.pots[0]!.eligible;
    const winner = compareScores(evaluateLieng(h.players[a!]!.hole).score, evaluateLieng(h.players[b!]!.hole).score) > 0 ? a : b;
    expect(h.result!.pots[0]!.winners).toEqual([winner]);
  });

  it('Xì Tố: 1 hidden + 1 open, then 3 open cards with a betting round each; best visible hand acts first', () => {
    let h = startHand('xito', { smallBlind: 0, bigBlind: 100, ante: 50 }, players([2000, 2000, 2000]), 0, deckOf(30));
    expect(h.players.every((p) => p.hole.length === 1 && p.up.length === 1)).toBe(true);
    for (let street = 0; street < 4; street++) {
      expect(h.street).toBe(street);
      while (h.phase === 'betting' && h.street === street) h = act(h, 'check');
    }
    expect(h.phase).toBe('done');
    expect(h.players.every((p) => p.up.length === 4)).toBe(true);
    expect(Object.values(h.result!.shown).every((s) => s.best.length === 5)).toBe(true);
  });
});
