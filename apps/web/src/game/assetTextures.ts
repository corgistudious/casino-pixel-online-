import { KEYO_ASSETS, type KeyoAssetId } from '../assets/keyo/registry.generated';

/**
 * Asset Studio art used by the Phaser table scenes.
 *
 * Each entry gives a texture key, the studio asset that provides it, the scenes that need it (so a
 * scene only downloads its own art — nothing is loaded globally) and its size in world units:
 *  - `contentW`: width the visible artwork (the asset's alpha box) should span, i.e. the same size as
 *    the procedural texture it replaces, so positions, hit areas and layouts do not change;
 *  - or `canvasW`: width of the whole canvas, when the geometry was measured on the file itself.
 *
 * Keys that exist in game/art.ts are drawn by code when the file is missing or fails ("fallback");
 * extra keys (no drawn version) are only shown when they loaded (`hasStudioTexture`).
 * Gameplay never depends on these: results, odds, balances and hit areas come from the server/code.
 */
export interface StudioTexture {
  key: string;
  id: KeyoAssetId;
  scenes: readonly string[];
  contentW?: number;
  canvasW?: number;
}

const SICBO = ['sicbo'];
const ROULETTE = ['roulette'];
const CARDS = ['card-table'];

/**
 * Roulette wheel head (v3 composite): its 37 pockets are drawn by code in the game's European order
 * (tools/asset-studio/src/compose/roulette.mjs, pocket i centred at i·360/37° clockwise from the top
 * — the convention RouletteScene's ball maths uses). Scaled so its pocket ring (r 318–436 px of 1024)
 * lands on the procedural one (r 45–62 world units), keeping the ball's resting radius in the pockets.
 */
export const ROULETTE_WHEEL_CANVAS_W = (1024 * 62) / 436;

export const STUDIO_TEXTURES: readonly StudioTexture[] = [
  // Sic Bo / Tài Xỉu (both scenes use the 'sicbo' key family).
  { key: 'sicbo-plate', id: 'game.sicbo.dice-plate', scenes: SICBO, contentW: 150 },
  { key: 'sicbo-dome', id: 'game.sicbo.crystal-dome', scenes: SICBO, contentW: 142 },
  { key: 'taixiu-bowl', id: 'game.taixiu.bowl-cover', scenes: SICBO, contentW: 150 },
  { key: 'sicbo-icon-big', id: 'game.sicbo.icon-big', scenes: SICBO, contentW: 22 },
  { key: 'sicbo-icon-small', id: 'game.sicbo.icon-small', scenes: SICBO, contentW: 22 },
  { key: 'sicbo-icon-triple', id: 'game.sicbo.icon-triple', scenes: SICBO, contentW: 20 },
  // Roulette.
  { key: 'roulette-wheel', id: 'game.roulette.wheel-head', scenes: ROULETTE, canvasW: ROULETTE_WHEEL_CANVAS_W },
  { key: 'roulette-rim', id: 'game.roulette.wheel-rim', scenes: ROULETTE, contentW: 172 },
  { key: 'roulette-ball', id: 'game.roulette.ball', scenes: ROULETTE, contentW: 6.6 },
  { key: 'roulette-pointer', id: 'game.roulette.pointer', scenes: ROULETTE, contentW: 9 },
  { key: 'roulette-marker', id: 'game.roulette.marker', scenes: ROULETTE, contentW: 11 },
  { key: 'roulette-emblem', id: 'game.roulette.result-emblem', scenes: ROULETTE, contentW: 34 },
  // Poker / Liêng / Xì Tố (one card-table scene).
  { key: 'dealer-btn', id: 'game.poker.dealer-button', scenes: CARDS, contentW: 17 },
  { key: 'xito-dealer', id: 'game.xito.dealer-marker', scenes: CARDS, contentW: 15 },
  { key: 'poker-sb', id: 'game.poker.blind-small', scenes: CARDS, contentW: 13 },
  { key: 'poker-bb', id: 'game.poker.blind-big', scenes: CARDS, contentW: 13 },
  { key: 'poker-pot', id: 'game.poker.pot-pile', scenes: CARDS, contentW: 30 },
  { key: 'chip-stack', id: 'game.cards.chip-stack', scenes: CARDS, contentW: 14 },
  { key: 'lieng-fan', id: 'game.lieng.reveal-fan', scenes: CARDS, contentW: 18 },
  // Blackjack.
  { key: 'card-shoe', id: 'game.blackjack.card-shoe', scenes: ['blackjack'], contentW: 66 },
  { key: 'bj-emblem', id: 'game.blackjack.result-emblem', scenes: ['blackjack'], contentW: 30 },
  // Slots: the reel symbols the game has (SLOT_SYMBOLS); the same cell size as the drawn ones.
  { key: 'slot-cherry', id: 'game.slots.symbol-cherry', scenes: ['slots'], contentW: 40 },
  { key: 'slot-lemon', id: 'game.slots.symbol-lemon', scenes: ['slots'], contentW: 38 },
  { key: 'slot-bell', id: 'game.slots.symbol-bell', scenes: ['slots'], contentW: 40 },
  { key: 'slot-clover', id: 'game.slots.symbol-clover', scenes: ['slots'], contentW: 40 },
  { key: 'slot-diamond', id: 'game.slots.symbol-diamond', scenes: ['slots'], contentW: 42 },
  { key: 'slot-seven', id: 'game.slots.symbol-seven', scenes: ['slots'], contentW: 38 },
  { key: 'slot-wild', id: 'game.slots.symbol-wild', scenes: ['slots'], contentW: 42 },
];

/**
 * Result effects (fx.*): win / lose are preloaded by every table scene (they are needed on the first
 * round); the rarer ones load the first time they are needed (game/scenes/BaseScene.resultFx).
 */
const ALL_TABLES = ['sicbo', 'roulette', 'card-table', 'blackjack', 'slots'];
export const RESULT_FX = {
  'normal-win': 'fx.normal-win',
  'big-win': 'fx.big-win',
  'mega-win': 'fx.mega-win',
  jackpot: 'fx.jackpot',
  'perfect-win': 'fx.perfect-win',
  'normal-lose': 'fx.normal-lose',
  bust: 'fx.bust',
  push: 'fx.push',
  fold: 'fx.fold',
  'all-in': 'fx.all-in',
} as const satisfies Record<string, KeyoAssetId>;
export type ResultFx = keyof typeof RESULT_FX;
export const RESULT_FX_WIDTH = 96;
export const PRELOADED_FX: readonly ResultFx[] = ['normal-win', 'big-win', 'normal-lose'];
(STUDIO_TEXTURES as StudioTexture[]).push(...PRELOADED_FX.map((k) => ({ key: `fx-${k}`, id: RESULT_FX[k], scenes: ALL_TABLES, contentW: RESULT_FX_WIDTH })));

export interface ResolvedTexture extends StudioTexture {
  canvasW: number;
}

/** Canvas width in world units for a texture spec (from `contentW` and the asset's alpha box). */
export function resolveCanvasW(t: StudioTexture): number {
  if (t.canvasW) return t.canvasW;
  const a = KEYO_ASSETS[t.id];
  const longPx = Math.max(a.w, a.h);
  const boxW = (a.box[2] / 1000) * a.w;
  return (t.contentW! * longPx) / boxW;
}

export function texturesForScene(sceneKey: string): ResolvedTexture[] {
  return STUDIO_TEXTURES.filter((t) => t.scenes.includes(sceneKey)).map((t) => ({ ...t, canvasW: resolveCanvasW(t) }));
}
