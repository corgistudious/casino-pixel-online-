#!/usr/bin/env node
/**
 * Keyo Asset Studio CLI.
 *   node src/cli.mjs audit                      Phase 1 source audit → reports/inventory.json
 *   node src/cli.mjs manifest                   rebuild manifest.json from the catalog (keeps history)
 *   node src/cli.mjs estimate [--batch b] [--category c] [--size n]
 *   node src/cli.mjs run --dry-run|--generate [--batch b] [--category c] [--assets a,b] [--size n] [--budget usd] [--model m] [--quality q]
 *   node src/cli.mjs validate                   re-run technical validation on generated images
 *   node src/cli.mjs sheets                     contact sheets → assets/studio/previews
 *   node src/cli.mjs review <id> approve|revise|reject ["note"]   (the USER's decision)
 *   node src/cli.mjs ci                         GitHub Actions entry point (dispatch inputs or request files)
 * Paid calls need OPENAI_API_KEY (GitHub Actions secret). The key is never printed or written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import OpenAI from 'openai';
import { DEFAULT_QUALITY, MODEL_PREFERENCE, PATHS, REPO } from './config.mjs';
import { buildManifest, loadManifest, saveManifest, summarize } from './manifest.mjs';
import { loadLedger, loadPricing, remainingUsd, saveLedger } from './budget.mjs';
import { runBatch, selectAssets } from './generate.mjs';
import { validateImage } from './validate.mjs';
import { buildSheets } from './sheets.mjs';
import { audit } from './audit.mjs';
import { probe } from './probe.mjs';
import { writeReports } from './reports.mjs';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, def = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def;
};
const client = () => (process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 300_000 }) : null);

async function resolveModel(requested, c) {
  if (requested && requested !== 'auto') return { model: requested, probe: null };
  const p = await probe(c);
  return { model: p.preferred ?? MODEL_PREFERENCE[0], probe: p };
}

async function main() {
  switch (cmd) {
    case 'audit': {
      const r = await audit();
      console.log(`${r.images.length} image files; VIP levels ${r.vipLevels}; seeded cosmetics ${JSON.stringify(r.seededCosmetics)}`);
      break;
    }
    case 'manifest': {
      const m = buildManifest();
      saveManifest(m);
      console.log(JSON.stringify(summarize(m), null, 2));
      break;
    }
    case 'estimate':
    case 'run': {
      const m = buildManifest();
      saveManifest(m);
      const generate = cmd === 'run' && opt('generate', false) === true;
      const c = generate ? client() : null;
      if (generate && !c) throw new Error('OPENAI_API_KEY is not set: generation runs only in GitHub Actions');
      const { model } = generate ? await resolveModel(opt('model', 'auto'), c) : { model: opt('model', MODEL_PREFERENCE[0]) };
      await runBatch({
        client: c,
        dryRun: !generate,
        model,
        quality: opt('quality', DEFAULT_QUALITY),
        budgetLimitUsd: Number(opt('budget', remainingUsd(loadLedger()))),
        requestId: opt('request', `cli-${new Date().toISOString().replace(/[:.]/g, '-')}`),
        select: { batch: opt('batch'), category: opt('category'), assets: opt('assets') ? String(opt('assets')).split(',') : undefined, batchSize: Number(opt('size', 25)) },
      });
      break;
    }
    case 'validate': {
      const m = loadManifest();
      const hashes = [];
      for (const a of m.assets.filter((x) => x.sourceFile?.startsWith('assets/studio/'))) {
        a.validation = { ...(await validateImage(path.join(REPO, a.sourceFile), a, hashes)), optimized: a.validation?.optimized };
        hashes.push({ id: a.id, hash: a.validation.metrics.dhash, color: a.validation.metrics.avgColor });
        if (['GENERATED', 'TECHNICALLY_VALIDATED', 'NEEDS_REVIEW', 'NEEDS_REVISION'].includes(a.status) && !a.review) a.status = a.validation.ok ? 'NEEDS_REVIEW' : 'NEEDS_REVISION';
        console.log(`${a.id}: ${a.validation.ok ? 'OK' : a.validation.errors.join('; ')}`);
      }
      saveManifest(m);
      break;
    }
    case 'sheets':
      console.log((await buildSheets(loadManifest())).join('\n'));
      break;
    case 'review': {
      // Records the user's decision. Run by the user (or on the user's explicit instruction).
      const [, id, decision, note = ''] = args;
      const m = loadManifest();
      const a = m.assets.find((x) => x.id === id);
      if (!a) throw new Error(`unknown asset ${id}`);
      const map = { approve: 'USER_APPROVED', revise: 'NEEDS_REVISION', reject: 'REJECTED' };
      if (!map[decision]) throw new Error('decision must be approve | revise | reject');
      a.status = map[decision];
      a.review = { decision, note, at: new Date().toISOString(), by: process.env.KEYO_REVIEWER ?? 'user' };
      saveManifest(m);
      console.log(`${id} → ${a.status}`);
      break;
    }
    case 'circle-mask': {
      // Post-process (no paid call): round badge art → real transparent corners. Usage: circle-mask <category|id>
      const [, target] = args;
      const { circleMask } = await import('./compose/circle.mjs');
      const { optimize } = await import('./validate.mjs');
      const m = loadManifest();
      const list = m.assets.filter((x) => (x.id === target || x.category === target) && x.sourceFile?.startsWith('assets/studio/') && !['USER_APPROVED', 'INTEGRATED'].includes(x.status));
      for (const a of list) {
        const base = a.sourceFile;
        const version = (a.version ?? 0) + 1;
        const dir = path.join(PATHS.generated, a.id, `v${version}`);
        fs.mkdirSync(dir, { recursive: true });
        const src = path.join(dir, 'source.png');
        await circleMask(path.join(REPO, base), src);
        const webp = path.join(dir, 'optimized.webp');
        const opt = await optimize(src, webp);
        Object.assign(a, { version, sourceFile: path.relative(REPO, src), optimizedFile: path.relative(REPO, webp), transparency: true, method: 'postprocess-circle-mask' });
        const others = m.assets.filter((x) => x.id !== a.id && x.validation?.metrics?.dhash).map((x) => ({ id: x.id, hash: x.validation.metrics.dhash, color: x.validation.metrics.avgColor }));
        a.validation = { ...(await validateImage(src, a, others)), optimized: opt };
        a.status = a.validation.ok ? 'NEEDS_REVIEW' : 'NEEDS_REVISION';
        a.provenance = `${a.provenance} Post-processed: circle mask (outside of the round badge made truly transparent) from ${base}; artwork unchanged.`;
        a.versions = [...(a.versions ?? []), { version, sourceFile: a.sourceFile, optimizedFile: a.optimizedFile, method: 'postprocess-circle-mask', from: base, createdAt: new Date().toISOString(), validationOk: a.validation.ok }];
        console.log(`${a.id} v${version} → ${a.status}${a.validation.errors.length ? ` (${a.validation.errors.join('; ')})` : ''}`);
      }
      saveManifest(m);
      break;
    }
    case 'compose': {
      // Post-processing for assets an image model cannot produce exactly (no paid call).
      const [, what] = args;
      if (what !== 'roulette') throw new Error('compose: supported target is "roulette"');
      const { composeRoulette } = await import('./compose/roulette.mjs');
      const { optimize } = await import('./validate.mjs');
      const m = loadManifest();
      const a = m.assets.find((x) => x.id === 'game.roulette.wheel-head');
      const base = (a.versions ?? []).filter((v) => v.method !== 'composite').at(-1);
      if (!base) throw new Error('no generated roulette wheel to take the centre from');
      const version = (a.version ?? 0) + 1;
      const dir = path.join(PATHS.generated, a.id, `v${version}`);
      fs.mkdirSync(dir, { recursive: true });
      const src = path.join(dir, 'source.png');
      await composeRoulette(path.join(REPO, base.sourceFile), src);
      const webp = path.join(dir, 'optimized.webp');
      const opt = await optimize(src, webp);
      const others = m.assets.filter((x) => x.id !== a.id && x.validation?.metrics?.dhash).map((x) => ({ id: x.id, hash: x.validation.metrics.dhash, color: x.validation.metrics.avgColor }));
      Object.assign(a, { version, sourceFile: path.relative(REPO, src), optimizedFile: path.relative(REPO, webp), actualCostUsd: 0, method: 'composite' });
      a.validation = { ...(await validateImage(src, a, others)), optimized: opt };
      a.status = a.validation.ok ? 'NEEDS_REVIEW' : 'NEEDS_REVISION';
      a.provenance = `Composite: centre (cone + turret) from the AI image ${base.sourceFile}; the 37-pocket ring, colours and numbers drawn by code in the game's European order (tools/asset-studio/src/compose/roulette.mjs). Numbers use the UI font stack (Be Vietnam Pro, fallback DejaVu Sans/Arial).`;
      a.versions = [...(a.versions ?? []), { version, sourceFile: a.sourceFile, optimizedFile: a.optimizedFile, method: 'composite', from: base.sourceFile, createdAt: new Date().toISOString(), validationOk: a.validation.ok }];
      delete a.review;
      saveManifest(m);
      console.log(`${a.id} v${version} → ${a.status}${a.validation.errors.length ? ` (${a.validation.errors.join('; ')})` : ''}`);
      break;
    }
    case 'ci':
      await ci();
      break;
    default:
      console.log('commands: audit | manifest | estimate | run | validate | sheets | review | ci');
  }
}

/**
 * GitHub Actions entry. workflow_dispatch → inputs from env; push → every request file in
 * assets/studio/requests/ not yet executed (recorded in the ledger, so a request runs once).
 */
