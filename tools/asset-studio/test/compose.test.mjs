import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WHEEL_ORDER, colorOf, ringSvg } from '../src/compose/roulette.mjs';

// The composite must match the game exactly: same order and colours as packages/shared.
const shared = fs.readFileSync(fileURLToPath(new URL('../../../packages/shared/src/games/roulette.ts', import.meta.url)), 'utf8');

test('pocket order equals ROULETTE_WHEEL in packages/shared', () => {
  const m = /export const ROULETTE_WHEEL[^=]*=\s*\[([\s\S]*?)\];/.exec(shared);
  assert.ok(m, 'ROULETTE_WHEEL found');
  assert.deepEqual(WHEEL_ORDER, m[1].split(',').map((s) => s.trim()).filter(Boolean).map(Number));
  assert.equal(WHEEL_ORDER.length, 37);
  assert.deepEqual([...WHEEL_ORDER].sort((a, b) => a - b), Array.from({ length: 37 }, (_, i) => i));
});

test('colours: 0 green, 18 red, 18 black, strictly alternating around the wheel', () => {
  const cols = WHEEL_ORDER.map(colorOf);
  assert.equal(cols.filter((c) => c === 'green').length, 1);
  assert.equal(cols.filter((c) => c === 'red').length, 18);
  assert.equal(cols.filter((c) => c === 'black').length, 18);
  for (let i = 1; i < 36; i++) assert.notEqual(cols[i], cols[i + 1], `pockets ${i} and ${i + 1}`);
  const redSet = /ROULETTE_RED = new Set\(\[([^\]]+)\]/.exec(shared);
  if (redSet) for (const n of redSet[1].split(',').map((s) => Number(s.trim()))) assert.equal(colorOf(n), 'red', `${n}`);
});

test('the ring has 37 pockets and 37 numbers', () => {
  const svg = ringSvg();
  assert.equal((svg.match(/<path /g) ?? []).length, 37);
  assert.equal((svg.match(/<text /g) ?? []).length, 37);
});
