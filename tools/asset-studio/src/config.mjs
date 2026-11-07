import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Repository paths (the tool lives in tools/asset-studio). */
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
/** Studio data directory (KEYO_STUDIO_DIR overrides it for isolated tests). */
export const STUDIO = process.env.KEYO_STUDIO_DIR ?? path.join(REPO, 'assets/studio');
export const PATHS = {
  repo: REPO,
  manifest: path.join(STUDIO, 'manifest.json'),
  ledger: path.join(STUDIO, 'budget-ledger.json'),
  pricing: path.join(STUDIO, 'pricing.json'),
  requests: path.join(STUDIO, 'requests'),
  generated: path.join(STUDIO, 'generated'),
  previews: path.join(STUDIO, 'previews'),
  reports: path.join(STUDIO, 'reports'),
  docs: path.join(REPO, 'docs/asset-studio'),
};

/**
 * Image model policy. Verified against the official OpenAI SDK typings (openai@7.53.0,
 * resources/images.d.ts): `gpt-image-1` was shut down on 2026-10-23; the SDK names
 * `gpt-image-2.5-sunburst` / `gpt-image-2.5-flare` as its replacements, both supporting
 * transparent backgrounds (png/webp) and quality low…max. The CI probe re-checks which of these
 * the API key can actually use (models.list) before anything is spent.
 */
export const MODEL_PREFERENCE = ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-2', 'gpt-image-1.5'];
export const RETIRED_MODELS = ['gpt-image-1', 'dall-e-2', 'dall-e-3'];
/** Quality for production art. 'high' is the top tier common to every GPT image model. */
export const DEFAULT_QUALITY = 'high';
export const STANDARD_SIZES = ['1024x1024', '1536x1024', '1024x1536'];

/** The budget the user approved for the first wave (USD). Raised only by an explicit user request. */
export const APPROVED_TOTAL_USD = 20;

/** Delivery limits of the game's asset upload (packages/shared/src/cosmetics.ts). */
export const DELIVERY = { maxSide: 1024, maxBytes: 1_048_576 };

export const STATUSES = [
  'EXISTING_APPROVED', 'PLANNED', 'GENERATING', 'GENERATED', 'TECHNICALLY_VALIDATED', 'NEEDS_REVIEW',
  'NEEDS_REVISION', 'REJECTED', 'USER_APPROVED', 'INTEGRATED',
];
/** Statuses the tool may set by itself. USER_APPROVED / INTEGRATED are set only by the user. */
export const TOOL_STATUSES = ['PLANNED', 'GENERATING', 'GENERATED', 'TECHNICALLY_VALIDATED', 'NEEDS_REVIEW', 'NEEDS_REVISION'];
