/**
 * Delivery checks for the game integration (no network, no paid call):
 *  - every approved studio asset is in the web registry, and nothing else is;
 *  - every registry variant exists on disk, is a WebP of the declared size, under the upload limits;
 *  - registry ids are unique and every asset has exactly one integration status;
 *  - the roulette wheel the game shows is the v3 composite (code-drawn 37-pocket ring).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PATHS } from '../src/config.mjs';
import { REGISTRY_FILE, WEB_PUBLIC } from '../src/export-web.mjs';

const manifest = JSON.parse(fs.readFileSync(PATHS.manifest, 'utf8'));
const approved = manifest.assets.filter((a) => a.status === 'USER_APPROVED' || a.status === 'INTEGRATED');
const regSrc = fs.readFileSync(REGISTRY_FILE, 'utf8');
const rows = [...regSrc.matchAll(/^ {2}'([^']+)': \{ w: (\d+), h: (\d+),.*files: \{ ([^}]*) \} \},$/gm)].map((m) => ({
  id: m[1],
  w: Number(m[2]),
  h: Number(m[3]),
  files: Object.fromEntries([...m[4].matchAll(/(\d+): '([^']+)'/g)].map((f) => [Number(f[1]), f[2]])),
}));
const integration = JSON.parse(fs.readFileSync(path.join(PATHS.repo, 'apps/web/src/assets/keyo/integration.json'), 'utf8'));

test('registry = approved studio assets (no missing, no extra, no duplicate ids)', () => {
  const ids = rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate registry id');
  assert.deepEqual([...ids].sort(), approved.map((a) => a.id).sort());
  assert.equal(ids.length, 270);
});

test('every registry file exists, is WebP, has the declared size and fits the upload limits', async () => {
  for (const r of rows) {
    assert.ok(Object.keys(r.files).length >= 2, `${r.id}: variants`);
    for (const [size, rel] of Object.entries(r.files)) {
      const file = path.join(WEB_PUBLIC, rel);
      assert.ok(fs.existsSync(file), `missing ${rel}`);
      const meta = await sharp(file).metadata();
      assert.equal(meta.format, 'webp', rel);
      assert.equal(Math.max(meta.width, meta.height), Number(size), `${rel} long side`);
      // Same aspect ratio as the source (±1 px from rounding).
      assert.ok(Math.abs(meta.width / meta.height - r.w / r.h) < 0.01, `${rel} aspect`);
      assert.ok(fs.statSync(file).size <= 1_048_576, `${rel} over 1 MB`);
    }
  }
});

test('file names carry the source content hash (versioned URLs)', () => {
  for (const r of rows) for (const rel of Object.values(r.files)) assert.match(rel, new RegExp(`^assets/keyo/[a-z]+/${r.id.replace(/\./g, '\\.')}\\.\\d+\\.[0-9a-f]{10}\\.webp$`));
});

test('each asset has exactly one integration status with a location or a reason', () => {
  assert.deepEqual(Object.keys(integration).sort(), rows.map((r) => r.id).sort());
  for (const [id, e] of Object.entries(integration)) {
    assert.ok(['INTEGRATED', 'VERIFIED', 'READY_FOR_FUTURE_USE', 'MISSING', 'FAILED'].includes(e.status), id);
    if (e.status === 'READY_FOR_FUTURE_USE') assert.ok(e.why, `${id}: reason`);
    else assert.ok(e.where, `${id}: location`);
    assert.ok(['library', 'sample'].includes(e.wave), id);
  }
  assert.equal(Object.values(integration).filter((e) => e.wave === 'library').length, 252);
});

test('the game shows roulette wheel v3 (composite with the code-drawn pocket ring)', () => {
  const wheel = manifest.assets.find((a) => a.id === 'game.roulette.wheel-head');
  assert.equal(wheel.version, 3);
  assert.equal(wheel.method, 'composite');
  assert.ok(rows.find((r) => r.id === 'game.roulette.wheel-head').files[512]);
});
