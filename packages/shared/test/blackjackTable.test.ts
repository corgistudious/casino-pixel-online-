import { describe, expect, it } from 'vitest';
import {
  bjtAct,
  bjtExtraStake,
  bjtCloseInsurance,
  createShoe,
  bjtDeal,
  bjtInsure,
  bjtNewRound,
  bjtPlaceBet,
  bjtStake,
  seededRng,
  shuffle,
  bjtTimeout,
  bjtView,
  type BjtState,
  type Card,
} from '../src';

/** Shoe whose next draws are `top` in order (draw pops from the end). */
const shoe = (top: Card[]) => [...createShoe(1).filter(() => false), ...top.slice().reverse()];
/** Deal order: each player's 1st card, dealer up, each player's 2nd card, dealer hole. */
function table(bets: [number, number][], cards: Card[]): BjtState {
  let s = bjtNewRound(shoe(cards));
  bets.forEach(([seat, bet], i) => (s = bjtPlaceBet(s, seat, `u${i}`, bet)));
  return bjtDeal(s);
}
const meta = { id: 'r', seq: 1, deadline: null, seedHash: 'h', serverSeed: 's' };

describe('blackjack table', () => {
  it('players act in seat order against one dealer; the dealer plays once at the end', () => {
    // seat 0: 10,6 ; seat 2: 9,9 ; dealer 10 up, 7 hole. Then seat 0 hits 5 → 21 (auto done), seat 2 stands.
    let s = table([[2, 100], [0, 100]], ['10S', '9H', '10D', '6C', '9S', '7H', '5D']);
    expect(s.phase).toBe('playing');
    expect(s.players.map((p) => p.seat)).toEqual([0, 2]);
    expect(bjtView(s, meta).turnSeat).toBe(0);
    expect(() => bjtAct(s, 2, 'stand')).toThrow();
    s = bjtAct(s, 0, 'hit');
    expect(bjtView(s, meta).turnSeat).toBe(2);
    s = bjtAct(s, 2, 'stand');
    expect(s.phase).toBe('done');
    expect(s.players.map((p) => [p.hands[0]!.outcome, p.payout])).toEqual([
      ['win', 200],
      ['win', 200],
    ]);
  });

  it('hides the hole card until the round is settled', () => {
    const s = table([[0, 100]], ['10S', '10D', '6C', '7H']);
    const v = bjtView(s, meta);
    expect(v.dealer).toEqual(['10D', null]);
    expect(v.serverSeed).toBeNull();
    expect(JSON.stringify(v)).not.toContain('7H');
  });

  it('insurance is decided per player; dealer blackjack pays it 2:1 and settles everyone', () => {
    // dealer A up, K hole (blackjack). seat 0: 10,7 insures 50 ; seat 1: A,K natural declines ; seat 3: 9,9 no decision (timeout).
    let s = table([[0, 100], [1, 100], [3, 100]], ['10S', 'AH', '9C', 'AD', '7S', 'KH', '9D', 'KS']);
    expect(s.phase).toBe('insurance');
    expect(bjtExtraStake(s, 0, 'insurance', 50)).toBe(50);
    expect(() => bjtInsure(s, 0, 51)).toThrow();
    s = bjtInsure(s, 0, 50);
    expect(() => bjtInsure(s, 0, 10)).toThrow();
    s = bjtInsure(s, 1, 0);
    expect(s.phase).toBe('insurance');
    s = bjtCloseInsurance(s);
    expect(s.phase).toBe('done');
    expect(s.players.map((p) => [p.seat, p.hands[0]!.outcome, p.insurancePayout, p.payout])).toEqual([
      [0, 'dealer_blackjack', 150, 150],
      [1, 'push', 0, 100],
      [3, 'dealer_blackjack', 0, 0],
    ]);
    expect(bjtStake(s.players[0]!)).toBe(150);
  });

  it('insurance lost when the dealer has no blackjack; play goes on; a natural pays 3:2 at once', () => {
    // dealer A up, 6 hole. seat 0: A,K natural ; seat 1: 10,8.
    let s = table([[0, 100], [1, 100]], ['AH', '10C', 'AD', 'KH', '8S', '6C']);
    s = bjtInsure(s, 0, 0);
    s = bjtInsure(s, 1, 50);
    expect(s.phase).toBe('playing');
    expect(s.players[0]!.hands[0]!.outcome).toBe('blackjack');
    expect(bjtView(s, meta).turnSeat).toBe(1);
    s = bjtAct(s, 1, 'stand'); // dealer A+6 = soft 17 stands; 18 beats 17
    expect(s.players.map((p) => p.payout)).toEqual([250, 200]);
    expect(s.players[1]!.insurancePayout).toBe(0);
    expect(bjtStake(s.players[1]!)).toBe(150);
  });

  it('timeouts stand for the player; split and double work per seat', () => {
    // seat 0: 8,8 ; seat 1: 5,6 ; dealer 10 up, 7 hole ; then split draws 3,K ; seat 1 doubles with 9.
    let s = table([[0, 100], [1, 100]], ['8S', '5H', '10D', '8C', '6S', '7H', '3D', 'KC', '9D']);
    expect(bjtExtraStake(s, 0, 'split')).toBe(100);
    s = bjtAct(s, 0, 'split');
    expect(s.players[0]!.hands.map((h) => h.cards)).toEqual([['8S', '3D'], ['8C', 'KC']]);
    s = bjtTimeout(s); // first split hand stands at 11
    expect(s.players[0]!.timeouts).toBe(1);
    s = bjtAct(s, 0, 'stand');
    expect(s.players[0]!.timeouts).toBe(0);
    s = bjtAct(s, 1, 'double');
    expect(s.phase).toBe('done');
    expect(s.players[0]!.hands.map((h) => h.outcome)).toEqual(['lose', 'win']);
    expect(s.players[1]!.hands[0]!.outcome).toBe('win');
    expect(s.players[1]!.payout).toBe(400);
  });

  it('random rounds with up to five players conserve chips', () => {
    for (let seed = 0; seed < 400; seed++) {
      const rng = seededRng(seed);
      let s = bjtNewRound(shuffle(rng, createShoe(6)));
      const seats = 1 + (seed % 5);
      for (let i = 0; i < seats; i++) s = bjtPlaceBet(s, i, `u${i}`, 100);
      s = bjtDeal(s);
      const staked = new Map(s.players.map((p) => [p.seat, 100]));
      if (s.phase === 'insurance') {
        for (const p of s.players) if (p.seat % 2) {
          staked.set(p.seat, staked.get(p.seat)! + bjtExtraStake(s, p.seat, 'insurance', 50));
          s = bjtInsure(s, p.seat, 50);
          if (s.phase !== 'insurance') break;
        }
        if (s.phase === 'insurance') s = bjtCloseInsurance(s);
      }
      let guard = 0;
      while (s.phase === 'playing' && guard++ < 100) {
        const p = s.players[s.turn!]!;
        const total = p.hands[p.active]!.cards.length;
        const action = total === 2 && seed % 3 === 0 ? 'double' : p.hands[p.active]!.cards.reduce(() => 0, 0) === 0 && guard % 4 === 0 ? 'stand' : 'hit';
        staked.set(p.seat, staked.get(p.seat)! + bjtExtraStake(s, p.seat, action));
        s = bjtAct(s, p.seat, action);
      }
      expect(s.phase).toBe('done');
      for (const p of s.players) {
        expect(bjtStake(p)).toBe(staked.get(p.seat));
        expect(p.payout).toBe(p.hands.reduce((a, h) => a + h.payout, 0) + p.insurancePayout);
        expect(p.payout).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
