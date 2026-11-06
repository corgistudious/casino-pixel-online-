import { describe, expect, it } from 'vitest';
import { BOARD_RAIL, DICE_WORLD_MAX, DICE_WORLD_MIN, adaptiveWorldWidth, diceBoardLayout, topRowSpots } from '../src/game/layouts/diceBoard';

const inside = (r: { x: number; y: number; w: number; h: number }, c: { x: number; y: number; w: number; h: number }) =>
  r.x >= c.x - 0.01 && r.y >= c.y - 0.01 && r.x + r.w <= c.x + c.w + 0.01 && r.y + r.h <= c.y + c.h + 0.01;

describe('adaptiveWorldWidth', () => {
  it('follows the stage aspect between 640 and 820', () => {
    expect(adaptiveWorldWidth(16 / 9)).toBe(640);
    expect(adaptiveWorldWidth(2)).toBe(720);
    expect(adaptiveWorldWidth(4)).toBe(DICE_WORLD_MAX);
    expect(adaptiveWorldWidth(1.2)).toBe(DICE_WORLD_MIN);
    expect(adaptiveWorldWidth(null)).toBe(640);
    expect(adaptiveWorldWidth(Number.NaN)).toBe(640);
  });
});

describe('diceBoardLayout (every world width from 640 to 820)', () => {
  for (let w = DICE_WORLD_MIN; w <= DICE_WORLD_MAX; w += 4) {
    const L = diceBoardLayout(w, 360);
    const felt = { x: BOARD_RAIL, y: BOARD_RAIL, w: w - 2 * BOARD_RAIL, h: 360 - 2 * BOARD_RAIL };
    it(`w=${w}: board rows and captions inside the printable felt, clear of the rail`, () => {
      for (const r of [L.row1, L.row2, L.row3]) expect(inside(r, L.content)).toBe(true);
      expect(L.board.x + L.board.w).toBeLessThanOrEqual(felt.x + felt.w - 12);
      expect(L.singleLabelY).toBeLessThan(L.content.y + L.content.h);
    });
    it(`w=${w}: dice plate inside the felt and never under the board`, () => {
      const plate = { x: L.bowl.x - L.bowl.r, y: L.bowl.y - L.bowl.r, w: L.bowl.r * 2, h: L.bowl.r * 2 };
      expect(inside(plate, felt)).toBe(true);
      expect(L.bowl.x + L.bowl.r + 9).toBeLessThan(L.board.x); // incl. its shadow
      expect(L.result.y).toBeLessThan(L.content.y + L.content.h);
    });
    it(`w=${w}: top row covers the board exactly; spots keep a usable size`, () => {
      const top = topRowSpots(L);
      expect(top.map((s) => s.key)).toEqual(['small', 'odd', 'anyTriple', 'even', 'big']);
      expect(top[0]!.x).toBe(L.board.x);
      expect(top[4]!.x + top[4]!.w).toBe(L.board.x + L.board.w);
      expect(Math.min(...top.map((s) => s.w))).toBeGreaterThanOrEqual(60);
      expect(L.row2.w / 14).toBeGreaterThanOrEqual(29); // totals 4…17
      expect(L.row3.w / 6).toBeGreaterThanOrEqual(68); // singles
      expect(Math.min(L.row1.h, L.row2.h, L.row3.h)).toBeGreaterThanOrEqual(56);
    });
  }
  it('rows never overlap each other or their captions', () => {
    const L = diceBoardLayout(640, 360);
    expect(L.row1.y + L.row1.h).toBeLessThanOrEqual(L.row2.y);
    expect(L.row2.y + L.row2.h).toBeLessThan(L.totalLabelY);
    expect(L.totalLabelY).toBeLessThan(L.row3.y);
    expect(L.row3.y + L.row3.h).toBeLessThan(L.singleLabelY);
  });
  it('wider stages give wider spots (adaptive, not letterboxed)', () => {
    expect(diceBoardLayout(820).row2.w).toBeGreaterThan(diceBoardLayout(640).row2.w + 150);
  });
});
