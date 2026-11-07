import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

// Isolated studio directory: the tool's paths are redirected before the modules load.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kas-run-'));
process.env.KEYO_STUDIO_DIR = tmp;
const { PATHS } = await import('../src/config.mjs');
const { buildManifest, saveManifest, loadManifest } = await import('../src/manifest.mjs');
const { runBatch } = await import('../src/generate.mjs');
const { loadLedger, spentUsd } = await import('../src/budget.mjs');

fs.mkdirSync(PATHS.generated, { recursive: true });
fs.writeFileSync(PATHS.pricing, JSON.stringify({ verified: true, tokens: { 'm-test': { textInput: 5, imageInput: 8, imageOutput: 30 } }, perImageUsd: { high: { '1024x1024': 0.3, '1536x1024': 0.45, '1024x1536': 0.45 } } }));
saveManifest(buildManifest());

const svg = (i, w = 1024, h = 1024) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${200 + i * 11}" fill="hsl(${i * 47},70%,55%)"/><rect x="${w / 2 - 120 + i * 9}" y="${h / 2 - 60}" width="160" height="${90 + i * 13}" fill="#fff"/></svg>`);

test('a generate run: real cost from usage, live budget cap, rejected requests not charged, statuses set, no approval', async () => {
  let n = 0;
  const calls = [];
  const client = {
    images: {
      generate: async (args) => {
        n++;
        calls.push(args);
        if (n === 2) {
          const e = new Error('blocked by moderation');
          e.status = 400;
          e.code = 'moderation_blocked';
          throw e;
        }
        const [w, h] = args.size.split('x').map(Number);
        const buf = await sharp(svg(n, w, h)).png().toBuffer();
        return { data: [{ b64_json: buf.toString('base64') }], usage: { input_tokens: 1000, input_tokens_details: { text_tokens: 1000, image_tokens: 0 }, output_tokens: 6000 } };
      },
    },
  };
  // Real cost per image = (1000×5 + 6000×30)/1e6 = $0.185; the cap is $0.70.
  const r = await runBatch({ client, dryRun: false, model: 'm-test', quality: 'high', budgetLimitUsd: 0.7, requestId: 't1', select: { batch: 'sample-1', batchSize: 25 }, log: () => {} });
  const ledger = loadLedger();
  assert.equal(r.errors.length, 1, 'the moderation rejection is reported');
  assert.ok(r.generated.length >= 2, `generated ${r.generated.length}`);
  assert.ok(spentUsd(ledger) <= 0.7 + 1e-9, `spend ${spentUsd(ledger)} within cap`);
  assert.equal(ledger.entries.find((e) => !e.ok).estimatedUsd, 0, 'a rejected request is not charged');
  for (const e of ledger.entries.filter((x) => x.ok)) assert.equal(e.actualUsd, 0.185);
  assert.ok(r.skippedBudget.length > 0, 'the rest waits for a later batch');
  assert.ok(calls.every((c) => c.n === 1 && c.output_format === 'png' && c.quality === 'high'));
  assert.ok(calls.every((c) => ['transparent', 'opaque'].includes(c.background)));
  const m = loadManifest();
  for (const g of r.generated) {
    const a = m.assets.find((x) => x.id === g.id);
    assert.ok(['NEEDS_REVIEW', 'NEEDS_REVISION'].includes(a.status));
    assert.ok(fs.existsSync(path.join(PATHS.repo, a.sourceFile)) && fs.existsSync(path.join(PATHS.repo, a.optimizedFile)));
  }
  assert.ok(!m.assets.some((a) => ['USER_APPROVED', 'INTEGRATED'].includes(a.status)), 'the tool never approves');
});

test('a second run never regenerates generated assets and keeps the spend history', async () => {
  const before = loadLedger().entries.length;
  const spent = spentUsd(loadLedger());
  const generatedIds = loadManifest().assets.filter((a) => a.version > 0).map((a) => a.id);
  const client = { images: { generate: async () => ({ data: [{ b64_json: (await sharp(svg(99)).png().toBuffer()).toString('base64') }], usage: { input_tokens: 1000, output_tokens: 6000 } }) } };
  const r = await runBatch({ client, dryRun: false, model: 'm-test', budgetLimitUsd: 0.3, requestId: 't2', select: { batch: 'sample-1', batchSize: 25 }, log: () => {} });
  assert.ok(r.generated.every((g) => !generatedIds.includes(g.id)));
  assert.ok(loadLedger().entries.length >= before && spentUsd(loadLedger()) >= spent);
});
