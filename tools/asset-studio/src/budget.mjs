import fs from 'node:fs';
import { APPROVED_TOTAL_USD, PATHS } from './config.mjs';

/**
 * Pricing. The OpenAI pricing pages could not be read from the build sandbox, so this table is
 * NOT verified: it holds deliberately pessimistic per-image assumptions (higher than any published
 * gpt-image price the author knows of), so the internal counter over-estimates spend. The CI probe
 * tries to fetch the official pricing page and records what it finds in reports/probe.json; replace
 * these values and set verified=true once confirmed. The OpenAI project spend limit remains the
 * real hard stop — this counter does not replace it.
 */
export const DEFAULT_PRICING = {
  verified: false,
  note: 'Pessimistic assumptions pending confirmation against https://developers.openai.com/api/docs/pricing',
  perImageUsd: {
    high: { '1024x1024': 0.4, '1536x1024': 0.6, '1024x1536': 0.6 },
    medium: { '1024x1024': 0.15, '1536x1024': 0.22, '1024x1536': 0.22 },
    low: { '1024x1024': 0.05, '1536x1024': 0.08, '1024x1536': 0.08 },
  },
  /** Optional token prices (USD per 1M tokens) to compute actual cost from `usage` when verified. */
  tokens: null,
};

export function loadPricing() {
  try {
    return { ...DEFAULT_PRICING, ...JSON.parse(fs.readFileSync(PATHS.pricing, 'utf8')) };
  } catch {
    return DEFAULT_PRICING;
  }
}

export function estimateUsd(pricing, quality, size) {
  const q = pricing.perImageUsd[quality] ?? pricing.perImageUsd.high;
  return q[size] ?? Math.max(...Object.values(q));
}

/** Actual cost from the API's usage object when token prices are known (else null). */
export function actualUsd(pricing, usage, model) {
  const t = pricing.tokens?.[model];
  if (!t || !usage || typeof usage.output_tokens !== 'number') return null;
  const inText = usage.input_tokens_details?.text_tokens ?? usage.input_tokens ?? 0;
  const inImage = usage.input_tokens_details?.image_tokens ?? 0;
  return +((inText * t.textInput + inImage * t.imageInput + usage.output_tokens * t.imageOutput) / 1e6).toFixed(6);
}

/** Spend of one ledger entry: the real cost when known, otherwise the (upper-bound) estimate. */
export const entryUsd = (e) => (typeof e.actualUsd === 'number' ? e.actualUsd : (e.estimatedUsd ?? 0));

const EMPTY = { approvedTotalUsd: APPROVED_TOTAL_USD, spentEstimatedUsd: 0, spentActualUsd: 0, images: 0, executedRequests: [], entries: [] };

/** Persistent ledger (committed to the repo after every run, so runs never reset the spend). */
export function loadLedger() {
  try {
    return { ...EMPTY, ...JSON.parse(fs.readFileSync(PATHS.ledger, 'utf8')) };
  } catch {
    return structuredClone(EMPTY);
  }
}
export function saveLedger(l) {
  fs.writeFileSync(PATHS.ledger, `${JSON.stringify(l, null, 2)}\n`);
}
/** Total spend counted against the budget (actual where known, estimate otherwise). */
export function spentUsd(l) {
  return +l.entries.reduce((t, e) => t + entryUsd(e), 0).toFixed(6);
}
export function remainingUsd(l) {
  return Math.max(0, l.approvedTotalUsd - spentUsd(l));
}