async function ci() {
  const ev = process.env.GITHUB_EVENT_NAME;
  const jobs = [];
  if (ev === 'workflow_dispatch') {
    jobs.push({ id: `dispatch-${process.env.GITHUB_RUN_ID ?? Date.now()}`, mode: process.env.IN_MODE || 'dry_run', batch: process.env.IN_BATCH || null, category: process.env.IN_CATEGORY || null, assets: process.env.IN_ASSETS ? process.env.IN_ASSETS.split(',') : null, batchSize: Number(process.env.IN_BATCH_SIZE || 10), budgetLimitUsd: Number(process.env.IN_BUDGET_LIMIT || 0), model: process.env.IN_MODEL || 'auto', quality: process.env.IN_QUALITY || DEFAULT_QUALITY });
  } else {
    const ledger = loadLedger();
    const files = fs.existsSync(PATHS.requests) ? fs.readdirSync(PATHS.requests).filter((f) => f.endsWith('.json')).sort() : [];
    for (const f of files) {
      const r = JSON.parse(fs.readFileSync(path.join(PATHS.requests, f), 'utf8'));
      if (!r.id || ledger.executedRequests.includes(r.id)) continue;
      jobs.push(r);
    }
  }
  const m = buildManifest();
  saveManifest(m);
  await audit();
  const c = client();
  const p = await probe(c);
  console.log(`[probe] image models available: ${p.imageModels.join(', ') || '(none listed)'}; preferred: ${p.preferred ?? 'none'}${p.modelsError ? `; error: ${p.modelsError}` : ''}`);
  // Wall-clock budget inside the job timeout: no new image starts after the deadline; unfinished
  // requests stay pending and resume in the next run (assets already generated are skipped).
  const deadline = Date.now() + Number(process.env.KEYO_TIME_BUDGET_MIN ?? 110) * 60_000;
  const checkpoint = async (label) => {
    await buildSheets(loadManifest());
    writeReports();
    gitCheckpoint(label);
  };
  for (const job of jobs) {
    if (Date.now() > deadline) {
      console.log(`[defer] ${job.id}: time budget reached — resumes in the next run`);
      continue;
    }
    const generate = job.mode === 'generate';
    const model = job.model && job.model !== 'auto' ? job.model : (p.preferred ?? null);
    console.log(`[request] ${job.id}: ${job.mode} batch=${job.batch ?? '-'} category=${job.category ?? '-'} size=${job.batchSize} budget=$${job.budgetLimitUsd} model=${model ?? 'unavailable'}`);
    if (generate && (!c || !model)) {
      console.log('[skip] generation needs OPENAI_API_KEY and an available image model (see reports/probe.json)');
      continue;
    }
    const r = await runBatch({ client: generate ? c : null, dryRun: !generate, model: model ?? MODEL_PREFERENCE[0], quality: job.quality ?? DEFAULT_QUALITY, budgetLimitUsd: job.budgetLimitUsd ?? 0, requestId: job.id, select: { batch: job.batch, category: job.category, assets: job.assets, batchSize: job.batchSize ?? 10 }, checkpoint: generate ? checkpoint : null, deadline });
    // A request is done when it was not cut short by the deadline (budget stops are final: they are reported).
    if (r.budgetExhausted) console.log(`[budget] approved budget exhausted — ${r.skippedBudget.length} asset(s) of ${job.id} wait for a top-up (see docs/asset-studio/BUDGET.md)`);
    if (ev !== 'workflow_dispatch' && !r.deferred && !r.budgetExhausted) {
      const ledger = loadLedger();
      ledger.executedRequests = [...new Set([...ledger.executedRequests, job.id])];
      saveLedger(ledger);
    }
    if (generate) await checkpoint(`${job.id} done`);
  }
  await buildSheets(loadManifest());
  writeReports();
}

/** Commits and pushes studio outputs (GitHub Actions only). Never fails the run on a push error. */
function gitCheckpoint(label) {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  const sh = (cmd) => execSync(cmd, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  try {
    sh('git add assets/studio docs/asset-studio');
    if (!sh('git status --porcelain assets/studio docs/asset-studio').trim()) return;
    sh(`git commit -m "chore(asset-studio): checkpoint — ${label.replace(/"/g, "'")}"`);
    const ref = process.env.GITHUB_REF_NAME;
    for (let i = 0; i < 3; i++) {
      try {
        sh(`git pull --rebase origin ${ref}`);
        sh(`git push origin HEAD:${ref}`);
        console.log(`[checkpoint] pushed: ${label}`);
        return;
      } catch {
        /* retry */
      }
    }
    console.log(`[checkpoint] push failed (outputs stay committed locally and in the artifact): ${label}`);
  } catch (e) {
    console.log(`[checkpoint] skipped: ${String(e?.message ?? e).slice(0, 160)}`);
  }
}

main().catch((e) => {
  console.error(`[asset-studio] ${String(e?.message ?? e).replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')}`);
  process.exit(1);
});

export { selectAssets, loadPricing };
