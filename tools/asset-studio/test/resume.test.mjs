import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kas-resume-'));
process.env.KEYO_STUDIO_DIR = tmp;
const { PATHS } = await import('../src/config.mjs');
const { buildManifest, saveManifest, loadManifest } = await import('../src/manifest.mjs');
const { runBatch } = await import('../src/generate.mjs');
const { loadLedger } = await import('../src/budget.mjs');

fs.mkdirSync(PATHS.generated, { recursive: true });
fs.writeFileSync(PATHS.pricing, JSON.stringify({ verified: true, tokens: { m: { textInput: 5, imageInput: 8, imageOutput: 30 } }, perImageUsd: { high: { '1024x1024': 0.1, '1536x1024': 0.1, '1024x1536': 0.1 } } }));
saveManifest(buildManifest());

let n = 0;
const img = async (size) => {
  n++;
  const [w, h] = size.split('x').map(Number);
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.3 + (n % 7) * 9}" fill="hsl(${n * 37},70%,50%)"/><rect x="${w / 2 - 90 + (n % 5) * 17}" y="${h / 2 - 40}" width="${120 + (n % 3) * 30}" height="${80 + (n % 4) * 20}" fill="#fff"/></svg>`)).png().toBuffer();
};
const client = { images: { generate: async (a) => ({ data: [{ b64_json: (await img(a.size)).toString('base64') }], usage: { input_tokens: 500, input_tokens_details: { text_tokens: 500 }, output_tokens: 1500 } }) } };
const sel = { category: 'vip', batchSize: 12 };

test('an asset left GENERATING by a crash is retried on resume (not lost, not duplicated)', () => {
  const m = loadManifest();
  const a = m.assets.find((x) => x.id === 'vip.badge.vip-02');
  a.status = 'GENERATING';
  saveManifest(m);
  saveManifest(buildManifest());
  assert.equal(loadManifest().assets.find((x) => x.id === 'vip.badge.vip-02').status, 'PLANNED');
});

test('deadline defers the rest of a request; checkpoints fire; the resumed run continues without regenerating', async () => {
  const checkpoints = [];
  let calls = 0;
  const slow = { images: { generate: async (a) => { calls++; await new Promise((r) => setTimeout(r, 400)); return client.images.generate(a); } } };
  const deadline = Date.now() + 700; // expires after one or two images
  const r1 = await runBatch({ client: slow, dryRun: false, model: 'm', budgetLimitUsd: 2, requestId: 'batch-x', select: sel, log: () => {}, checkpoint: async (l) => checkpoints.push(l), checkpointEvery: 1, deadline });
  assert.equal(r1.deferred, true);
  const done1 = r1.generated.map((g) => g.id);
  assert.ok(done1.length >= 1);
  assert.equal(checkpoints.length, done1.length);
  const r2 = await runBatch({ client: slow, dryRun: false, model: 'm', budgetLimitUsd: 2, requestId: 'batch-x', select: sel, log: () => {} });
  assert.ok(!r2.deferred);
  assert.ok(r2.generated.every((g) => !done1.includes(g.id)), 'nothing generated twice');
  assert.equal(new Set([...done1, ...r2.generated.map((g) => g.id)]).size, done1.length + r2.generated.length);
  assert.equal(calls, done1.length + r2.generated.length);
});

test('the request cap holds across runs of the same request', async () => {
  // Fresh request with a $0.15 cap: each image costs $0.0475 real, estimate $0.10 → at most 1 image per run.
  saveManifest(buildManifest());
  const m = loadManifest();
  for (const a of m.assets.filter((x) => x.category === 'frame')) a.status = 'PLANNED';
  saveManifest(m);
  const s = { category: 'frame', batchSize: 10 };
  const a1 = await runBatch({ client, dryRun: false, model: 'm', budgetLimitUsd: 0.15, requestId: 'cap-y', select: s, log: () => {} });
  const a2 = await runBatch({ client, dryRun: false, model: 'm', budgetLimitUsd: 0.15, requestId: 'cap-y', select: s, log: () => {} });
  const spent = loadLedger().entries.filter((e) => e.requestId === 'cap-y').reduce((t, e) => t + e.actualUsd, 0);
  assert.ok(spent <= 0.15 + 1e-9, `request spend ${spent}`);
  assert.equal(a1.generated.length + a2.generated.length, 2);
  assert.ok(a2.skippedBudget.every((x) => x.reason === 'request cap'));
});

test('when the APPROVED budget runs out the request stops, is flagged budgetExhausted and stays resumable', async () => {
  const { saveLedger, spentUsd } = await import('../src/budget.mjs');
  const l = loadLedger();
  l.approvedTotalUsd = +(spentUsd(l) + 0.12).toFixed(6); // room for exactly one more image (estimate $0.10)
  saveLedger(l);
  const r = await runBatch({ client, dryRun: false, model: 'm', budgetLimitUsd: 5, requestId: 'exhaust-z', select: { category: 'collectible', batchSize: 5 }, log: () => {} });
  assert.equal(r.generated.length, 1);
  assert.equal(r.budgetExhausted, true);
  assert.ok(r.skippedBudget.every((s) => s.reason === 'approved budget exhausted'));
  assert.ok(spentUsd(loadLedger()) <= loadLedger().approvedTotalUsd + 1e-9, 'never above the approved total');
});
