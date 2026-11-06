import fs from 'node:fs';
import { CATALOG } from './catalog.mjs';
import { DEFAULT_QUALITY, PATHS, STATUSES } from './config.mjs';
import { buildPrompt } from './prompt.mjs';
import { estimateUsd, loadPricing } from './budget.mjs';

export function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(PATHS.manifest, 'utf8'));
  } catch {
    return { version: 1, assets: [] };
  }
}
export function saveManifest(m) {
  m.updatedAt = new Date().toISOString();
  fs.writeFileSync(PATHS.manifest, `${JSON.stringify(m, null, 2)}\n`);
}

/**
 * Rebuilds the manifest from the catalog, keeping each asset's history (status, versions, outputs,
 * review notes, actual cost). New catalog entries start as PLANNED (or EXISTING_APPROVED).
 */
export function buildManifest() {
  const prev = new Map(loadManifest().assets.map((a) => [a.id, a]));
  const pricing = loadPricing();
  const today = new Date().toISOString().slice(0, 10);
  const assets = CATALOG.map((c) => {
    const old = prev.get(c.id);
    const prompt = buildPrompt(c);
    const base = {
      id: c.id,
      category: c.category,
      subcategory: c.subcategory,
      system: c.system,
      name: c.name,
      description: c.description,
      prompt,
      model: old?.model ?? null,
      quality: c.existing ? null : (old?.quality ?? DEFAULT_QUALITY),
      resolution: c.size,
      transparency: !!c.transparent,
      animation: c.animation ?? null,
      rarity: c.rarity ?? null,
      priority: c.priority,
      batch: c.batch ?? null,
      costEstimateUsd: c.existing ? 0 : estimateUsd(pricing, old?.quality ?? DEFAULT_QUALITY, c.size),
      actualCostUsd: old?.actualCostUsd ?? null,
      status: old?.status ?? (c.existing ? 'EXISTING_APPROVED' : 'PLANNED'),
      integration: old?.integration ?? (c.existing ? 'in-use' : 'not-integrated'),
      version: old?.version ?? 0,
      versions: old?.versions ?? [],
      sourceFile: c.existing ? c.existing.file : (old?.sourceFile ?? null),
      optimizedFile: old?.optimizedFile ?? null,
      validation: old?.validation ?? null,
      review: old?.review ?? null,
      createdDate: old?.createdDate ?? today,
      provenance: c.existing ? 'Existing project asset (in repository before Asset Studio).' : 'Generated with the OpenAI Image API from the prompt above (original artwork; no third-party assets).',
    };
    if (!STATUSES.includes(base.status)) base.status = 'PLANNED';
    if (old && old.prompt && old.prompt !== prompt && old.status === 'PLANNED') base.promptChanged = true;
    return base;
  });
  const m = { version: 1, assets };
  return m;
}

export function summarize(m) {
  const by = (k) => m.assets.reduce((acc, a) => ((acc[a[k]] = (acc[a[k]] ?? 0) + 1), acc), {});
  const planned = m.assets.filter((a) => a.status === 'PLANNED');
  return {
    total: m.assets.length,
    byStatus: by('status'),
    byCategory: by('category'),
    plannedCostEstimateUsd: +planned.reduce((s, a) => s + (a.costEstimateUsd ?? 0), 0).toFixed(2),
    sampleBatch: m.assets.filter((a) => a.batch === 'sample-1').map((a) => a.id),
  };
}
