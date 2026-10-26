import { describe, expect, it } from 'vitest';
import {
  applyBlackjackAction,
  blackjackView,
  canSplit,
  extraStake,
  handValue,
  normalizeBlackjack,
  seededRng,
  startBlackjack,
  totalStake,
  type BlackjackState,
  type Card,
} from '../src';

function fixed(player: Card[], dealer: Card[], shoeTop: Card[] = [], bet = 100): BlackjackState {
  // shoe pops from the end, so the next card drawn is the first element of shoeTop
  return {
    shoe: shoeTop.slice().reverse(),
    dealer,
    hands: [{ cards: player, bet, doubled: false, done: false, split: false, splitAces: false, outcome: null, payout: 0 }],
    active: 0,
    bet,
    phase: 'player',
    outcome: null,
    payout: 0,
  };
}
const cardsOf = (s: BlackjackState) => s.hands[s.active]!.cards;

describe('blackjack', () => {
  it('hand values with soft aces', () => {
    expect(handValue(['AS', 'KD'])).toEqual({ total: 21, soft: true });
    expect(handValue(['AS', 'AD', '9C'])).toEqual({ total: 21, soft: true });
    expect(handValue(['AS', 'AD', '9C', 'KH'])).toEqual({ total: 21, soft: false });
    expect(handValue(['10S', '6D', 'QC'])).toEqual({ total: 26, soft: false });
  });

  it('player busts', () => {
    const s = applyBlackjackAction(fixed(['10S', '6D'], ['9H', '7C'], ['QC']), 'hit');
    expect(s.outcome).toBe('bust');
    expect(s.payout).toBe(0);
  });

  it('dealer draws to 17 and busts', () => {
    const s = applyBlackjackAction(fixed(['10S', '8D'], ['9H', '6C'], ['KD']), 'stand');
    expect(s.dealer).toHaveLength(3);
    expect(s.outcome).toBe('win');
    expect(s.payout).toBe(200);
  });

  it('push returns the stake', () => {
    const s = applyBlackjackAction(fixed(['10S', '8D'], ['9H', '9C']), 'stand');
    expect(s.outcome).toBe('push');
    expect(s.payout).toBe(100);
  });

  it('double draws one card and doubles the stake', () => {
    const s = applyBlackjackAction(fixed(['5S', '6D'], ['10H', '7C'], ['KD']), 'double');
    expect(s.hands[0]!.cards).toHaveLength(3);
    expect(s.hands[0]!.doubled).toBe(true);
    expect(s.outcome).toBe('win');
    expect(s.payout).toBe(400);
  });

  it('cannot act after finishing', () => {
    const s = applyBlackjackAction(fixed(['10S', '8D'], ['9H', '9C']), 'stand');
    expect(() => applyBlackjackAction(s, 'hit')).toThrow();
  });

  it('hides the hole card while the player acts', () => {
    const view = blackjackView(fixed(['10S', '5D'], ['9H', '9C'], ['2C']));
    expect(view.dealer).toEqual(['9H', null]);
    expect(view.dealerTotal).toBeNull();
    expect(JSON.stringify(view)).not.toContain('9C');
    expect(JSON.stringify(view)).not.toContain('2C');
  });

  it('natural blackjack pays 3:2 immediately', () => {
    for (let seed = 0; seed < 500; seed++) {
      const s = startBlackjack(seededRng(seed), 100);
      expect(s.hands[0]!.cards.length + s.dealer.length + s.shoe.length).toBe(312);
      if (s.outcome === 'blackjack') {
        expect(s.payout).toBe(250);
        return;
      }
    }
    throw new Error('no blackjack found in 500 seeds');
  });

  it('basic strategy-ish play returns a sane RTP', () => {
    let bet = 0;
    let paid = 0;
    for (let seed = 0; seed < 20_000; seed++) {
      let s = startBlackjack(seededRng(seed), 10);
      bet += 10;
      while (s.phase === 'player') {
        const total = handValue(cardsOf(s)).total;
        if (total === 11 && cardsOf(s).length === 2) {
          bet += 10;
          s = applyBlackjackAction(s, 'double');
        } else s = applyBlackjackAction(s, total < 17 ? 'hit' : 'stand');
      }
      paid += s.payout;
    }
    const rtp = paid / bet;
    expect(rtp).toBeGreaterThan(0.85);
    expect(rtp).toBeLessThan(1.02);
  });

  it('split: two hands, each with its own stake and result', () => {
    // Player 8-8 vs dealer 10-7. Split → [8,3] and [8,10]; hit hand 1 → [8,3,9]=20; hand 2 stands at 18.
    let s = fixed(['8S', '8D'], ['10H', '7C'], ['3C', '10D', '9S']);
    expect(canSplit(s)).toBe(true);
    expect(extraStake(s, 'split')).toBe(100);
    s = applyBlackjackAction(s, 'split');
    expect(s.hands.map((h) => h.cards)).toEqual([['8S', '3C'], ['8D', '10D']]);
    expect(totalStake(s)).toBe(200);
    s = applyBlackjackAction(s, 'hit');
    s = applyBlackjackAction(s, 'stand');
    expect(s.active).toBe(1);
    s = applyBlackjackAction(s, 'stand');
    expect(s.phase).toBe('finished');
    expect(s.hands.map((h) => h.outcome)).toEqual(['win', 'win']);
    expect(s.payout).toBe(400);
    expect(s.outcome).toBe('win');
  });

  it('split then double the second hand; mixed results are summed', () => {
    // 9-9 vs dealer 10-8 (18). Split → [9,2] and [9,9]. Hand 1 doubles → [9,2,10]=21 (win 400). Hand 2 stands at 18 (push 100).
    let s = fixed(['9S', '9D'], ['10H', '8C'], ['2C', '9H', '10S']);
    s = applyBlackjackAction(s, 'split');
    expect(extraStake(s, 'double')).toBe(100);
    s = applyBlackjackAction(s, 'double');
    expect(s.active).toBe(1);
    s = applyBlackjackAction(s, 'stand');
    expect(s.hands.map((h) => [h.outcome, h.payout])).toEqual([['win', 400], ['push', 100]]);
    expect(totalStake(s)).toBe(300);
    expect(s.payout).toBe(500);
  });

  it('split aces take exactly one card each and a 21 there is not a natural', () => {
    let s = fixed(['AS', 'AD'], ['10H', '7C'], ['KC', '5D']);
    s = applyBlackjackAction(s, 'split');
    expect(s.phase).toBe('finished');
    expect(s.hands.map((h) => h.cards.length)).toEqual([2, 2]);
    expect(s.hands[0]!.outcome).toBe('win');
    expect(s.hands[0]!.payout).toBe(200); // 1:1, not 3:2
    expect(s.hands[1]!.outcome).toBe('lose');
  });

  it('re-splits up to four hands, never more; unequal cards cannot split', () => {
    let s = fixed(['8S', '8D'], ['10H', '7C'], ['8C', '8H', '8S', '2D', '2C', '2H', '2S']);
    s = applyBlackjackAction(s, 'split');
    expect(canSplit(s)).toBe(true);
    s = applyBlackjackAction(s, 'split');
    s = applyBlackjackAction(s, 'split');
    expect(s.hands).toHaveLength(4);
    expect(canSplit(s)).toBe(false);
    expect(() => applyBlackjackAction(s, 'split')).toThrow();
    expect(canSplit(fixed(['8S', '9D'], ['10H', '7C']))).toBe(false);
    expect(canSplit(fixed(['KS', 'QD'], ['10H', '7C']))).toBe(true);
  });

  it('all hands busted: the dealer does not draw', () => {
    let s = fixed(['10S', '6D'], ['10H', '6C'], ['KC', '9D']);
    s = applyBlackjackAction(s, 'hit');
    expect(s.outcome).toBe('bust');
    expect(s.dealer).toHaveLength(2);
  });

  it('a state saved by the single-hand version keeps playing', () => {
    const legacy = { shoe: ['KD'], player: ['10S', '8D'], dealer: ['9H', '6C'], bet: 50, doubled: false, phase: 'player', outcome: null, payout: 0 } as unknown as BlackjackState;
    expect(normalizeBlackjack(legacy).hands[0]!.cards).toEqual(['10S', '8D']);
    expect(blackjackView(legacy).playerTotal).toBe(18);
    const s = applyBlackjackAction(legacy, 'stand');
    expect(s.outcome).toBe('win');
    expect(s.payout).toBe(100);
  });

  it('random play with splits never creates or loses chips beyond the rules', () => {
    for (let seed = 0; seed < 3_000; seed++) {
      let s = startBlackjack(seededRng(seed), 10);
      let staked = 10;
      while (s.phase === 'player') {
        const view = blackjackView(s);
        const action = view.canSplit ? 'split' : view.canDouble && seed % 3 === 0 ? 'double' : view.playerTotal < 17 ? 'hit' : 'stand';
        staked += extraStake(s, action);
        s = applyBlackjackAction(s, action);
      }
      expect(totalStake(s)).toBe(staked);
      for (const h of s.hands) expect([0, h.bet * (h.doubled ? 2 : 1), h.bet * (h.doubled ? 4 : 2), 25]).toContain(h.payout);
      expect(s.payout).toBe(s.hands.reduce((a, h) => a + h.payout, 0));
      const view = JSON.stringify(blackjackView(s));
      expect(view).not.toContain('shoe');
    }
  });
});
