import { describe, expect, it } from 'vitest';
import { createShoe, startHand } from '@casino/shared';
import { blindSeats } from '../src/game/blinds';

describe('blind markers follow the server hand', () => {
  it('matches startHand for every table size and button', () => {
    for (let n = 2; n <= 6; n++) {
      const seats = Array.from({ length: n }, (_, i) => ({ seat: i * 2 % 7, userId: `u${i}`, stack: 10_000 }));
      for (let button = 0; button < 7; button++) {
        const h = startHand('poker', { smallBlind: 50, bigBlind: 100, ante: 0 }, seats, button, createShoe(1));
        const posts = h.actions.filter((a) => a.type === 'post');
        expect(blindSeats(h)).toEqual({ sb: posts[0]!.seat, bb: posts[1]!.seat });
      }
    }
  });

  it('shows no blind markers for Liêng and Xì Tố', () => {
    expect(blindSeats({ game: 'lieng', button: 0, players: [{ seat: 0 }, { seat: 1 }] })).toBeNull();
    expect(blindSeats({ game: 'xito', button: 0, players: [{ seat: 0 }, { seat: 1 }] })).toBeNull();
  });
});
