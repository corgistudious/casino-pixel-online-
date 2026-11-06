import { describe, expect, it } from 'vitest';
import { compactChips } from '../src/lib/format';

describe('compactChips', () => {
  it('keeps small amounts as they are', () => {
    expect(compactChips(0)).toBe('0');
    expect(compactChips(10)).toBe('10');
    expect(compactChips(999)).toBe('999');
    expect(compactChips(-1500)).toBe('-1500'); // unchanged behaviour for negatives
  });
  it('shortens thousands and millions with one decimal', () => {
    expect(compactChips(1_000)).toBe('1K');
    expect(compactChips(1_500)).toBe('1.5K');
    expect(compactChips(25_000)).toBe('25K');
    expect(compactChips(999_949)).toBe('999.9K');
    expect(compactChips(1_000_000)).toBe('1M');
    expect(compactChips(2_340_000)).toBe('2.3M');
    expect(compactChips(1_000_000_000)).toBe('1B');
  });
  it('moves to the next unit when rounding reaches 1000 (never "1000K" / "1000M")', () => {
    expect(compactChips(999_950)).toBe('1M');
    expect(compactChips(999_999)).toBe('1M');
    expect(compactChips(999_999_999)).toBe('1B');
    expect(compactChips(999_950_000)).toBe('1B');
  });
});
