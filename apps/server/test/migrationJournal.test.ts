import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the migration history against the database Production actually has. Production applied
 * 0036_fix_dual_owner (on the server, created_at 1793051955930); Drizzle runs every journal entry
 * newer than the last applied created_at, so the order and timestamps here decide what an upgrade runs.
 */
const dir = resolve(__dirname, '../drizzle');
const journal = JSON.parse(readFileSync(resolve(dir, 'meta/_journal.json'), 'utf8')) as { entries: { idx: number; when: number; tag: string }[] };
const PROD_0036 = { tag: '0036_fix_dual_owner', when: 1793051955930, sha256: '76939175bf523aa64433cd76b45682300a3838b1e8a1a1947df6a9c0a5cccc92' };

describe('migration journal', () => {
  it('entries are ordered: increasing idx and timestamps, every file present, no two migrations share a number', () => {
    const e = journal.entries;
    for (let i = 1; i < e.length; i++) {
      expect(e[i]!.idx, e[i]!.tag).toBeGreaterThan(e[i - 1]!.idx);
      expect(e[i]!.when, e[i]!.tag).toBeGreaterThan(e[i - 1]!.when);
    }
    for (const { tag } of e) expect(existsSync(resolve(dir, `${tag}.sql`)), tag).toBe(true);
    const numbers = e.map((x) => x.tag.slice(0, 4));
    expect(new Set(numbers).size).toBe(numbers.length);
    // Every .sql in the folder is in the journal (a stray file would never run).
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, ''));
    expect(files.sort()).toEqual(e.map((x) => x.tag).sort());
  });

  it('migrations after Production\'s 0036_fix_dual_owner sort after it, so an upgrade applies them', () => {
    const later = journal.entries.filter((x) => Number(x.tag.slice(0, 4)) >= 37);
    expect(later.map((x) => x.tag)).toContain('0037_account_name_sync');
    for (const x of later) expect(x.when, x.tag).toBeGreaterThan(PROD_0036.when);
    // Nothing else may take number 0036: that number belongs to the Production hotfix.
    for (const x of journal.entries.filter((y) => y.tag.startsWith('0036'))) expect(x.tag).toBe(PROD_0036.tag);
  });

  it('0036_fix_dual_owner, once added, is byte-identical to what Production ran (hash and timestamp)', () => {
    const entry = journal.entries.find((x) => x.tag === PROD_0036.tag);
    const path = resolve(dir, `${PROD_0036.tag}.sql`);
    if (!entry && !existsSync(path)) return; // not in the repository yet
    expect(entry, 'journal entry').toMatchObject({ idx: 36, when: PROD_0036.when });
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(PROD_0036.sha256);
  });
});
