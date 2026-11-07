import { describe, expect, it } from 'vitest';
import { stackRegions } from './regions';

describe('stackRegions (portrait slices)', () => {
  it('fills the column width unless capped, stacks top to bottom', () => {
    const { placed, height } = stackRegions([{ x: 0, y: 0, w: 176, h: 100 }, { x: 0, y: 0, w: 704, h: 100 }], 360, 4);
    expect(placed[0]!.zoom).toBeCloseTo(2);
    expect(placed[1]!.zoom).toBeCloseTo(0.5);
    expect(placed[1]!.y).toBeCloseTo(4 + 200 + 4);
    expect(height).toBe(Math.ceil(4 + 200 + 4 + 50 + 4));
  });
  it('respects maxZoom and centres narrow slices', () => {
    const { placed } = stackRegions([{ x: 0, y: 0, w: 100, h: 100, maxZoom: 1.5 }], 360, 4);
    expect(placed[0]!.zoom).toBe(1.5);
    expect(placed[0]!.x).toBeCloseTo((360 - 150) / 2);
  });
});
