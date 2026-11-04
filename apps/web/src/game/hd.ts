/**
 * Scenes are laid out in a 640×360 world and rendered through a zoomed camera,
 * so the canvas itself is RES× larger (up to 1920×1080). Every texture is drawn
 * at RES× its world size, which keeps cards, chips and text razor sharp.
 */
export const WORLD_W = 640;
export const WORLD_H = 360;
/** Portrait (phones, V7.1): native portrait scenes use a 360×640 world; region scenes stack slices of
 *  the landscape world into a column this wide. */
export const PORTRAIT_W = 360;
export const PORTRAIT_H = 640;

function pickResolution(): number {
  if (typeof window === 'undefined') return 3;
  const dpr = window.devicePixelRatio || 1;
  const longest = Math.max(window.screen?.width ?? 1280, window.screen?.height ?? 720) * dpr;
  return Math.min(3, Math.max(2, Math.ceil(longest / WORLD_W)));
}

export const RES = pickResolution();

export const FONT_UI = '"Be Vietnam Pro", system-ui, sans-serif';
export const FONT_DISPLAY = '"Playfair Display", Georgia, serif';
