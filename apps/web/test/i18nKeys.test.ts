import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { translations } from '@casino/shared';

const { en, vi } = translations;
import { describe, expect, it } from 'vitest';

/** Every static t('a.b.c') key used by the web app must exist in both languages (a missing key renders as raw text). */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|ts)$/.test(f) ? [p] : [];
  });
}
const has = (obj: unknown, key: string) => key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj) !== undefined;

describe('i18n keys', () => {
  it('all static keys used in the web app exist in vi and en', () => {
    const missing: string[] = [];
    for (const f of files(join(__dirname, '../src'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\('([a-zA-Z][\w]*(?:\.[\w]+)+)'(\s*,\s*\{[^)]*defaultValue)?/g)) {
        if (m[2]) continue; // has an explicit fallback
        for (const [lang, res] of [['vi', vi], ['en', en]] as const) if (!has(res, m[1]!)) missing.push(`${lang}:${m[1]} (${f.split('/src/')[1]})`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});
