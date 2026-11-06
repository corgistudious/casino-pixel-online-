/** Runs every V7.1 browser suite in sequence; exit code 1 when any fails. `node e2e/run.mjs [name…]` */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url));
const all = ['pwa', 'orientation', 'controls', 'dicetable', 'layout', 'pages'];
const pick = process.argv.slice(2).length ? process.argv.slice(2) : all;
let failed = 0;
for (const n of pick) {
  const r = spawnSync(process.execPath, [`${dir}${n}.e2e.mjs`], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed++;
}
console.log(failed ? `${failed} suite(s) failed` : 'all suites passed');
process.exit(failed ? 1 : 0);
