import { REPORT_STATUSES, type ReportAttachmentView, type ReportStatus, type StaffReportView } from '@casino/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiBlob } from '../net/api';
import { adminApi } from '../net/adminApi';
import { Button } from '../ui/Button';
import { Panel } from './parts';
import { useAdminKit } from './useAdmin';

/** Moderation queue for player reports (reports.manage). Decisions are audited; nothing is automatic. */
export function ReportsAdminPage() {
  const { t, date, fail } = useAdminKit();
  const [status, setStatus] = useState<ReportStatus | ''>('pending');
  const [rows, setRows] = useState<StaffReportView[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = () => {
    const q = status ? `?status=${status}` : '';
    void adminApi<{ reports: StaffReportView[] }>(`/api/admin/reports${q}`).then((r) => setRows(r.reports), fail);
  };
  useEffect(load, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = (id: string, next: 'reviewing' | 'resolved' | 'rejected') =>
    void adminApi(`/api/admin/reports/${id}`, { method: 'POST', body: { status: next, ...(notes[id]?.trim() ? { resolution: notes[id]!.trim() } : {}) } }).then(load, fail);

  return (
    <div className="flex flex-col gap-4">
      <Panel title={t('admin.reports.title')}>
        <p className="text-xs text-white/55">{t('admin.reports.intro')}</p>
        <div className="flex flex-wrap gap-2">
          {(['', ...REPORT_STATUSES] as const).map((s) => (
            <button key={s || 'all'} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1 text-xs ${status === s ? 'border-gold-300/70 bg-gold-300/15 text-gold-100' : 'border-white/10 text-white/70 hover:bg-white/10'}`}>
              {s ? t(`people.reportDialog.statuses.${s}`) : t('admin.reports.filterAll')}
            </button>
          ))}
        </div>
      </Panel>
      {rows === null && <p className="text-sm text-white/50">{t('app.loading')}</p>}
      {rows?.length === 0 && <p className="glass p-4 text-sm text-white/55">{t('admin.reports.empty')}</p>}
      {rows?.map((r) => (
        <Panel key={r.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-ruby-500/15 px-2 py-0.5 text-xs text-ruby-100">{t(`people.reportDialog.categories.${r.category}`)}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/75">{t(`people.reportDialog.statuses.${r.status}`)}</span>
              <span className="text-xs text-white/45">{date(r.createdAt)}</span>
            </div>
            {r.context && <span className="font-mono text-[11px] text-white/45">{r.context}</span>}
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-white/45">{t('admin.reports.target')}: </span>
              <Link className="font-strong text-white underline-offset-2 hover:underline" to={`/admin/players/${r.target.uid}`}>
                {r.target.displayName} (UID {r.target.uid})
              </Link>
              <span className="text-xs text-white/45"> · {r.target.status}</span>
              {r.targetOpen > 1 && <div className="text-xs text-amber-200">{t('admin.reports.openAgainst', { n: r.targetOpen })}</div>}
            </div>
            <div>
              <span className="text-white/45">{t('admin.reports.reporter')}: </span>
              <Link className="text-white/85 underline-offset-2 hover:underline" to={`/admin/players/${r.reporter.uid}`}>
                {r.reporter.displayName} (UID {r.reporter.uid})
              </Link>
            </div>
          </div>
          <p className="whitespace-pre-wrap rounded-xl bg-black/25 p-3 text-sm text-white/85">{r.description}</p>
          {r.attachments.length > 0 && (
            <div>
              <div className="mb-1 text-xs text-white/55">{t('admin.reports.attachments')}</div>
              <div className="flex flex-wrap gap-2">
                {r.attachments.map((a) => (
                  <Evidence key={a.id} reportId={r.id} a={a} />
                ))}
              </div>
            </div>
          )}
          {r.handledBy && <p className="text-xs text-white/50">{t('admin.reports.handledBy', { name: `${r.handledBy.displayName} (UID ${r.handledBy.uid})` })}</p>}
          {r.resolution && <p className="text-xs text-white/70">{t('admin.reports.resolution')}: {r.resolution}</p>}
          {(r.status === 'pending' || r.status === 'reviewing') && (
            <div className="flex flex-col gap-2">
              <input className="field" placeholder={t('admin.reports.resolution')} maxLength={1000} value={notes[r.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
              <div className="flex flex-wrap gap-2">
                {r.status === 'pending' && (
                  <Button size="sm" onClick={() => move(r.id, 'reviewing')}>
                    {t('admin.reports.review')}
                  </Button>
                )}
                <Button size="sm" variant="emerald" onClick={() => move(r.id, 'resolved')}>
                  {t('admin.reports.resolve')}
                </Button>
                <Button size="sm" variant="ruby" onClick={() => move(r.id, 'rejected')}>
                  {t('admin.reports.reject')}
                </Button>
              </div>
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}

/** A staff-only evidence image, fetched with the session token and shown from a local object URL. */
function Evidence({ reportId, a }: { reportId: string; a: ReportAttachmentView }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    void apiBlob(`/api/admin/reports/${reportId}/attachments/${a.id}`).then((b) => setUrl((made = URL.createObjectURL(b))), () => setUrl(null));
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [reportId, a.id]);
  if (!url) return <div className="h-24 w-24 animate-pulse rounded-lg bg-white/5" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={`${a.width}×${a.height} · ${Math.round(a.size / 1024)} KB`}>
      <img src={url} alt="" className="h-24 w-24 rounded-lg object-cover ring-1 ring-white/15 hover:ring-gold-300/60" />
    </a>
  );
}
