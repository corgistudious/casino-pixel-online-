/**
 * KEYO PREMIUM STYLIZED 2.5D HD — shared art direction fragments used by every prompt.
 * See docs/asset-studio/ART_DIRECTION.md for the human-readable guide.
 */
export const PALETTE = {
  royalPurple: '#3a2468', deepPlum: '#1b1036', night: '#0b0620',
  gold: '#f2c14e', goldLight: '#fff1b8', goldDark: '#8a5a12',
  emerald: '#1f8a5a', ruby: '#d42a44', sapphire: '#2f5ee8', ice: '#9fd8ff', rose: '#ff4fd8',
};

export const STYLE = [
  'Art style: KEYO premium stylized 2.5D HD game art for a social casino game center — polished, commercial mobile-game quality, crisp vector-like shapes with soft painterly shading.',
  'Stylized, NOT photorealistic: clean readable silhouettes, slightly chunky proportions, bevelled edges and gentle depth, like a high-end casual game asset.',
  'Lighting: soft key light from the upper left, gentle rim light, subtle ambient occlusion, controlled specular highlights; no harsh neon, no lens flare, no bloom haze.',
  'Materials rendered with restraint: polished gold, brushed silver, cut crystal, lacquer, velvet, leather or wood as specified — tasteful, not noisy.',
  'Colour: harmonious, high contrast against both dark plum and light backgrounds; gold and royal purple are accents, not mandatory everywhere.',
].join(' ');

export const NEGATIVE = [
  'Avoid: photorealism, photographs, real-world brand logos or trademarks, existing game characters or copyrighted designs,',
  'any text, letters, numbers or watermarks unless explicitly requested, garbled glyphs, signatures,',
  'fake checkerboard transparency pattern, drop-shadow plates or coloured backgrounds behind a transparent asset,',
  'cropped or cut-off parts, distorted or asymmetric geometry when symmetry is required, blur, noise, JPEG artifacts,',
  'excessive tiny details, clutter, neon overload, multiple copies of the object, frames or borders around the image.',
].join(' ');

export const LIGHTING_DEFAULT = 'Soft studio key light from upper left, warm rim light, gentle contact shadow only where the object rests (inside the object silhouette, never a separate plate).';
