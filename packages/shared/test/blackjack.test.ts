import { describe, expect, it } from 'vitest';
import {
  applyBlackjackAction,
  blackjackView,
  handValue,
  seededRng,
  startBlackjack,
  type BlackjackState,
  type Card,
} from '../src';

function fixed(player: Card[], dealer: Card[], shoeTop: Card[] = [], bet = 100): BlackjackState {
  // shoe pops from the end, so the next card drawn is the last element
  return { shoe: shoeTop.slice().reverse(), player, dealer, bet, doubled: false, phase: 'player', outcome: null, payout: 0 };
}

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
    expect(s.player).toHaveLength(3);
    expect(s.doubled).toBe(true);
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
      expect(s.player.length + s.dealer.length + s.shoe.length).toBe(312);
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
        const total = handValue(s.player).total;
        if (total === 11 && s.player.length === 2) {
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
});
