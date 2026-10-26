import { useEffect, useState, type FormEvent } from 'react';
import { adminApi } from '../net/adminApi';
import { Button } from '../ui/Button';
import { Panel, Table } from './parts';
import { useAdminKit } from './useAdmin';

interface Entry {
  id: number;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: unknown;
  ip: string | null;
  createdAt: string;
  actorUid: number | null;
  actorName: string | null;
}

const PAGE = 50;
const EMPTY = { action: '', actor: '', target: '', from: '', to: '' };

export function AuditPage() {
  const { t, date, fail } = useAdminKit();
  const [filters, setFilters] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [rows, setRows] = useState<Entry[]>([]);
  const [more, setMore] = useState(false);

  const load = (f: typeof EMPTY, offset: number) => {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (f.action) p.set('action', f.action);
    if (f.actor) p.set('actor', f.actor);
    if (f.target) p.set('target', f.target);
    if (f.from) p.set('from', new Date(f.from).toISOString());
    if (f.to) p.set('to', new Date(f.to).toISOString());
    void adminApi<{ entries: Entry[] }>(`/api/admin/audit/search?${p}`).then((r) => {
      setRows((prev) => (offset ? [...prev, ...r.entries] : r.entries));
      setMore(r.entries.length === PAGE);
    }, fail);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(EMPTY, 0), []);
  const apply = (e: FormEvent) => {
    e.preventDefault();
    setApplied(filters);
    load(filters, 0);
  };
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <>
      <h1 className="font-display text-2xl">{t('admin.nav.audit')}</h1>
      <Panel>
        <form onSubmit={apply} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <input className="field lg:col-span-2" placeholder={t('admin.filters.action')} value={filters.action} onChange={set('action')} aria-label={t('admin.filters.action')} />
          <input className="field" placeholder={t('admin.filters.actor')} inputMode="numeric" value={filters.actor} onChange={set('actor')} aria-label={t('admin.filters.actor')} />
          <input className="field" placeholder={t('admin.filters.target')} value={filters.target} onChange={set('target')} aria-label={t('admin.filters.target')} />
          <input className="field" type="datetime-local" value={filters.from} onChange={set('from')} aria-label={t('admin.filters.from')} title={t('admin.filters.from')} />
          <input className="field" type="datetime-local" value={filters.to} onChange={set('to')} aria-label={t('admin.filters.to')} title={t('admin.filters.to')} />
          <div className="flex gap-2 lg:col-span-6">
            <Button type="submit" variant="gold">
              {t('admin.filters.apply')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setFilters(EMPTY);
                setApplied(EMPTY);
                load(EMPTY, 0);
              }}
            >
              {t('admin.filters.clear')}
            </Button>
          </div>
        </form>
      </Panel>
      <Panel>
        <Table
          head={[t('admin.fields.time'), t('admin.fields.action'), t('admin.fields.actor'), t('admin.fields.target'), t('admin.fields.details'), t('admin.fields.ip')]}
          rows={rows.map((r) => [
            date(r.createdAt),
            <code key="a" className="text-xs text-gold-100">{r.action}</code>,
            r.actorUid ? `#${r.actorUid} ${r.actorName}` : '—',
            r.targetType ? `${r.targetType}:${r.targetId}` : '—',
            r.details ? <code key="d" className="block max-w-xs whitespace-pre-wrap break-all text-[11px] text-white/60">{JSON.stringify(r.details)}</code> : '—',
            r.ip ?? '—',
          ])}
        />
        {more && (
          <Button size="sm" onClick={() => load(applied, rows.length)}>
            {t('admin.loadMore')}
          </Button>
        )}
      </Panel>
    </>
  );
}
