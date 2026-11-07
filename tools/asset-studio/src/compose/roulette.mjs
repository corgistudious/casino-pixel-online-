/**
 * Roulette wheel head, composite method (no paid call):
 *  - the centre (mahogany cone + four-arm gold turret) comes from the AI image (v2) as generated;
 *  - the pocket ring is DRAWN BY CODE: exactly 37 pockets in the European order the game uses
 *    (packages/shared/src/games/roulette.ts ROULETTE_WHEEL), with correct colours and numbers.
 * Image models cannot count 37 pockets or render numerals reliably, so they never draw this part.
 *
 * Geometry matches the game's convention (apps/web/src/game/art.ts): pocket i is centred at angle
 * i·(360/37)° clockwise from the top, so the existing ball/rotation maths applies unchanged.
 */
import sharp from 'sharp';

/** European wheel order (must equal ROULETTE_WHEEL in packages/shared; checked by a test). */
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');

/** Ring radii in px for a 1024 canvas (measured on the AI wheel so the centre fits exactly). */
export const GEO = { size: 1024, rOuter: 470, rLipIn: 440, rPocketOut: 436, rPocketIn: 318, rCone: 302 };

const polar = (c, r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [c + Math.cos(a) * r, c + Math.sin(a) * r];
};

export function ringSvg(g = GEO) {
  const c = g.size / 2;
  const step = 360 / WHEEL_ORDER.length;
  const fills = { red: 'url(#pRed)', black: 'url(#pBlack)', green: 'url(#pGreen)' };
  let pockets = '';
  let frets = '';
  let numbers = '';
  WHEEL_ORDER.forEach((num, i) => {
    const a0 = i * step - step / 2;
    const a1 = a0 + step;
    const [x0, y0] = polar(c, g.rPocketOut, a0);
    const [x1, y1] = polar(c, g.rPocketOut, a1);
    const [x2, y2] = polar(c, g.rPocketIn, a1);
    const [x3, y3] = polar(c, g.rPocketIn, a0);
    pockets += `<path d="M${x0} ${y0} A${g.rPocketOut} ${g.rPocketOut} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${g.rPocketIn} ${g.rPocketIn} 0 0 0 ${x3} ${y3}Z" fill="${fills[colorOf(num)]}"/>`;
    const [fx0, fy0] = polar(c, g.rPocketIn, a0);
    const [fx1, fy1] = polar(c, g.rPocketOut, a0);
    frets += `<line x1="${fx0}" y1="${fy0}" x2="${fx1}" y2="${fy1}"/>`;
    // Number in the outer part of the pocket, reading outward like a real wheel.
    const [nx, ny] = polar(c, (g.rPocketOut + g.rPocketIn) / 2 + 26, i * step);
    numbers += `<text x="${nx}" y="${ny}" transform="rotate(${i * step} ${nx} ${ny})">${num}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${g.size}" height="${g.size}">
  <defs>
    <radialGradient id="pRed" cx="${c}" cy="${c}" r="${g.rPocketOut}" gradientUnits="userSpaceOnUse"><stop offset="${g.rPocketIn / g.rPocketOut}" stop-color="#7a0c1c"/><stop offset=".86" stop-color="#c8182f"/><stop offset="1" stop-color="#e8354b"/></radialGradient>
    <radialGradient id="pBlack" cx="${c}" cy="${c}" r="${g.rPocketOut}" gradientUnits="userSpaceOnUse"><stop offset="${g.rPocketIn / g.rPocketOut}" stop-color="#050408"/><stop offset=".86" stop-color="#1c1a26"/><stop offset="1" stop-color="#34303f"/></radialGradient>
    <radialGradient id="pGreen" cx="${c}" cy="${c}" r="${g.rPocketOut}" gradientUnits="userSpaceOnUse"><stop offset="${g.rPocketIn / g.rPocketOut}" stop-color="#05462a"/><stop offset=".86" stop-color="#119a5a"/><stop offset="1" stop-color="#2cc47a"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".35" stop-color="#f2c14e"/><stop offset=".6" stop-color="#a86d12"/><stop offset="1" stop-color="#f7d77a"/></linearGradient>
    <radialGradient id="depth" cx="${c}" cy="${c}" r="${g.rPocketOut}" gradientUnits="userSpaceOnUse"><stop offset="${g.rPocketIn / g.rPocketOut}" stop-color="#000" stop-opacity=".55"/><stop offset="${(g.rPocketIn + 40) / g.rPocketOut}" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
  </defs>
  <circle cx="${c}" cy="${c}" r="${g.rOuter}" fill="url(#gold)"/>
  <circle cx="${c}" cy="${c}" r="${g.rOuter - 3}" fill="none" stroke="#fff6d6" stroke-opacity=".55" stroke-width="2"/>
  <circle cx="${c}" cy="${c}" r="${g.rLipIn}" fill="#2a1306"/>
  ${pockets}
  <circle cx="${c}" cy="${c}" r="${g.rPocketOut}" fill="url(#depth)"/>
  <g stroke="url(#gold)" stroke-width="5" stroke-linecap="round">${frets}</g>
  <circle cx="${c}" cy="${c}" r="${g.rPocketOut}" fill="none" stroke="url(#gold)" stroke-width="6"/>
  <circle cx="${c}" cy="${c}" r="${g.rPocketIn}" fill="none" stroke="url(#gold)" stroke-width="7"/>
  <circle cx="${c}" cy="${c}" r="${g.rCone + 9}" fill="url(#gold)"/>
  <g font-family="Be Vietnam Pro, DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="30" fill="#ffffff" text-anchor="middle" dominant-baseline="central" stroke="#000" stroke-opacity=".35" stroke-width="1.2" paint-order="stroke">${numbers}</g>
  <circle cx="${c}" cy="${c}" r="${g.rOuter}" fill="url(#sheen)"/>
</svg>`;
}

/** Builds the composite PNG: code-drawn ring + the AI centre (cone + turret) inside rCone. */
export async function composeRoulette(aiSource, outFile, g = GEO) {
  const c = g.size / 2;
  const ring = await sharp(Buffer.from(ringSvg(g))).png().toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${g.size}" height="${g.size}"><defs><radialGradient id="m" cx="${c}" cy="${c}" r="${g.rCone}" gradientUnits="userSpaceOnUse"><stop offset=".97" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><circle cx="${c}" cy="${c}" r="${g.rCone}" fill="url(#m)"/></svg>`);
  const centre = await sharp(aiSource).resize(g.size, g.size).composite([{ input: await sharp(mask).png().toBuffer(), blend: 'dest-in' }]).png().toBuffer();
  await sharp(ring).composite([{ input: centre }]).png().toFile(outFile);
  return outFile;
}
