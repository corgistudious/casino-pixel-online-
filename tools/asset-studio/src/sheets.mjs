import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { PATHS, REPO } from './config.mjs';

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
const label = (w, h, lines, size = 13) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${lines.map((t, i) => `<text x="8" y="${18 + i * (size + 5)}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${i ? size - 2 : size}" fill="${i ? '#d8cfe6' : '#ffe08a'}">${esc(t)}</text>`).join('')}</svg>`);

/** Placeholder profile photo (drawn, not a real person) to test avatar frames in context. */
const avatarPhoto = (d) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><defs><radialGradient id="g" cx="40%" cy="35%"><stop offset="0" stop-color="#8ec5ff"/><stop offset="1" stop-color="#2b3f8f"/></radialGradient></defs><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="url(#g)"/><circle cx="${d / 2}" cy="${d * 0.42}" r="${d * 0.17}" fill="#f1d7c2"/><ellipse cx="${d / 2}" cy="${d * 0.86}" rx="${d * 0.3}" ry="${d * 0.22}" fill="#f1d7c2"/></svg>`);

async function tile(asset) {
  const W = 420, H = 330;
  const file = asset.sourceFile && fs.existsSync(path.join(REPO, asset.sourceFile)) ? path.join(REPO, asset.sourceFile) : null;
  const comps = [];
  // Split background: left dark plum, right light grey — shows real transparency on both.
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#120b26"/><rect x="0" y="0" width="${W / 2}" height="250" fill="#1b1036"/><rect x="${W / 2}" y="0" width="${W / 2}" height="250" fill="#d9d4e4"/></svg>`);
  if (file) {
    const big = await sharp(file).resize(240, 240, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    if (asset.category === 'frame') {
      const photo = await sharp(avatarPhoto(170)).png().toBuffer();
      comps.push({ input: photo, left: 35, top: 40 });
    }
    comps.push({ input: big, left: 0, top: 5 });
    // Real-size checks (in-game sizes) on dark.
    for (const [s, x, y] of [[128, 252, 18], [64, 256, 166], [44, 344, 176]]) {
      const small = await sharp(file).resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      comps.push({ input: small, left: x, top: y });
    }
  }
  const v = asset.validation;
  comps.push({ input: label(W, 80, [asset.id, `${asset.status}  v${asset.version}  ${asset.model ?? ''} ${asset.quality ?? ''}`, v ? (v.ok ? `checks OK${v.warnings?.length ? ` · ${v.warnings.length} warning` : ''}` : `FAIL: ${v.errors[0]}`) : file ? 'not validated' : 'no image yet']), left: 0, top: 252 });
  return sharp(bg).composite(comps).png().toBuffer();
}

/** One contact sheet per category (plus one for the sample batch). */
export async function buildSheets(manifest, { only } = {}) {
  fs.mkdirSync(PATHS.previews, { recursive: true });
  const withImages = manifest.assets.filter((a) => a.sourceFile && !a.sourceFile.startsWith('apps/') && a.status !== 'PLANNED');
  const groups = new Map();
  for (const a of withImages) {
    for (const g of [a.category, a.batch ? `batch-${a.batch}` : null].filter(Boolean)) {
      if (only && !only.includes(g)) continue;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(a);
    }
  }
  const out = [];
  for (const [g, list] of groups) {
    const cols = Math.max(2, Math.min(4, list.length));
    const rows = Math.ceil(list.length / cols);
    const tiles = await Promise.all(list.map(tile));
    const sheet = sharp({ create: { width: cols * 430 + 10, height: rows * 340 + 60, channels: 4, background: '#0b0620' } }).composite([
      { input: label(cols * 430 + 10, 50, [`KEYO Asset Studio — ${g} (${list.length})`, 'left: on plum · right: on light · small: 128/64/44 px real size'], 18), left: 0, top: 0 },
      ...tiles.map((t, i) => ({ input: t, left: 10 + (i % cols) * 430, top: 50 + Math.floor(i / cols) * 340 })),
    ]);
    const file = path.join(PATHS.previews, `${g}.png`);
    await sheet.png().toFile(file);
    out.push(path.relative(REPO, file));
  }
  return out;
}
