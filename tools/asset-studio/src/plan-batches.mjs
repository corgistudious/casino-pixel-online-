#!/usr/bin/env node
/**
 * Splits every PLANNED asset of the manifest into owner-ordered batches (≤ maxPerBatch) and writes
 * one request file per batch to assets/studio/requests/. Related assets stay together (category +
 * subcategory), so each batch is reviewed as a coherent family.
 *   node src/plan-batches.mjs <prefix> [maxPerBatch=15] [--write]
 */
import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './config.mjs';
import { loadManifest } from './manifest.mjs';
import { estimateUsd, loadPricing } from './budget.mjs';

// Owner priority (2026-11-07): games → VIP → frames/profile → items → bank/chests → events/tournament/
// achievements → bubbles/titles/effects → everything else.
const GROUPS = [
  ['1-games', (a) => a.category === 'game' || a.category === 'cardback'],
  ['2-vip', (a) => a.category === 'vip' || (a.category === 'frame' && a.subcategory === 'vip')],
  ['3-frames-profile', (a) => a.category === 'frame' || a.category === 'profile' || a.category === 'avatar'],
  ['4-collectibles', (a) => a.category === 'collectible'],
  ['5-bank-chests', (a) => a.category === 'bank' || a.category === 'chest'],
  ['6-events-tournament-achievements', (a) => ['event', 'tournament', 'achievement'].includes(a.category)],
  ['7-bubbles-titles-fx', (a) => ['bubble', 'title', 'fx'].includes(a.category)],
  ['8-other', () => true],
];

export function planBatches(manifest, maxPerBatch = 15) {
  const left = manifest.assets.filter((a) => a.status === 'PLANNED');
  const taken = new Set();
  const batches = [];
  for (const [name, match] of GROUPS) {
    const list = left.filter((a) => !taken.has(a.id) && match(a)).sort((a, b) => `${a.category}.${a.subcategory}`.localeCompare(`${b.category}.${b.subcategory}`) || a.id.localeCompare(b.id));
    list.forEach((a) => taken.add(a.id));
    if (!list.length) continue;
    const n = Math.ceil(list.length / maxPerBatch);
    const size = Math.ceil(list.length / n); // even batch sizes
    for (let i = 0; i < n; i++) batches.push({ group: name, part: i + 1, of: n, assets: list.slice(i * size, (i + 1) * size) });
  }
  return batches;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [prefix = 'batch', maxArg = '15'] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
  const write = process.argv.includes('--write');
  const m = loadManifest();
  const pricing = loadPricing();
  const batches = planBatches(m, Number(maxArg));
  let total = 0;
  batches.forEach((b, i) => {
    const est = b.assets.reduce((t, a) => t + estimateUsd(pricing, 'high', a.resolution), 0);
    total += b.assets.length;
    const id = `${prefix}-${String(i + 1).padStart(2, '0')}-${b.group}${b.of > 1 ? `-${b.part}` : ''}`;
    console.log(`${id}: ${b.assets.length} assets, cap $${est.toFixed(2)} — ${[...new Set(b.assets.map((a) => `${a.category}/${a.subcategory}`))].join(', ')}`);
    if (write) {
      const req = { id, mode: 'generate', assets: b.assets.map((a) => a.id), batchSize: b.assets.length, budgetLimitUsd: +est.toFixed(2), model: 'gpt-image-2.5-sunburst', quality: 'high', approvedBy: "owner — 2026-11-07 'COMPLETE ALL 252 REMAINING ASSETS' (within the approved budget only)", note: `Library batch ${i + 1}/${batches.length} (${b.group} ${b.part}/${b.of}).` };
      fs.writeFileSync(path.join(PATHS.requests, `${id}.json`), `${JSON.stringify(req, null, 2)}\n`);
    }
  });
  console.log(`${batches.length} batches, ${total} assets`);
}
