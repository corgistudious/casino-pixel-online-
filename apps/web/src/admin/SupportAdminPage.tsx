import type { StaffTicketView } from '@casino/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { adminApi } from '../net/adminApi';
import { StatusPill, TicketThread } from '../support/TicketThread';
import { Button } from '../ui/Button';
import { Panel } from './parts';
import { useAdminKit } from './useAdmin';

type Filter = 'all' | 'open' | 'in_progress' | 'closed' | 'mine';

/** Staff queue: filter, search, take a ticket and answer it (Support, Admin and above). */
export function SupportAdminPage() {
  const { t, can, date, fail, done } = useAdminKit();
  const [filter, setFilter] = useState<Filter>('open');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<StaffTicketView[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = (e?: FormEvent) => {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (filter === 'mine') params.set('mine', 'true');
    else if (filter !== 'all') params.set('status', filter);
    if (q.trim()) params.set('q', q.trim());
    void adminApi<{ tickets: StaffTicketView[] }>(`/api/admin/support/tickets?${params}`).then((r) => setRows(r.tickets), fail);
  };
  useEffect(() => load(), [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const assign = (id: string) =>
    void adminApi(`/api/admin/support/tickets/${id}/assign`, { method: 'POST' }).then(() => {
      done();
      load();
    }, fail);

  return (
    <>
      <h1 className="font-display text-2xl">{t('supportCenter.queue')}</h1>
      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Panel>
          <div className="flex flex-wrap gap-1">
            {(['open', 'in_progress', 'mine', 'closed', 'all'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 text-xs ${filter === f ? 'bg-gold-300/20 text-gold-100' : 'text-white/55 hover:bg-white/5'}`}>
                {t(`supportCenter.filters.${f}`)}
              </button>
            ))}
          </div>
          <form onSubmit={load} className="flex gap-2">
            <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('supportCenter.search')} aria-label={t('supportCenter.search')} />
            <Button type="submit">{t('admin.searchSubmit')}</Button>
          </form>
          <ul className="flex max-h-[65vh] flex-col gap-1 overflow-y-auto">
            {rows?.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpen(r.id)} className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left text-sm ${open === r.id ? 'bg-gold-300/10' : 'hover:bg-white/5'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-strong">{r.subject}</span>
                    {r.awaitingStaff && <span className="shrink-0 rounded bg-ruby-500/20 px-1.5 text-[10px] text-ruby-200">{t('supportCenter.awaiting')}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/50">
                    <StatusPill status={r.status} />
                    <span>{t(`supportCenter.categories.${r.category}`)}</span>
                    <span>
                      {t('supportCenter.player')}: #{r.player.uid} {r.player.displayName}
                    </span>
                    <span>
                      {t('supportCenter.assignee')}: {r.assignee ? r.assignee.displayName : '—'}
                    </span>
                    <span>{date(r.updatedAt)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          {open ? (
            <div className="flex h-[70vh] flex-col">
              {can('support.reply') && rows?.find((r) => r.id === open && !r.assignee) && (
                <div className="flex justify-end pb-2">
                  <Button size="sm" variant="gold" onClick={() => assign(open)}>
                    {t('supportCenter.assign')}
                  </Button>
                </div>
              )}
              <TicketThread key={open} id={open} onChanged={() => load()} />
            </div>
          ) : (
            <p className="text-white/50">{t('admin.selectPlayerHint')}</p>
          )}
        </Panel>
      </div>
    </>
  );
}
