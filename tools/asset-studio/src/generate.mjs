import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_QUALITY, PATHS, REPO } from './config.mjs';
import { estimateUsd, actualUsd, entryUsd, loadLedger, loadPricing, remainingUsd, saveLedger, spentUsd } from './budget.mjs';
import { loadManifest, saveManifest } from './manifest.mjs';
import { optimize, validateImage } from './validate.mjs';

const GENERATABLE = new Set(['PLANNED', 'NEEDS_REVISION']);
const FATAL = (e) => [401, 403, 404].includes(e?.status) || ['insufficient_quota', 'billing_hard_limit_reached', 'model_not_found', 'invalid_api_key'].includes(e?.code);

/** Picks the assets a run may generate (never approved / integrated / existing ones). */
export function selectAssets(manifest, { assets, batch, category, batchSize = 10, includeRevisions = false } = {}) {
  let list = manifest.assets.filter((a) => GENERATABLE.has(a.status) && a.prompt);
  // A NEEDS_REVISION asset is regenerated only when named explicitly (or includeRevisions).
  if (!includeRevisions) list = list.filter((a) => a.status === 'PLANNED' || (assets && assets.includes(a.id)));
  if (assets?.length) list = list.filter((a) => assets.includes(a.id));
  if (batch) list = list.filter((a) => a.batch === batch);
  if (category) list = list.filter((a) => a.category === category);
  const prio = { P0: 0, P1: 1, P2: 2, P3: 3 };
  list.sort((a, b) => prio[a.priority] - prio[b.priority] || a.id.localeCompare(b.id));
  return list.slice(0, Math.max(0, batchSize));
}

