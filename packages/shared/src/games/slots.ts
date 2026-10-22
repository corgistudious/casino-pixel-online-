import { type Rng, weightedIndex } from './rng';

export const SLOT_SYMBOLS = ['cherry', 'lemon', 'bell', 'clover', 'diamond', 'seven', 'wild'] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];

export const SLOT_REELS = 5;
export const SLOT_ROWS = 3;

/** Relative weight of each symbol appearing in any cell. */
export const SLOT_WEIGHTS: Record<SlotSymbol, number> = {
  cherry: 30,
  lemon: 26,
  bell: 18,
  clover: 13,
  diamond: 8,
  seven: 4,
  wild: 3,
};

/** Multiplier of the line bet for 3, 4 and 5 of a kind. */
export const SLOT_PAYTABLE: Record<SlotSymbol, readonly [number, number, number]> = {
  cherry: [3, 12, 40],
  lemon: [5, 18, 60],
  bell: [10, 40, 150],
  clover: [15, 60, 250],
  diamond: [35, 150, 600],
  seven: [75, 350, 1500],
  wild: [150, 750, 5000],
};

/** Each payline lists the row index used on each reel. */
export const SLOT_PAYLINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
];

export interface SlotLineWin {
  line: number;
  symbol: SlotSymbol;
  count: number;
  multiplier: number;
}

export interface SlotsResult {
  /** grid[reel][row] */
  grid: SlotSymbol[][];
  wins: SlotLineWin[];
  /** Sum of line multipliers (in line-bet units). */
  totalMultiplier: number;
  payout: number;
}

const symbolWeights = SLOT_SYMBOLS.map((s) => SLOT_WEIGHTS[s]);

/** Best paying interpretation of one line (left to right, wild substitutes). */
export function evaluateLine(cells: readonly SlotSymbol[]): { symbol: SlotSymbol; count: number; multiplier: number } | null {
  let wildRun = 0;
  while (wildRun < cells.length && cells[wildRun] === 'wild') wildRun++;

  let best: { symbol: SlotSymbol; count: number; multiplier: number } | null = null;
  if (wildRun >= 3) {
    best = { symbol: 'wild', count: wildRun, multiplier: SLOT_PAYTABLE.wild[wildRun - 3]! };
  }
  if (wildRun < cells.length) {
    const target = cells[wildRun]!;
    let run = wildRun;
    while (run < cells.length && (cells[run] === target || cells[run] === 'wild')) run++;
    if (run >= 3) {
      const multiplier = SLOT_PAYTABLE[target][run - 3]!;
      if (!best || multiplier > best.multiplier) best = { symbol: target, count: run, multiplier };
    }
  }
  return best;
}

export function evaluateGrid(grid: SlotSymbol[][], bet: number): SlotsResult {
  const wins: SlotLineWin[] = [];
  SLOT_PAYLINES.forEach((rows, line) => {
    const cells = rows.map((row, reel) => grid[reel]![row]!);
    const win = evaluateLine(cells);
    if (win) wins.push({ line, ...win });
  });
  const totalMultiplier = wins.reduce((sum, w) => sum + w.multiplier, 0);
  // The total bet is spread evenly over all paylines.
  const payout = Math.floor((bet * totalMultiplier) / SLOT_PAYLINES.length);
  return { grid, wins, totalMultiplier, payout };
}

export function spinSlots(rng: Rng, bet: number): SlotsResult {
  const grid: SlotSymbol[][] = [];
  for (let reel = 0; reel < SLOT_REELS; reel++) {
    const column: SlotSymbol[] = [];
    for (let row = 0; row < SLOT_ROWS; row++) column.push(SLOT_SYMBOLS[weightedIndex(rng, symbolWeights)]!);
    grid.push(column);
  }
  return evaluateGrid(grid, bet);
}

/**
 * Exact theoretical return-to-player. Every payline uses one cell per reel and
 * cells are independent, so RTP equals the expected multiplier of a single line.
 */
export function slotsTheoreticalRtp(): number {
  const total = symbolWeights.reduce((a, b) => a + b, 0);
  const probs = symbolWeights.map((w) => w / total);
  let ev = 0;
  const cells: SlotSymbol[] = new Array(SLOT_REELS);
  const walk = (reel: number, p: number) => {
    if (reel === SLOT_REELS) {
      ev += p * (evaluateLine(cells)?.multiplier ?? 0);
      return;
    }
    for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
      cells[reel] = SLOT_SYMBOLS[i]!;
      walk(reel + 1, p * probs[i]!);
    }
  };
  walk(0, 1);
  return ev;
}
