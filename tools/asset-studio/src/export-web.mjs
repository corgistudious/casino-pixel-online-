/**
 * Web export (no paid call): turns every approved studio asset into delivery files for the game and
 * writes the typed registry the web app loads them through.
 *
 *  - Source: the asset's current version (manifest `sourceFile`), USER_APPROVED only.
 *  - Output: apps/web/public/assets/keyo/<group>/<id>.<size>.<hash>.webp. Size variants: 128/256/512
 *    for square art, 512/1024 (long side) for wide/tall art. <hash> is the first 10 hex characters of
 *    the source PNG's SHA-256, so a new version gets a new URL (asset versioning; the 1-day cache
 *    Caddy sets on /assets/<folder>/ files can never serve stale art).
 *  - Registry: apps/web/src/assets/keyo/registry.generated.ts (id → pixel size, alpha, variants) and
 *    the `KeyoAssetId` union, so a typo in an asset id is a TypeScript error (broken-import check).
 *
 * Files are rewritten only when missing, so re-running is cheap and the output is deterministic.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PATHS } from './config.mjs';

export const WEB_PUBLIC = path.join(PATHS.repo, 'apps/web/public');
export const WEB_DIR = 'assets/keyo';
export const REGISTRY_FILE = path.join(PATHS.repo, 'apps/web/src/assets/keyo/registry.generated.ts');

const SQUARE_SIZES = [128, 256, 512];
const WIDE_SIZES = [512, 1024];

export const groupOf = (id) => id.split('.')[0];

export async function exportWeb({ log = console.log } = {}) {
  const manifest = JSON.parse(fs.readFileSync(PATHS.manifest, 'utf8'));
  const assets = manifest.assets.filter((a) => a.status === 'USER_APPROVED' || a.status === 'INTEGRATED');
  const entries = [];
  const keep = new Set();
  let written = 0;
  for (const a of assets) {
    const src = path.join(PATHS.repo, a.sourceFile);
    const buf = fs.readFileSync(src);
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 10);
    const meta = await sharp(buf).metadata();
    const square = meta.width === meta.height;
    const sizes = square ? SQUARE_SIZES : WIDE_SIZES;
    const files = {};
    for (const size of sizes) {
      const rel = `${WEB_DIR}/${groupOf(a.id)}/${a.id}.${size}.${hash}.webp`;
      const out = path.join(WEB_PUBLIC, rel);
      keep.add(out);
      files[size] = rel;
      if (fs.existsSync(out)) continue;
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const fit = square ? { width: size, height: size } : meta.width >= meta.height ? { width: size } : { height: size };
      await sharp(buf).resize({ ...fit, kernel: 'lanczos3' }).webp({ quality: 86, alphaQuality: 100, effort: 5 }).toFile(out);
      written++;
    }
    const box = meta.hasAlpha ? await contentBox(buf) : [0, 0, 1000, 1000];
    const hole = a.id.startsWith('frame.') ? await holeRadius(buf) : undefined;
    entries.push({ id: a.id, w: meta.width, h: meta.height, alpha: !!meta.hasAlpha && a.transparency !== false, v: a.version, hash, files, box, hole });
  }
  // Remove stale variants of these assets (older hashes); never touches anything outside assets/keyo.
  const root = path.join(WEB_PUBLIC, WEB_DIR);
  let removed = 0;
  for (const dir of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    for (const f of fs.readdirSync(path.join(root, dir))) {
      const full = path.join(root, dir, f);
      if (!keep.has(full)) {
        fs.unlinkSync(full);
        removed++;
      }
    }
  }
  entries.sort((x, y) => x.id.localeCompare(y.id));
  writeRegistry(entries);
  log(`web export: ${entries.length} assets, ${written} file(s) written, ${removed} stale file(s) removed`);
  return entries;
}

/** Bounding box of the visible (alpha > 24) pixels, in thousandths of the canvas: [x, y, w, h]. */
export async function contentBox(buf) {
  const N = 256;
  const { data, info } = await sharp(buf).resize(N, N, { fit: 'fill' }).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return [0, 0, 1000, 1000];
  const k = 1000 / N;
  return [Math.floor(x0 * k), Math.floor(y0 * k), Math.ceil((x1 - x0 + 1) * k), Math.ceil((y1 - y0 + 1) * k)];
}

/** Avatar frames: median radius of the transparent centre over 16 rays, in thousandths of the canvas. */
export async function holeRadius(buf) {
  const N = 512;
  const { data } = await sharp(buf).resize(N, N, { fit: 'fill' }).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const c = N / 2;
  const rays = [];
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * Math.PI * 2;
    let r = 0;
    for (; r < c; r++) {
      const x = Math.round(c + Math.sin(t) * r);
      const y = Math.round(c - Math.cos(t) * r);
      if (data[y * N + x] > 40) break;
    }
    rays.push(r);
  }
  rays.sort((a, b) => a - b);
  return Math.round(((rays[7] + rays[8]) / 2 / N) * 1000);
}

function writeRegistry(entries) {
  const lines = entries.map((e) => {
    const files = Object.entries(e.files).map(([s, f]) => `${s}: '${f}'`).join(', ');
    const hole = e.hole !== undefined ? ` hole: ${e.hole},` : '';
    return `  '${e.id}': { w: ${e.w}, h: ${e.h}, alpha: ${e.alpha}, v: ${e.v}, box: [${e.box.join(', ')}],${hole} files: { ${files} } },`;
  });
  const body = `/* eslint-disable */
// GENERATED by tools/asset-studio (node src/cli.mjs export-web). Do not edit by hand.
// ${entries.length} approved Keyo Asset Studio assets. Files: apps/web/public/assets/keyo/.

export interface KeyoAssetEntry {
  /** Source pixel size. */
  w: number;
  h: number;
  /** Has a transparent background. */
  alpha: boolean;
  /** Studio version the files were exported from. */
  v: number;
  /** Visible content box in thousandths of the canvas: [x, y, w, h]. */
  box: readonly [number, number, number, number];
  /** Avatar frames: radius of the transparent centre, in thousandths of the canvas width. */
  hole?: number;
  /** Delivery variants by pixel size (long side), relative to the app base. */
  files: Readonly<Partial<Record<128 | 256 | 512 | 1024, string>>>;
}

export const KEYO_ASSETS = {
${lines.join('\n')}
} as const satisfies Record<string, KeyoAssetEntry>;

export type KeyoAssetId = keyof typeof KEYO_ASSETS;
`;
  fs.mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true });
  fs.writeFileSync(REGISTRY_FILE, body);
}
