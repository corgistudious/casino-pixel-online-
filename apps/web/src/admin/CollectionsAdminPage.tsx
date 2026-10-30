import { type CollectionView } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ItemThumb } from '../cosmetics/ItemPreview';
import { adminApi } from '../net/adminApi';
import { useCatalog } from '../store/catalog';
import { Button } from '../ui/Button';
import { Empty, Panel, Pill } from './parts';
import { useAdminKit } from './useAdmin';

/**
 * Seasonal collections: dates, timezone, per-item price and currency, Owner approval, early end and
 * yearly rerun. The server re-checks every rule (Owner-only approval, no role items, one sale window
 * per item); every change lands in the audit log.
 */
type Offer = CollectionView['items'][number];
interface Draft {
  nameVi: string;
  nameEn: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  items: Offer[];
}

/** ISO ↔ <input type="datetime-local"> in the browser's local time. */
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => new Date(v).toISOString();

const TONE = { draft: 'muted', scheduled: 'cyan', active: 'emerald', ended: 'ruby' } as const;

export function CollectionsAdminPage() {
  const { t, can, date, fail, done } = useAdminKit();
  const { i18n } = useTranslation();
  const catalog = useCatalog((c) => c.items);
  const [rows, setRows] = useState<CollectionView[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const manage = can('items.manage');
  const lang = i18n.language === 'en' ? 'en' : 'vi';

  const load = () => adminApi<{ collections: CollectionView[] }>('/api/admin/collections').then((r) => setRows(r.collections), fail);
  useEffect(() => {
    void load();
  }, []);

  const edit = (c: CollectionView) => {
    setOpen(c.id);
    setDraft({ nameVi: c.name.vi, nameEn: c.name.en, startsAt: toLocal(c.startsAt), endsAt: toLocal(c.endsAt), timezone: c.timezone, items: c.items.map((i) => ({ ...i })) });
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      done();
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const save = (c: CollectionView) =>
    draft &&
    run(() =>
      adminApi(`/api/admin/collections/${c.id}`, {
        method: 'PUT',
        body: {
          theme: c.theme,
          year: c.year,
          nameVi: draft.nameVi,
          nameEn: draft.nameEn,
          descVi: c.description?.vi ?? null,
          descEn: c.description?.en ?? null,
          startsAt: fromLocal(draft.startsAt),
          endsAt: fromLocal(draft.endsAt),
          timezone: draft.timezone,
          items: draft.items,
        },
      }),
    );

  const approve = (c: CollectionView) => window.confirm(t('admin.collections.approveConfirm', { name: c.name[lang] })) && run(() => adminApi(`/api/admin/collections/${c.id}/approve`, { method: 'POST' }));
  const end = (c: CollectionView) => window.confirm(t('admin.collections.endConfirm', { name: c.name[lang] })) && run(() => adminApi(`/api/admin/collections/${c.id}/end`, { method: 'POST' }));
  const rerun = (c: CollectionView) => {
    const year = c.year + 1;
    const shift = (iso: string) => {
      const d = new Date(iso);
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      return d.toISOString();
    };
    if (!window.confirm(t('admin.collections.rerunConfirm', { id: `${c.theme}_${year}` }))) return;
    void run(() => adminApi(`/api/admin/collections/${c.id}/rerun`, { method: 'POST', body: { id: `${c.theme}_${year}`, year, startsAt: shift(c.startsAt), endsAt: shift(c.endsAt) } }));
  };

  if (!rows) return <Panel title={t('admin.nav.collections')}><Empty>{t('common.loading')}</Empty></Panel>;
  return (
    <Panel title={t('admin.nav.collections')}>
      <p className="text-xs text-white/55">{t('admin.collections.hint')}</p>
      {!rows.length && <Empty />}
      <ul className="flex flex-col gap-2">
        {rows.map((c) => {
          const editing = open === c.id && draft;
          return (
            <li key={c.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-white/90">{c.name[lang]}</strong>
                <span className="text-xs text-white/45">{c.id} · {t(`market.themes.${c.theme}`, { defaultValue: c.theme })}</span>
                <Pill tone={TONE[c.status]}>{t(`market.status.${c.status}`)}</Pill>
                {c.rerunOf && <Pill>{t('admin.collections.rerunOf', { id: c.rerunOf })}</Pill>}
                <span className="ml-auto text-xs text-white/55">{date(c.startsAt)} → {date(c.endsAt)} ({c.timezone})</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {c.items.map((o) => {
                  const item = catalog[o.itemId];
                  return (
                    <span key={o.itemId} className="flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1 text-xs text-white/75">
                      {item && <ItemThumb itemId={o.itemId} kind={item.kind} item={item} size={28} />}
                      <span>{item?.name[lang] ?? o.itemId}</span>
                      <span className="text-gold-100">{o.price.toLocaleString()} {t(`admin.collections.currency.${o.currency}`)}</span>
                    </span>
                  );
                })}
              </div>
              {manage && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.status !== 'ended' && <Button size="sm" variant="glass" disabled={busy} onClick={() => (editing ? setOpen(null) : edit(c))}>{editing ? t('market.close') : t('admin.collections.edit')}</Button>}
                  {c.status === 'draft' && <Button size="sm" variant="gold" disabled={busy} onClick={() => void approve(c)}>{t('admin.collections.approve')}</Button>}
                  {(c.status === 'active' || c.status === 'scheduled') && <Button size="sm" variant="glass" disabled={busy} onClick={() => void end(c)}>{t('admin.collections.end')}</Button>}
                  <Button size="sm" variant="glass" disabled={busy} onClick={() => rerun(c)}>{t('admin.collections.rerun')}</Button>
                </div>
              )}
              {editing && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-white/60">{t('admin.collections.nameVi')}<input className="field" value={draft.nameVi} onChange={(e) => setDraft({ ...draft, nameVi: e.target.value })} /></label>
                  <label className="flex flex-col gap-1 text-xs text-white/60">{t('admin.collections.nameEn')}<input className="field" value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} /></label>
                  <label className="flex flex-col gap-1 text-xs text-white/60">{t('admin.collections.startsAt')}<input type="datetime-local" className="field" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} /></label>
                  <label className="flex flex-col gap-1 text-xs text-white/60">{t('admin.collections.endsAt')}<input type="datetime-local" className="field" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} /></label>
                  <label className="flex flex-col gap-1 text-xs text-white/60">{t('admin.collections.timezone')}<input className="field" value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} /></label>
                  <p className="self-end text-[11px] text-white/45">{t('admin.collections.localTime')}</p>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    {draft.items.map((o, idx) => {
                      const item = catalog[o.itemId];
                      const set = (patch: Partial<Offer>) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === idx ? { ...x, ...patch } : x)) });
                      return (
                        <div key={o.itemId} className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                          <span className="min-w-40 flex-1">{item?.name[lang] ?? o.itemId}</span>
                          <input type="number" min={0} className="field w-28" value={o.price} onChange={(e) => set({ price: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} aria-label={t('admin.collections.price')} />
                          <select className="field w-24" value={o.currency} onChange={(e) => set({ currency: e.target.value as Offer['currency'] })} aria-label={t('admin.collections.currencyLabel')}>
                            <option value="silver">{t('admin.collections.currency.silver')}</option>
                            <option value="gold">{t('admin.collections.currency.gold')}</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  <div className="sm:col-span-2">
                    <Button size="sm" disabled={busy} onClick={() => void save(c)}>{t('admin.collections.save')}</Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
