/**
 * Integration Mapping Report (no paid call). Inputs:
 *  - apps/web/src/assets/keyo/integration.json — per asset: INTEGRATED (+ where) or
 *    READY_FOR_FUTURE_USE (+ why), and the wave (library = the 252-asset production, sample = the
 *    18 earlier owner-approved samples);
 *  - apps/web/e2e/out/assets-verified.json (optional) — studio files the browser really fetched per
 *    screen in the asset e2e suite. An INTEGRATED asset seen there becomes VERIFIED.
 * Writes the statuses back to integration.json and docs/asset-studio/INTEGRATION.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './config.mjs';
import { REGISTRY_FILE } from './export-web.mjs';

const INTEGRATION = path.join(PATHS.repo, 'apps/web/src/assets/keyo/integration.json');
const VERIFIED = path.join(PATHS.repo, 'apps/web/e2e/out/assets-verified.json');

export function integrationReport({ log = console.log } = {}) {
  const data = JSON.parse(fs.readFileSync(INTEGRATION, 'utf8'));
  const seen = fs.existsSync(VERIFIED) ? JSON.parse(fs.readFileSync(VERIFIED, 'utf8')) : null;
  const reg = fs.readFileSync(REGISTRY_FILE, 'utf8');
  const files = Object.fromEntries([...reg.matchAll(/^ {2}'([^']+)':.*files: \{ ([^}]*) \} \},$/gm)].map((m) => [m[1], [...m[2].matchAll(/'([^']+)'/g)].map((f) => f[1])]));
  for (const [id, e] of Object.entries(data)) {
    if (e.status === 'READY_FOR_FUTURE_USE') continue;
    const screens = seen?.verified?.[id];
    if (screens) {
      e.status = 'VERIFIED';
      e.verifiedOn = screens;
    } else if (seen) {
      e.status = 'INTEGRATED';
      delete e.verifiedOn;
    }
    if (!files[id]) e.status = 'MISSING';
  }
  fs.writeFileSync(INTEGRATION, `${JSON.stringify(data, null, 1)}\n`);

  const count = (wave, st) => Object.values(data).filter((e) => (!wave || e.wave === wave) && (!st || e.status === st)).length;
  const groups = {};
  for (const [id, e] of Object.entries(data)) (groups[id.split('.')[0]] ??= []).push([id, e]);
  const lines = [
    '# Integration Mapping Report — Keyo Asset Studio → Keyo Game',
    '',
    `Generated: ${new Date().toISOString()} · Branch feat/hd-game-ui · Source: \`apps/web/src/assets/keyo/integration.json\``,
    seen ? `Browser check: ${seen.at} (${seen.url}, Chromium emulation — not a real device)` : 'Browser check: not run (no apps/web/e2e/out/assets-verified.json)',
    '',
    '## Totals',
    '',
    '| | Library (252) | Earlier samples (18) | All (270) |',
    '|---|---|---|---|',
    ...['VERIFIED', 'INTEGRATED', 'READY_FOR_FUTURE_USE', 'MISSING', 'FAILED'].map((st) => `| ${st} | ${count('library', st)} | ${count('sample', st)} | ${count(null, st)} |`),
    `| **Total** | **${count('library')}** | **${count('sample')}** | **${count(null)}** |`,
    '',
    '- **VERIFIED**: integrated, and the browser check saw the file load on a real screen of the app.',
    '- **INTEGRATED**: wired into an existing feature (code path, typecheck and unit tests), but the preview build has no data that shows it (e.g. a frame nobody in the demo owns).',
    '- **READY_FOR_FUTURE_USE**: in the registry and deployed, but no existing feature uses it; the reason is given. Not counted as shown in the game.',
    '',
    '## Per asset',
    '',
  ];
  for (const [g, rows] of Object.entries(groups).sort()) {
    lines.push(`### ${g} (${rows.length})`, '', '| Asset | Wave | Status | Where / why | Files |', '|---|---|---|---|---|');
    for (const [id, e] of rows.sort()) {
      const where = e.status === 'READY_FOR_FUTURE_USE' ? e.why : `${e.where}${e.verifiedOn ? ` — seen on: ${e.verifiedOn.join(', ')}` : ''}`;
      lines.push(`| \`${id}\` | ${e.wave} | ${e.status} | ${where.replace(/\|/g, '/')} | ${(files[id] ?? []).map((f) => f.split('.').slice(-3, -2)[0] ?? '').length} sizes |`);
    }
    lines.push('');
  }
  lines.push('## File paths', '', 'All files: `apps/web/public/assets/keyo/<group>/<id>.<size>.<hash>.webp` (served as `assets/keyo/…`). Full list per asset: `apps/web/src/assets/keyo/registry.generated.ts`.', '');
  const out = path.join(PATHS.docs, 'INTEGRATION.md');
  fs.writeFileSync(out, lines.join('\n'));
  log(`integration report: ${count(null, 'VERIFIED')} verified, ${count(null, 'INTEGRATED')} integrated, ${count(null, 'READY_FOR_FUTURE_USE')} ready-for-future-use, ${count(null, 'MISSING')} missing → ${path.relative(PATHS.repo, out)}`);
  return data;
}
