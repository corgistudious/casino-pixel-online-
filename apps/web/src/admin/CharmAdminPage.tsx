import type { CharmEventView, StaffGiftTxView } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminApi, newIdempotencyKey } from '../net/adminApi';
import { CharmIcon } from '../ui/AppShell';
import { Button } from '../ui/Button';
import { Panel, Table } from './parts';
import { useAdminKit } from './useAdmin';

interface StaffCharm {
  uid: number;
  displayName: string;
  charm: number;
  events: CharmEventView[];
  transactions: StaffGiftTxView[];
}

/** Admin → Charm Points: look a player up, see the history and related gifts, adjust with a reason. */
export function CharmAdminPage() {
  const { t, fmt, can, fail, done, date } = useAdminKit();
  const params = useParams();
  const [uid, setUid] = useState(params.uid ?? '');
  const [view, setView] = useState<StaffCharm | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const lookup = (u = uid) => {
    const n = Number(u);
    if (!Number.isInteger(n) || n < 1) return;
    void adminApi<StaffCharm>(`/api/admin/charm/${n}`).then(setView, fail);
  };
  useEffect(() => void (params.uid && lookup(params.uid)), [params.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = Number(delta);
  const submit = () => {
    if (!view) return;
    void adminApi(`/api/admin/charm/${view.uid}`, { method: 'POST', body: { delta: n, reason, idempotencyKey: newIdempotencyKey() } }).then(() => {
      done();
      setDelta('');
      setReason('');
      lookup(String(view.uid));
    }, fail);
  };
  return (
    <>
      <h1 className="font-display text-2xl">{t('admin.charm.title')}</h1>
      <Panel>
        <p className="text-xs text-white/55">{t('admin.charm.hint')}</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            lookup();
          }}
        >
          <input className="field max-w-[12rem]" inputMode="numeric" placeholder="UID" value={uid} onChange={(e) => setUid(e.target.value.replace(/\D/g, ''))} />
          <Button type="submit">{t('admin.vip.find')}</Button>
        </form>
        {view && (
          <>
            <div className="flex items-center gap-3 rounded-xl bg-black/25 p-3">
              <CharmIcon size={32} />
              <div>
                <div className="font-strong">
                  {view.displayName} <span className="text-white/45">· UID {view.uid}</span>
                </div>
                <div className="text-lg tabular-nums text-pink-100">{fmt(view.charm)}</div>
              </div>
            </div>
            {can('charm.manage') ? (
              <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
                <input className="field" inputMode="numeric" placeholder="+100 / -50" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ''))} aria-label={t('admin.charm.delta')} />
                <input className="field" maxLength={500} placeholder={t('admin.vip.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button variant="gold" disabled={!Number.isInteger(n) || n === 0 || reason.trim().length < 3} onClick={submit}>
                  {t('admin.vip.apply')}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-white/50">{t('admin.charm.noManage')}</p>
            )}
            <h3 className="text-sm text-white/70">{t('admin.charm.history')}</h3>
            <Table
              head={[t('admin.vip.when'), t('admin.charm.delta'), t('admin.charm.after'), t('admin.charm.reason'), t('admin.vip.by')]}
              rows={view.events.map((e) => [
                <span key="w" className="text-xs">{date(e.createdAt)}</span>,
                <span key="d" className={`tabular-nums ${e.delta > 0 ? 'text-emerald-300' : 'text-ruby-200'}`}>
                  {e.delta > 0 ? '+' : ''}
                  {fmt(e.delta)}
                </span>,
                <span key="a" className="tabular-nums">{fmt(e.totalAfter)}</span>,
                <span key="r" className="text-xs">
                  {t(`admin.charm.reasons.${e.reason}`)}
                  {e.note && ` · ${e.note}`}
                </span>,
                <span key="b" className="text-xs">{e.actor ? `${e.actor.displayName} (UID ${e.actor.uid})` : '—'}</span>,
              ])}
            />
            <h3 className="text-sm text-white/70">{t('admin.charm.gifts')}</h3>
            <Table
              head={[t('admin.vip.when'), t('admin.gifts.from'), t('admin.gifts.to'), t('admin.gifts.gift'), t('admin.gifts.charm'), t('admin.gifts.state')]}
              rows={view.transactions.map((r) => [
                <span key="w" className="text-xs">{date(r.createdAt)}</span>,
                <span key="f" className="text-xs">
                  {r.sender.displayName} (UID {r.sender.uid}){r.anonymous ? ` · ${t('admin.gifts.anon')}` : ''}
                </span>,
                <span key="t" className="text-xs">{r.receiver.displayName} (UID {r.receiver.uid})</span>,
                <span key="g" className="text-xs">
                  {r.gift.icon} {r.gift.name.vi} ×{r.quantity}
                </span>,
                <span key="c" className="text-xs tabular-nums">+{fmt(r.charm)}</span>,
                <span key="s" className="text-xs">{r.status === 'reversed' ? t('admin.gifts.reversed') : 'OK'}</span>,
              ])}
            />
          </>
        )}
      </Panel>
    </>
  );
}