/** Plans (dry run) or runs a batch within the remaining approved budget. Writes a run report. */
export async function runBatch({ client = null, dryRun = true, model, quality = DEFAULT_QUALITY, budgetLimitUsd = 0, requestId = `manual-${Date.now()}`, select = {}, log = console.log, checkpoint = null, checkpointEvery = 5, deadline = null }) {
  const manifest = loadManifest();
  const ledger = loadLedger();
  const pricing = loadPricing();
  const picked = selectAssets(manifest, select);
  const runCap = Math.min(remainingUsd(ledger), Math.max(0, budgetLimitUsd));
  const report = { requestId, dryRun, model, quality, pricingVerified: !!pricing.verified, budgetLimitUsd, remainingBeforeUsd: +remainingUsd(ledger).toFixed(4), runCapUsd: +runCap.toFixed(4), planned: [], generated: [], skippedBudget: [], errors: [], startedAt: new Date().toISOString() };
  let committed = 0;
  for (const a of picked) {
    const est = estimateUsd(pricing, quality, a.resolution);
    if (committed + est > runCap + 1e-9) {
      report.skippedBudget.push({ id: a.id, estimateUsd: est });
      continue;
    }
    committed += est;
    report.planned.push({ id: a.id, size: a.resolution, transparent: a.transparency, estimateUsd: est });
  }
  report.plannedEstimateUsd = +committed.toFixed(4);
  log(`[plan] ${report.planned.length} asset(s), estimate $${committed.toFixed(2)} (cap $${runCap.toFixed(2)}, pricing ${pricing.verified ? 'verified' : 'UNVERIFIED pessimistic'}); ${report.skippedBudget.length} left for a later batch`);
  if (dryRun || !client) return finish(report, ledger, log);

  const hashes = manifest.assets.filter((x) => x.validation?.metrics?.dhash).map((x) => ({ id: x.id, hash: x.validation.metrics.dhash }));
  // Live budget: the plan above uses upper-bound estimates; while generating, completed images count
  // at their real cost (usage) when known, so the run continues through `picked` only while
  // (spent in this run + the next image's upper-bound estimate) stays within the cap.
  // The request cap covers every run of the same request (a resumed request never re-spends its cap);
  // the approved budget is re-checked live before every image.
  const spentThisRequest = () => ledger.entries.filter((e) => e.requestId === requestId).reduce((t, e) => t + entryUsd(e), 0);
  report.planned = [];
  report.skippedBudget = [];
  for (const cand of picked) {
    const est = estimateUsd(pricing, quality, cand.resolution);
    if (deadline && Date.now() > deadline) {
      report.deferred = true;
      log(`[defer] time budget reached before ${cand.id} — the rest of this request resumes in the next run`);
      break;
    }
    if (spentThisRequest() + est > Math.max(0, budgetLimitUsd) + 1e-9 || est > remainingUsd(ledger) + 1e-9) {
      report.skippedBudget.push({ id: cand.id, estimateUsd: est, reason: est > remainingUsd(ledger) ? 'approved budget exhausted' : 'request cap' });
      continue;
    }
    const p = { id: cand.id, size: cand.resolution, transparent: cand.transparency, estimateUsd: est };
    report.planned.push(p);
    const a = manifest.assets.find((x) => x.id === p.id);
    a.status = 'GENERATING';
    saveManifest(manifest);
    const version = (a.version ?? 0) + 1;
    const dir = path.join(PATHS.generated, a.id, `v${version}`);
    fs.mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    let res;
    try {
      // One request, n=1, no automatic retry (client maxRetries: 0): a failed call is never repeated.
      res = await client.images.generate({ model, prompt: a.prompt, size: a.resolution, quality, background: a.transparency ? 'transparent' : 'opaque', output_format: 'png', n: 1, moderation: 'auto' });
    } catch (e) {
      // Not billed when the API rejects the request; count the estimate when the outcome is unknown (timeout / 5xx).
      const unknown = !e?.status || e.status >= 500;
      const charge = unknown ? p.estimateUsd : 0;
      ledger.spentEstimatedUsd = +(ledger.spentEstimatedUsd + charge).toFixed(4);
      const error = `${e?.status ?? ''} ${e?.code ?? ''} ${String(e?.message ?? e).slice(0, 200)}`.trim();
      ledger.entries.push({ at: new Date().toISOString(), requestId, assetId: a.id, model, quality, size: a.resolution, ok: false, error, estimatedUsd: charge });
      a.status = 'PLANNED';
      a.lastError = error;
      report.errors.push({ id: a.id, error });
      saveLedger(ledger);
      saveManifest(manifest);
      log(`[error] ${a.id}: ${error}`);
      if (FATAL(e)) {
        log('[stop] fatal API error — no further requests in this run');
        break;
      }
      continue;
    }
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) {
      report.errors.push({ id: a.id, error: 'empty response' });
      a.status = 'PLANNED';
      saveManifest(manifest);
      continue;
    }
    const src = path.join(dir, 'source.png');
    fs.writeFileSync(src, Buffer.from(b64, 'base64'));
    const act = actualUsd(pricing, res.usage, model);
    ledger.spentEstimatedUsd = +(ledger.spentEstimatedUsd + p.estimateUsd).toFixed(4);
    if (act !== null) ledger.spentActualUsd = +((ledger.spentActualUsd ?? 0) + act).toFixed(6);
    ledger.images += 1;
    ledger.entries.push({ at: new Date().toISOString(), requestId, assetId: a.id, version, model, quality, size: a.resolution, ok: true, estimatedUsd: p.estimateUsd, actualUsd: act, usage: res.usage ?? null, seconds: Math.round((Date.now() - t0) / 1000) });
    saveLedger(ledger);
    const webp = path.join(dir, 'optimized.webp');
    const opt = await optimize(src, webp);
    Object.assign(a, { version, model, quality, sourceFile: path.relative(REPO, src), optimizedFile: path.relative(REPO, webp), actualCostUsd: act, usage: res.usage ?? null, status: 'GENERATED' });
    a.validation = await validateImage(src, a, hashes.filter((h) => h.id !== a.id));
    a.validation.optimized = opt;
    if (opt.overLimit) a.validation.warnings.push('optimized WebP above 1 MB');
    a.status = a.validation.ok ? 'NEEDS_REVIEW' : 'NEEDS_REVISION';
    a.versions = [...(a.versions ?? []), { version, sourceFile: a.sourceFile, optimizedFile: a.optimizedFile, model, quality, createdAt: new Date().toISOString(), validationOk: a.validation.ok }];
    delete a.lastError;
    hashes.push({ id: a.id, hash: a.validation.metrics.dhash });
    saveManifest(manifest);
    report.generated.push({ id: a.id, status: a.status, errors: a.validation.errors, warnings: a.validation.warnings });
    log(`[ok] ${a.id} → ${a.status}${a.validation.errors.length ? ` (${a.validation.errors.join('; ')})` : ''}`);
    // Checkpoint: images, manifest and ledger are already on disk; persist them remotely every few
    // images so a later failure never loses earlier work (CI commits + pushes).
    if (checkpoint && report.generated.length % checkpointEvery === 0) await checkpoint(`${requestId}: ${report.generated.length} image(s)`);
  }
  return finish(report, ledger, log);
}

function finish(report, ledger, log) {
  report.finishedAt = new Date().toISOString();
  // Stopped because the APPROVED budget ran out (not the request cap): the request stays pending and
  // resumes after the owner raises the approved budget.
  report.budgetExhausted = !report.dryRun && report.skippedBudget.some((s) => s.reason === 'approved budget exhausted');
  report.ledger = { approvedTotalUsd: ledger.approvedTotalUsd, spentUsd: spentUsd(ledger), spentEstimatedUsd: ledger.spentEstimatedUsd, spentActualUsd: ledger.spentActualUsd, remainingUsd: +remainingUsd(ledger).toFixed(4), images: ledger.images };
  fs.mkdirSync(PATHS.reports, { recursive: true });
  fs.writeFileSync(path.join(PATHS.reports, `run-${report.requestId}.json`), `${JSON.stringify(report, null, 2)}\n`);
  log(`[ledger] counted spend $${spentUsd(ledger).toFixed(4)} of $${ledger.approvedTotalUsd} (real cost where usage was returned, estimate otherwise); remaining $${report.ledger.remainingUsd.toFixed(2)}`);
  return report;
}
