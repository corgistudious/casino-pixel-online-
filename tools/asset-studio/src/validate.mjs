import sharp from 'sharp';
import fs from 'node:fs';
import { DELIVERY } from './config.mjs';

/** 64-bit difference hash (hex) of the visible image composited on mid grey. */
export async function dHash(file) {
  const { data } = await sharp(file).flatten({ background: '#808080' }).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += data[y * 9 + x] > data[y * 9 + x + 1] ? '1' : '0';
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}
export const hamming = (a, b) => [...(BigInt(`0x${a}`) ^ BigInt(`0x${b}`)).toString(2)].filter((c) => c === '1').length;

async function laplacianVariance(file) {
  const g = sharp(file).flatten({ background: '#808080' }).greyscale().resize(512, 512, { fit: 'inside' });
  const { data } = await g.clone().convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 }).raw().toBuffer({ resolveWithObject: true });
  let s = 0, s2 = 0;
  for (const v of data) { s += v; s2 += v * v; }
  const n = data.length;
  return s2 / n - (s / n) ** 2;
}

/**
 * Technical validation of a generated image. Errors block review (→ NEEDS_REVISION); warnings are
 * shown to the reviewer. Visual judgement (style, wrong text, anatomy) stays with the human review.
 */
export async function validateImage(file, asset, otherHashes = []) {
  const errors = [];
  const warnings = [];
  const meta = await sharp(file).metadata();
  const [w, h] = (asset.resolution ?? '').split('x').map(Number);
  if (w && h && (meta.width !== w || meta.height !== h)) warnings.push(`size ${meta.width}x${meta.height}, requested ${asset.resolution}`);
  const N = 256;
  const { data } = await sharp(file).ensureAlpha().resize(N, N, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const A = (x, y) => data[(y * N + x) * 4 + 3];
  const L = (x, y) => { const i = (y * N + x) * 4; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; };
  let border = 0, borderN = 0, covered = 0, minX = N, minY = N, maxX = -1, maxY = -1, ls = 0, ls2 = 0, ln = 0;
  const ring = Math.round(N * 0.03);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = A(x, y);
    if (x < ring || y < ring || x >= N - ring || y >= N - ring) { border += a; borderN++; }
    if (a > 32) { covered++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); const l = L(x, y); ls += l; ls2 += l * l; ln++; }
  }
  const coverage = covered / (N * N);
  const borderAlpha = border / borderN / 255;
  const lumStd = ln ? Math.sqrt(Math.max(0, ls2 / ln - (ls / ln) ** 2)) : 0;
  const metrics = { width: meta.width, height: meta.height, hasAlpha: !!meta.hasAlpha, coverage: +coverage.toFixed(3), borderAlpha: +borderAlpha.toFixed(3), lumStd: +lumStd.toFixed(1) };
  if (asset.transparency) {
    if (!meta.hasAlpha) errors.push('no alpha channel (transparent asset)');
    if (borderAlpha > 0.06) errors.push(`background not transparent at the edges (edge alpha ${(borderAlpha * 100).toFixed(0)}%) — opaque backdrop or fake checkerboard`);
    if (maxX >= 0 && (minX <= 0 || minY <= 0 || maxX >= N - 1 || maxY >= N - 1)) errors.push('object touches the canvas edge (possibly cut off)');
    if (coverage < 0.04) errors.push(`object too small / nearly empty (${(coverage * 100).toFixed(1)}% of canvas)`);
    if (coverage > 0.97) errors.push('almost no transparent area');
    metrics.bbox = { x: minX / N, y: minY / N, w: (maxX - minX + 1) / N, h: (maxY - minY + 1) / N };
  }
  if (asset.category === 'frame') {
    let c = 0, cn = 0;
    const r = N * 0.28;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x - N / 2) ** 2 + (y - N / 2) ** 2 < r * r) { c += A(x, y); cn++; }
    metrics.centerAlpha = +(c / cn / 255).toFixed(3);
    if (metrics.centerAlpha > 0.08) errors.push(`frame centre not transparent (${(metrics.centerAlpha * 100).toFixed(0)}% opaque)`);
  }
  if (!asset.transparency) {
    // Opaque art must be painted edge to edge: a light grey/white low-saturation border means the
    // model drew a fake checkerboard or an empty studio backdrop around the subject.
    let greyEdge = 0, edgeN = 0;
    const e = Math.round(N * 0.035);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (x >= e && y >= e && x < N - e && y < N - e) continue;
      const i = (y * N + x) * 4;
      const mx = Math.max(data[i], data[i + 1], data[i + 2]);
      const mn = Math.min(data[i], data[i + 1], data[i + 2]);
      edgeN++;
      if (mx - mn < 14 && mn > 150) greyEdge++;
    }
    metrics.greyEdge = +(greyEdge / edgeN).toFixed(3);
    if (metrics.greyEdge > 0.5) errors.push(`opaque image has a light grey/white border (${Math.round(metrics.greyEdge * 100)}%) — fake checkerboard or blank backdrop`);
  }
  if (lumStd < 10) errors.push('image is flat / nearly blank');
  metrics.sharpness = +(await laplacianVariance(file)).toFixed(1);
  if (metrics.sharpness < 15) warnings.push(`low edge detail (sharpness ${metrics.sharpness}) — check for blur`);
  metrics.dhash = await dHash(file);
  // Average visible colour: two assets are near-duplicates only when the shape hash AND the colours
  // match (avatar frames all share a ring silhouette but differ in palette and motifs).
  let cr = 0, cg = 0, cb = 0, cn = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 32) { cr += data[i]; cg += data[i + 1]; cb += data[i + 2]; cn++; }
  metrics.avgColor = cn ? [Math.round(cr / cn), Math.round(cg / cn), Math.round(cb / cn)] : [0, 0, 0];
  const colourClose = (o) => !o.color || Math.hypot(o.color[0] - metrics.avgColor[0], o.color[1] - metrics.avgColor[1], o.color[2] - metrics.avgColor[2]) < 18;
  const dup = otherHashes.find((o) => hamming(o.hash, metrics.dhash) <= 5 && colourClose(o));
  if (dup) errors.push(`near-duplicate of ${dup.id}`);
  return { ok: errors.length === 0, errors, warnings, metrics, checkedAt: new Date().toISOString() };
}

/** Delivery WebP: ≤1024 px, alpha kept, ≤1 MB (quality lowered step by step if needed). */
export async function optimize(src, out) {
  for (const q of [90, 84, 78, 70]) {
    await sharp(src).resize(DELIVERY.maxSide, DELIVERY.maxSide, { fit: 'inside', withoutEnlargement: true }).webp({ quality: q, alphaQuality: 95, effort: 5 }).toFile(out);
    if (fs.statSync(out).size <= DELIVERY.maxBytes) return { quality: q, bytes: fs.statSync(out).size };
  }
  return { quality: 70, bytes: fs.statSync(out).size, overLimit: true };
}
