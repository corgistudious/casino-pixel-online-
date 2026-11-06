/**
 * Adaptive layout of the Sic Bo / Tài Xỉu table (shared by both scenes).
 *
 * Why this exists: the board used to be placed with fixed world coordinates (x 226…630 in the
 * 640-wide world). The 'board' table artwork (cosmetics/tableArt.ts) draws a 10-unit rail around
 * the felt, so the felt ends at x = 630: the board's right edge sat exactly on the gold rail line
 * (its stroke and the right column's labels spilled onto the rail), while 40+ units of felt were
 * left unused on the left and ~70 at the bottom.
 *
 * Now every position is derived from the world size and a content box inset from the rail:
 *  - dice plate on the left, betting board on the right, both inside the felt with equal margins;
 *  - the world WIDTH follows the stage's aspect ratio (adaptiveWorldWidth), so wide landscape phones
 *    and desktops get wider betting spots instead of empty side bands; the height stays 360;
 *  - pure functions, unit-tested for every width in range (inside the felt, no overlap with the dice
 *    plate, minimum spot sizes). Phaser's FIT scale then maps the world to the screen uniformly
 *    (no stretch) and input goes through the same transform, so taps land where spots are drawn.
 */
import { WORLD_H, WORLD_W } from '../hd';

/** Width of the rail drawn by paintTable('board') around the felt (world units). */
export const BOARD_RAIL = 10;
/** Breathing room between the rail and anything printed on the felt. */
export const FELT_PAD = 14;
/** Narrowest / widest world for the dice table (16:9 → ~2.28:1). */
export const DICE_WORLD_MIN = WORLD_W;
export const DICE_WORLD_MAX = 820;
/** Dice plate radius at scale 1 (art.ts PLATE: r 72 + shadow). */
const PLATE_R = 72;
const PLATE_SHADOW = 9;

/** Pure: world width for a stage of the given aspect ratio (width / height). */
export function adaptiveWorldWidth(aspect: number | null | undefined, min = DICE_WORLD_MIN, max = DICE_WORLD_MAX, h = WORLD_H): number {
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) return min;
  return Math.max(min, Math.min(max, Math.round(h * aspect)));
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface DiceBoardLayout {
  w: number;
  h: number;
  /** Small screens: smaller dice plate, wider and taller betting spots. */
  compact: boolean;
  /** Scale of the plate / dice / cover artwork (1 = 72-unit plate radius). */
  plateScale: number;
  /** Printable felt inside the rail and padding. */
  content: Rect;
  bowl: { x: number; y: number; r: number };
  /** Betting board (rows below), x/w shared by all rows. */
  board: { x: number; w: number };
  title: { x: number; y: number };
  row1: Rect;
  row2: Rect;
  row3: Rect;
  totalLabelY: number;
  singleLabelY: number;
  result: { x: number; y: number };
  /** Centre of the board (celebrations). */
  centre: { x: number; y: number };
}

/**
 * Pure: compact mode when the world would be shown at less than 0.85 CSS px per unit (e.g. a
 * 568×320 landscape phone): the board then needs the room more than the plate does.
 */
export function isCompactStage(stage: { w: number; h: number } | null | undefined, worldW: number, worldH = WORLD_H): boolean {
  if (!stage || stage.w <= 0 || stage.h <= 0) return false;
  return Math.min(stage.w / worldW, stage.h / worldH) < 0.85;
}

/** Pure: the whole table for a world of w × h (compact: small screens, see isCompactStage). */
export function diceBoardLayout(w = WORLD_W, h = WORLD_H, compact = false): DiceBoardLayout {
  const plateScale = compact ? 0.66 : 1;
  const plateR = Math.round(PLATE_R * plateScale);
  const inset = BOARD_RAIL + FELT_PAD;
  const content = { x: inset, y: inset, w: w - inset * 2, h: h - inset * 2 };
  // Vertical rhythm of the board (title, three rows, two captions) inside the content box.
  const titleY = content.y + 16;
  const r1h = compact ? 70 : 64;
  const r2h = compact ? 66 : 58;
  const r3h = compact ? 70 : 64;
  const gap = 8;
  const captionH = 14;
  const y1 = content.y + 34;
  const y2 = y1 + r1h + gap;
  const y3 = y2 + r2h + captionH + gap;
  const boardBottom = y3 + r3h + captionH;
  // Dice plate: left column, vertically centred on the board, never past the felt.
  const bowlX = content.x + plateR + 4;
  const bowlY = Math.round((y1 + y3 + r3h) / 2);
  const plateRight = bowlX + plateR + Math.round(PLATE_SHADOW * plateScale);
  const boardX = Math.round(plateRight + (compact ? 10 : 16));
  const boardW = Math.floor(content.x + content.w - boardX);
  return {
    w,
    h,
    compact,
    plateScale,
    content,
    bowl: { x: bowlX, y: bowlY, r: plateR },
    board: { x: boardX, w: boardW },
    title: { x: boardX, y: titleY },
    row1: { x: boardX, y: y1, w: boardW, h: r1h },
    row2: { x: boardX, y: y2, w: boardW, h: r2h },
    row3: { x: boardX, y: y3, w: boardW, h: r3h },
    totalLabelY: y2 + r2h + captionH / 2 + 1,
    singleLabelY: Math.min(boardBottom - captionH / 2 + 1, content.y + content.h - 4),
    result: { x: bowlX, y: Math.min(bowlY + plateR + 22, content.y + content.h - 8) },
    centre: { x: boardX + boardW / 2, y: (y1 + y3 + r3h) / 2 },
  };
}

/** Pure: the five top-row spots (small · odd · any triple · even · big), proportional widths. */
export function topRowSpots(l: DiceBoardLayout): { key: string; x: number; w: number }[] {
  const parts: [string, number][] = [['small', 84], ['odd', 72], ['anyTriple', 92], ['even', 72], ['big', 84]];
  const total = parts.reduce((s, [, p]) => s + p, 0);
  let x = l.board.x;
  return parts.map(([key, p], i) => {
    const w = i === parts.length - 1 ? l.board.x + l.board.w - x : Math.round((p / total) * l.board.w);
    const spot = { key, x, w };
    x += w;
    return spot;
  });
}
