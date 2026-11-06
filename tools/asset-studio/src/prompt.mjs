import { LIGHTING_DEFAULT, NEGATIVE, STYLE } from './style.mjs';

/** Builds the full prompt for one catalog asset from its structured fields. */
export function buildPrompt(a) {
  if (a.existing) return null;
  const bg = a.transparent
    ? 'Background: fully transparent (real alpha channel). Only the object is painted; no floor, no backdrop, no shadow plate, no checkerboard.'
    : 'Background: as described in the composition (opaque image).';
  return [
    `Asset: ${a.name} for KEYO GAME (${a.system}). Purpose: ${a.description}`,
    `Object: ${a.object}`,
    a.materials ? `Materials: ${a.materials}.` : '',
    `Camera: ${a.camera}`,
    `Composition: ${a.composition}`,
    `Lighting: ${a.lighting ?? LIGHTING_DEFAULT}`,
    bg,
    `Resolution target: ${a.size}; must stay crisp and recognisable when shown at 64–128 px on a phone in landscape.`,
    STYLE,
    NEGATIVE,
  ]
    .filter(Boolean)
    .join('\n');
}
