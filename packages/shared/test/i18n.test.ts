import { describe, expect, it } from 'vitest';
import { translations } from '../src';

function flatten(obj: object, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else Object.assign(out, flatten(v as object, key));
  }
  return out;
}

describe('i18n', () => {
  const en = flatten(translations.en);
  const vi = flatten(translations.vi);

  it('vi and en have identical keys', () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
  });

  it('no empty strings and same interpolation variables', () => {
    for (const key of Object.keys(en)) {
      expect(en[key]!.length, key).toBeGreaterThan(0);
      expect(vi[key]!.length, key).toBeGreaterThan(0);
      const vars = (s: string) => (s.match(/{{\s*\w+\s*}}/g) ?? []).sort();
      expect(vars(vi[key]!), key).toEqual(vars(en[key]!));
    }
  });
});
