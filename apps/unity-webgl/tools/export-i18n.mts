/**
 * Exports the VI/EN translations of the React app (packages/shared/src/i18n — the single source)
 * to Assets/KeyoGame/Localization/Resources/keyo-i18n.json for the Unity Localizer.
 *   packages/shared/node_modules/.bin/tsx apps/unity-webgl/tools/export-i18n.mts [--check]
 * --check exits 1 when the committed JSON is out of date (used by CI).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translations } from '../../../packages/shared/src/i18n/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../Assets/KeyoGame/Localization/Resources/keyo-i18n.json');
const json = JSON.stringify({ vi: translations.vi, en: translations.en }, null, 1) + '\n';

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {
    /* missing */
  }
  if (current !== json) {
    console.error('keyo-i18n.json is out of date — run tools/export-i18n.mts');
    process.exit(1);
  }
  console.log('keyo-i18n.json up to date');
} else {
  writeFileSync(out, json);
  console.log(`wrote ${out} (${json.length} bytes)`);
}
