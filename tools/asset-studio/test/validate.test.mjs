import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { validateImage, optimize } from '../src/validate.mjs';
import { selectAssets } from '../src/generate.mjs';
import { estimateUsd, DEFAULT_PRICING } from '../src/budget.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kas-'));
const svg = (body, bg = 'none') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${bg}"/>${body}</svg>`);
const write = async (name, buf) => { const f = path.join(dir, name); await sharp(buf).png().toFile(f); return f; };
const gem = '<defs><radialGradient id="g"><stop offset="0" stop-color="#fff1b8"/><stop offset=".6" stop-color="#f2c14e"/><stop offset="1" stop-color="#6b3b08"/></radialGradient></defs><circle cx="512" cy="512" r="330" fill="url(#g)"/><path d="M300 520 L512 250 L724 520 L512 780Z" fill="#3a2468" stroke="#fff" stroke-width="10"/>';
const asset = (over = {}) => ({ id: 'test.asset', category: 'game', resolution: '1024x1024', transparency: true, ...over });

test('a clean transparent object passes', async () => {
  const r = await validateImage(await write('ok.png', svg(gem)), asset());
  assert.equal(r.ok, true, r.errors.join(';'));
  assert.ok(r.metrics.borderAlpha < 0.01);
});
test('an opaque backdrop (or fake checkerboard) on a transparent asset fails', async () => {
  const checker = '<defs><pattern id="c" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#ccc"/><rect x="16" y="16" width="16" height="16" fill="#ccc"/></pattern></defs>';
  const r = await validateImage(await write('checker.png', svg(`${checker}${gem}`, 'url(#c)')), asset());
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /not transparent/);
});
test('an object cut off at the edge fails', async () => {
  const r = await validateImage(await write('cut.png', svg('<circle cx="980" cy="512" r="300" fill="#f2c14e"/>')), asset());
  assert.match(r.errors.join(), /touches the canvas edge/);
});
test('an avatar frame with a filled centre fails; an open ring passes', async () => {
  const filled = await validateImage(await write('ffill.png', svg('<circle cx="512" cy="512" r="440" fill="#f2c14e"/>')), asset({ category: 'frame' }));
  assert.match(filled.errors.join(), /centre not transparent/);
  const ring = await validateImage(await write('fring.png', svg('<circle cx="512" cy="512" r="410" fill="none" stroke="#f2c14e" stroke-width="70"/><circle cx="512" cy="110" r="40" fill="#d42a44"/>')), asset({ category: 'frame' }));
  assert.equal(ring.ok, true, ring.errors.join(';'));
});
test('near-duplicates are detected', async () => {
  const f = await write('dup.png', svg(gem));
  const first = await validateImage(f, asset({ id: 'a' }));
  const second = await validateImage(f, asset({ id: 'b' }), [{ id: 'a', hash: first.metrics.dhash }]);
  assert.match(second.errors.join(), /near-duplicate of a/);
});
test('optimized WebP is ≤1024 px and ≤1 MB with alpha kept', async () => {
  const f = await write('big.png', svg(gem));
  const out = path.join(dir, 'big.webp');
  const r = await optimize(f, out);
  const meta = await sharp(out).metadata();
  assert.ok(r.bytes <= 1_048_576 && meta.width <= 1024 && meta.hasAlpha);
});
test('selection never picks approved, integrated or existing assets', () => {
  const m = { assets: [
    { id: 'p', status: 'PLANNED', prompt: 'x', priority: 'P1', batch: 'sample-1' },
    { id: 'u', status: 'USER_APPROVED', prompt: 'x', priority: 'P1', batch: 'sample-1' },
    { id: 'i', status: 'INTEGRATED', prompt: 'x', priority: 'P1', batch: 'sample-1' },
    { id: 'e', status: 'EXISTING_APPROVED', prompt: null, priority: 'P0', batch: 'sample-1' },
    { id: 'r', status: 'NEEDS_REVISION', prompt: 'x', priority: 'P1', batch: 'sample-1' },
  ] };
  assert.deepEqual(selectAssets(m, { batch: 'sample-1', batchSize: 10 }).map((a) => a.id), ['p']);
  assert.deepEqual(selectAssets(m, { assets: ['r', 'u'], batchSize: 10 }).map((a) => a.id), ['r']);
});
test('pessimistic pricing is used for unknown sizes', () => {
  assert.equal(estimateUsd(DEFAULT_PRICING, 'high', '1024x1024'), 0.4);
  assert.equal(estimateUsd(DEFAULT_PRICING, 'high', '2048x1152'), 0.6);
});

test('an opaque asset with a fake checkerboard around the subject fails; a full-bleed one passes', async () => {
  const checker = '<defs><pattern id="c" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="#fff"/><rect width="16" height="16" fill="#ccc"/><rect x="16" y="16" width="16" height="16" fill="#ccc"/></pattern></defs><rect width="1024" height="1024" fill="url(#c)"/><ellipse cx="512" cy="512" rx="420" ry="300" fill="#0f5a39"/>';
  const bad = await validateImage(await write('felt-bad.png', svg(checker)), asset({ transparency: false }));
  assert.match(bad.errors.join(), /fake checkerboard/);
  const good = await validateImage(await write('felt-ok.png', svg('<ellipse cx="512" cy="512" rx="420" ry="300" fill="#0f5a39"/>', '#1b1036')), asset({ transparency: false }));
  assert.equal(good.ok, true, good.errors.join(';'));
});
