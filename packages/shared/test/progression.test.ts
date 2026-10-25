import { describe, expect, it } from 'vitest';
import {
  applyRankResult,
  DIVISIONS,
  DIVISION_COUNT,
  demotionRisk,
  EXP_MAX,
  expToNext,
  LEVEL_MAX,
  levelFromExp,
  MAX_DIVISION,
  PROTECTED_MAX_DIVISION,
  RP_PER_DIVISION,
  SERIES_DIVISIONS,
  softReset,
  topEligible,
  topTitleFor,
  totalExpForLevel,
  type RankState,
} from '../src/progression';

const idx = (tier: string, roman: number) => DIVISIONS.find((d) => d.tier === tier && d.roman === roman)!.index;
const play = (s: RankState, results: ('win' | 'loss')[]) => results.reduce((st, r) => applyRankResult(st, r).after, s);

describe('level', () => {
  it('runs from 1 to 999 with growing requirements and never past the cap', () => {
    expect(levelFromExp(0)).toEqual({ level: 1, totalExp: 0, intoLevel: 0, needed: 100 });
    expect(levelFromExp(99).level).toBe(1);
    expect(levelFromExp(100).level).toBe(2);
    expect(levelFromExp(100 + 110).level).toBe(3);
    expect(expToNext(500)).toBeGreaterThan(expToNext(10));
    expect(levelFromExp(EXP_MAX)).toMatchObject({ level: LEVEL_MAX, needed: 0, intoLevel: 0 });
    expect(levelFromExp(EXP_MAX * 10).level).toBe(LEVEL_MAX);
    for (const l of [2, 57, 400, 998]) expect(levelFromExp(totalExpForLevel(l)).level).toBe(l);
    for (const l of [2, 57, 400, 998]) expect(levelFromExp(totalExpForLevel(l) - 1).level).toBe(l - 1);
  });
});

describe('rank ladder', () => {
  it('has 40 divisions: Đồng III … Chiến Thần I', () => {
    expect(DIVISION_COUNT).toBe(40);
    expect(DIVISIONS[0]).toMatchObject({ tier: 'bronze', roman: 3 });
    expect(DIVISIONS[PROTECTED_MAX_DIVISION]).toMatchObject({ tier: 'gold', roman: 1 });
    expect(DIVISIONS[PROTECTED_MAX_DIVISION + 1]).toMatchObject({ tier: 'platinum', roman: 5 });
    expect(DIVISIONS[MAX_DIVISION]).toMatchObject({ tier: 'wargod', roman: 1 });
    expect(SERIES_DIVISIONS.map((d) => DIVISIONS[d]!.tier)).toEqual(['platinum', 'diamond', 'star', 'master', 'legend']);
    expect(SERIES_DIVISIONS.every((d) => DIVISIONS[d]!.roman === 1)).toBe(true);
  });

  it('needs 200 RP per division (8 wins of 25)', () => {
    const s = play({ division: idx('bronze', 3), rp: 0, streak: 0 }, Array(8).fill('win'));
    expect(s).toEqual({ division: idx('bronze', 2), rp: 0, streak: 0 });
    const p = play({ division: idx('platinum', 5), rp: 190, streak: 0 }, ['win']);
    expect(p).toEqual({ division: idx('platinum', 4), rp: 15, streak: 0 });
  });

  it('protects Đồng/Bạc/Vàng: losses cost nothing, RP is never negative', () => {
    for (const d of [0, 3, 6, PROTECTED_MAX_DIVISION]) {
      expect(play({ division: d, rp: 0, streak: 0 }, ['loss', 'loss', 'loss'])).toEqual({ division: d, rp: 0, streak: 0 });
      expect(play({ division: d, rp: 120, streak: 0 }, ['loss'])).toEqual({ division: d, rp: 120, streak: 0 });
    }
  });

  it('costs RP from Bạch Kim V, can drop to Vàng I, and Vàng I is protected again', () => {
    const start = { division: idx('platinum', 5), rp: 10, streak: 0 };
    expect(demotionRisk(start)).toBe(true);
    const c = applyRankResult(start, 'loss');
    expect(c.demoted).toBe(true);
    expect(c.after).toEqual({ division: PROTECTED_MAX_DIVISION, rp: 190, streak: 0 });
    expect(play(c.after, ['loss', 'loss'])).toEqual(c.after);
    expect(play({ division: idx('diamond', 3), rp: 100, streak: 0 }, ['loss'])).toEqual({ division: idx('diamond', 3), rp: 80, streak: 0 });
  });

  it('Bạch Kim I → Kim Cương V needs 200 RP and then 3 wins in a row; a loss resets the series', () => {
    const pI = idx('platinum', 1);
    let s = play({ division: pI, rp: 190, streak: 0 }, ['win']);
    expect(s).toEqual({ division: pI, rp: 200, streak: 0 }); // RP full, series open
    s = play(s, ['win', 'win']);
    expect(s).toEqual({ division: pI, rp: 200, streak: 2 });
    const lost = applyRankResult(s, 'loss');
    expect(lost.seriesReset).toBe(true);
    expect(lost.after).toEqual({ division: pI, rp: 180, streak: 0 }); // must refill RP first
    s = play(lost.after, ['win', 'win', 'win', 'win']);
    expect(s).toEqual({ division: idx('diamond', 5), rp: 0, streak: 0 });
  });

  it('every series division needs the streak; lower promotions do not', () => {
    for (const d of SERIES_DIVISIONS) {
      const s = play({ division: d, rp: 200, streak: 0 }, ['win', 'win']);
      expect(s.division).toBe(d);
      expect(play(s, ['win']).division).toBe(d + 1);
    }
    expect(play({ division: idx('gold', 1), rp: 190, streak: 0 }, ['win']).division).toBe(idx('platinum', 5));
  });

  it('Chiến Thần I keeps scoring above 200 and becomes Top-eligible', () => {
    const s = play({ division: MAX_DIVISION, rp: 190, streak: 0 }, ['win', 'win']);
    expect(s).toEqual({ division: MAX_DIVISION, rp: 240, streak: 0 });
    expect(topEligible(s)).toBe(true);
    expect(topEligible({ division: MAX_DIVISION, rp: 199 })).toBe(false);
    expect(topEligible({ division: MAX_DIVISION - 1, rp: 500 })).toBe(false);
  });

  it('maps Top positions to exactly one title', () => {
    expect([1, 3, 4, 10, 11, 50, 51, null].map(topTitleFor)).toEqual(['vuong_gia', 'vuong_gia', 'than_tuong', 'than_tuong', 'than_vuong', 'than_vuong', null, null]);
  });

  it('soft-resets by 5 divisions, never below Đồng III', () => {
    expect(softReset(MAX_DIVISION)).toEqual({ division: MAX_DIVISION - 5, rp: 0, streak: 0 });
    expect(softReset(2)).toEqual({ division: 0, rp: 0, streak: 0 });
  });

  it('RP per division constant is 200', () => expect(RP_PER_DIVISION).toBe(200));
});
