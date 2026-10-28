import { GIFT_CATEGORIES, GIFT_RARITIES, type GiftUpsertInput, type StaffGiftTxView, type StaffGiftView } from '@casino/shared';
import { useEffect, useState } from 'react';
import { adminApi, newIdempotencyKey } from '../net/adminApi';
import { GiftIcon } from '../players/GiftShopDialog';
import { Button } from '../ui/Button';
import { CurrencyIcon } from '../ui/OfficialAssets';
import { Panel, Pill, Table } from './parts';
import { useAdminKit } from './useAdmin';

const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

const toInput = (g: StaffGiftView): GiftUpsertInput => ({
  id: g.id,
  category: g.category,
  name: g.name,
  description: g.description,
  icon: g.icon,
  iconAsset: g.iconUrl ? g.iconUrl.split('/').pop()! : null,
  rarity: g.rarity,
  price: g.price,
  currency: g.currency,
  charm: g.charm,
  onSale: g.onSale,
  dailyLimit: g.dailyLimit,
  startsAt: g.startsAt,
  endsAt: g.endsAt,
  sort: g.sort,
});

/** Admin → Gifts: catalogue (prices apply to new purchases only), transactions and reversals. */
export function GiftsAdminPage() {
  const { t, fmt, can, fail, done, date } = useAdminKit();
  const [gifts, setGifts] = useState<StaffGiftView[] | null>(null);
  const [editing, setEditing] = useState<GiftUpsertInput | null>(null);
  const manage = can('gifts.manage');
  const load = () => void adminApi<{ gifts: StaffGiftView[] }>('/api/admin/gifts').then((r) => setGifts(r.gifts), fail);
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const importProposal = () => {
    if (!window.confirm(t('admin.gifts.importConfirm'))) return;
    void adminApi<{ added: number; gifts: StaffGiftView[] }>('/api/admin/gifts/import-proposal', { method: 'POST' }).then((r) => {
      setGifts(r.gifts);
      done();
    }, fail);
  };
  const toggleSale = (g: StaffGiftView) =>
    void adminApi<{ gifts: StaffGiftView[] }>(`/api/admin/gifts/${g.id}`, { method: 'PUT', body: { ...toInput(g), onSale: !g.onSale } }).then((r) => {
      setGifts(r.gifts);
      done();
    }, fail);

  return (
    <>
      <h1 className="font-display text-2xl">{t('admin.gifts.title')}</h1>
      <Panel
        title={t('admin.gifts.catalog')}
        actions={
          manage && (
            <div className="flex gap-2">
              <Button size="sm" onClick={importProposal}>
                {t('admin.gifts.import')}
              </Button>
              <Button
                size="sm"
                variant="gold"
                onClick={() =>
                  setEditing({ id: '', category: 'common', name: { vi: '', en: '' }, description: { vi: '', en: '' }, icon: '🎁', iconAsset: null, rarity: 'common', price: 1_000, currency: 'silver', charm: 10, onSale: false, dailyLimit: null, startsAt: null, endsAt: null, sort: 0 })
                }
              >
                + {t('admin.gifts.add')}
              </Button>
            </div>
          )
        }
      >
        <p className="text-xs text-white/55">{t('admin.gifts.hint')}</p>
        {gifts === null ? (
          <p className="text-white/50">{t('app.loading')}</p>
        ) : (
          <Table
            empty={t('admin.gifts.empty')}
            head={[t('admin.gifts.gift'), t('admin.gifts.category'), t('admin.gifts.price'), t('admin.gifts.charm'), t('admin.gifts.window'), t('admin.gifts.sent'), t('admin.gifts.state'), '']}
            rows={gifts.map((g) => [
              <span key="g" className="flex items-center gap-2">
                <GiftIcon gift={g} size={24} />
                <span>
                  {g.name.vi} <span className="text-white/45">/ {g.name.en}</span>
                  <span className="block text-[10px] text-white/40">{g.id} · {t(`rarity.${g.rarity}`)}</span>
                </span>
              </span>,
              t(`giftShop.categories.${g.category}`),
              <span key="p" className="inline-flex items-center gap-1 tabular-nums">
                <CurrencyIcon currency={g.currency} size={14} /> {fmt(g.price)}
              </span>,
              <span key="c" className="tabular-nums text-pink-200">+{fmt(g.charm)}</span>,
              <span key="w" className="text-[11px]">
                {g.startsAt || g.endsAt ? `${date(g.startsAt)} → ${date(g.endsAt)}` : '—'}
                {g.dailyLimit !== null && <span className="block text-white/45">{t('giftShop.dailyLimit', { n: g.dailyLimit })}</span>}
              </span>,
              <span key="s" className="tabular-nums">{fmt(g.sent)}</span>,
              g.available ? <Pill key="st" tone="emerald">{t('admin.gifts.onSale')}</Pill> : g.onSale ? <Pill key="st" tone="gold">{t('admin.gifts.scheduled')}</Pill> : <Pill key="st">{t('admin.gifts.offSale')}</Pill>,
              manage ? (
                <span key="a" className="flex gap-1">
                  <Button size="sm" onClick={() => setEditing(toInput(g))}>
                    {t('admin.gifts.edit')}
                  </Button>
                  <Button size="sm" variant={g.onSale ? 'ruby' : 'emerald'} onClick={() => toggleSale(g)}>
                    {g.onSale ? t('admin.gifts.stopSale') : t('admin.gifts.startSale')}
                  </Button>
                </span>
              ) : (
                <span key="a" />
              ),
            ])}
          />
        )}
      </Panel>
      {editing && (
        <GiftEditor
          value={editing}
          isNew={!gifts?.some((g) => g.id === editing.id)}
          onCancel={() => setEditing(null)}
          onSaved={(next) => {
            setGifts(next);
            setEditing(null);
            done();
          }}
        />
      )}
      <Transactions />
    </>
  );
}

function GiftEditor({ value, isNew, onCancel, onSaved }: { value: GiftUpsertInput; isNew: boolean; onCancel: () => void; onSaved: (gifts: StaffGiftView[]) => void }) {
  const { t, fail } = useAdminKit();
  const [g, setG] = useState(value);
  useEffect(() => setG(value), [value]);
  const num = (s: string) => Math.max(0, Math.floor(Number(s.replace(/\D/g, '')) || 0));
  const save = () => void adminApi<{ gifts: StaffGiftView[] }>(`/api/admin/gifts/${encodeURIComponent(g.id)}`, { method: 'PUT', body: g }).then((r) => onSaved(r.gifts), fail);
  return (
    <Panel title={isNew ? t('admin.gifts.add') : t('admin.gifts.editTitle', { id: g.id })}>
      {!isNew && <p className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{t('admin.gifts.priceNote')}</p>}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-white/60">
          ID
          <input className="field" disabled={!isNew} placeholder="rose_red" value={g.id} onChange={(e) => setG({ ...g, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.gifts.category')}
          <select className="field" value={g.category} onChange={(e) => setG({ ...g, category: e.target.value as GiftUpsertInput['category'] })}>
            {GIFT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`giftShop.categories.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-white/60">
          {t('admin.gifts.rarity')}
          <select className="field" value={g.rarity} onChange={(e) => setG({ ...g, rarity: e.target.value as GiftUpsertInput['rarity'] })}>
            {GIFT_RARITIES.map((r) => (
              <option key={r} value={r}>
                {t(`rarity.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-white/60">
          {t('admin.gifts.nameVi')}
          <input className="field" maxLength={40} value={g.name.vi} onChange={(e) => setG({ ...g, name: { ...g.name, vi: e.target.value } })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.gifts.nameEn')}
          <input className="field" maxLength={40} value={g.name.en} onChange={(e) => setG({ ...g, name: { ...g.name, en: e.target.value } })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.gifts.icon')}
          <input className="field" maxLength={40} value={g.icon} onChange={(e) => setG({ ...g, icon: e.target.value })} />
        </label>
        <label className="text-xs text-white/60 sm:col-span-3">
          {t('admin.gifts.descVi')}
          <input className="field" maxLength={300} value={g.description.vi} onChange={(e) => setG({ ...g, description: { ...g.description, vi: e.target.value } })} />
        </label>
        <label className="text-xs text-white/60 sm:col-span-3">
          {t('admin.gifts.descEn')}
          <input className="field" maxLength={300} value={g.description.en} onChange={(e) => setG({ ...g, description: { ...g.description, en: e.target.value } })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.gifts.price')}
          <input className="field" inputMode="numeric" value={g.price} onChange={(e) => setG({ ...g, price: Math.max(1, num(e.target.value)) })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.gifts.currency')}
          <select className="field" value={g.currency} onChange={(e) => setG({ ...g, currency: e.target.value as 'silver' | 'gold' })}>
            <option value="silver">{t('currency.silver')}</option>
            <option value="gold">{t('currency.gold')}</option>
          </select>
        </label>
        <label className="text-xs text-white/60">
          {t('admin.gifts.charm')}
          <input className="field" inputMode="numeric" value={g.charm} onChange={(e) => setG({ ...g, charm: Math.max(1, num(e.target.value)) })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.gifts.dailyLimit')}
          <input className="field" inputMode="numeric" placeholder="—" value={g.dailyLimit ?? ''} onChange={(e) => setG({ ...g, dailyLimit: e.target.value ? Math.max(1, num(e.target.value)) : null })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.gifts.startsAt')}
          <input className="field" type="datetime-local" value={toLocalInput(g.startsAt)} onChange={(e) => setG({ ...g, startsAt: fromLocalInput(e.target.value) })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.gifts.endsAt')}
          <input className="field" type="datetime-local" value={toLocalInput(g.endsAt)} onChange={(e) => setG({ ...g, endsAt: fromLocalInput(e.target.value) })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.gifts.sort')}
          <input className="field" inputMode="numeric" value={g.sort} onChange={(e) => setG({ ...g, sort: Number(e.target.value.replace(/[^\d-]/g, '')) || 0 })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.gifts.iconAsset')}
          <input className="field" placeholder="sha256.png" value={g.iconAsset ?? ''} onChange={(e) => setG({ ...g, iconAsset: e.target.value.trim() || null })} />
        </label>
        <label className="flex items-center gap-2 self-end text-sm text-white/80">
          <input type="checkbox" checked={g.onSale} onChange={(e) => setG({ ...g, onSale: e.target.checked })} />
          {t('admin.gifts.onSale')}
        </label>
      </div>
      <div className="flex items-center gap-2 text-sm text-white/70">
        <GiftIcon gift={{ icon: g.icon, iconUrl: g.iconAsset ? `/api/assets/${g.iconAsset}` : null }} size={36} />
        {t('admin.gifts.ratio', { n: (g.charm / Math.max(1, g.price)).toFixed(3) })}
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>{t('admin.cancel')}</Button>
        <Button variant="gold" disabled={!g.id || !g.name.vi || !g.name.en} onClick={save}>
          {t('admin.gifts.save')}
        </Button>
      </div>
    </Panel>
  );
}

/** Transactions with filters; staff always see the real sender, anonymous or not. */
function Transactions() {
  const { t, fmt, can, fail, done, date } = useAdminKit();
  const [uid, setUid] = useState('');
  const [abnormal, setAbnormal] = useState(false);
  const [rows, setRows] = useState<StaffGiftTxView[] | null>(null);
  const [reversing, setReversing] = useState<StaffGiftTxView | null>(null);
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState(false);
  const load = () => {
    const q = new URLSearchParams({ ...(uid ? { uid } : {}), ...(abnormal ? { abnormal: '1' } : {}) });
    void adminApi<{ transactions: StaffGiftTxView[] }>(`/api/admin/gifts/transactions?${q}`).then((r) => setRows(r.transactions), fail);
  };
  useEffect(load, [abnormal]); // eslint-disable-line react-hooks/exhaustive-deps
  const reverse = () => {
    if (!reversing) return;
    void adminApi(`/api/admin/gifts/transactions/${reversing.id}/reverse`, { method: 'POST', body: { reason, refund, idempotencyKey: newIdempotencyKey() } }).then(() => {
      done();
      setReversing(null);
      setReason('');
      load();
    }, fail);
  };
  return (
    <Panel title={t('admin.gifts.transactions')}>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <input className="field max-w-[12rem]" inputMode="numeric" placeholder="UID" value={uid} onChange={(e) => setUid(e.target.value.replace(/\D/g, ''))} />
        <Button type="submit">{t('admin.vip.find')}</Button>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input type="checkbox" checked={abnormal} onChange={(e) => setAbnormal(e.target.checked)} />
          {t('admin.gifts.abnormal')}
        </label>
      </form>
      {reversing && (
        <div className="flex flex-col gap-2 rounded-xl border border-ruby-400/40 bg-ruby-500/10 p-3 text-sm">
          <p>{t('admin.gifts.reverseBody', { gift: reversing.gift.name.vi, from: reversing.sender.uid, to: reversing.receiver.uid, charm: fmt(reversing.charm) })}</p>
          <input className="field" maxLength={500} placeholder={t('admin.vip.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
            {t('admin.gifts.refund', { amount: fmt(reversing.total) })}
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setReversing(null)}>
              {t('admin.cancel')}
            </Button>
            <Button size="sm" variant="ruby" disabled={reason.trim().length < 3} onClick={reverse}>
              {t('admin.gifts.reverse')}
            </Button>
          </div>
        </div>
      )}
      {rows === null ? (
        <p className="text-white/50">{t('app.loading')}</p>
      ) : (
        <Table
          head={[t('admin.vip.when'), t('admin.gifts.from'), t('admin.gifts.to'), t('admin.gifts.gift'), t('admin.gifts.price'), t('admin.gifts.charm'), t('admin.gifts.state'), '']}
          rows={rows.map((r) => [
            <span key="w" className="text-xs">{date(r.createdAt)}</span>,
            <span key="f" className="text-xs">
              {r.sender.displayName} (UID {r.sender.uid}){r.anonymous && <Pill tone="cyan">{t('admin.gifts.anon')}</Pill>}
            </span>,
            <span key="t" className="text-xs">
              {r.receiver.displayName} (UID {r.receiver.uid})
            </span>,
            <span key="g" className="flex items-center gap-1 text-xs">
              <GiftIcon gift={r.gift} size={18} /> {r.gift.name.vi} ×{r.quantity}
            </span>,
            <span key="p" className="inline-flex items-center gap-1 text-xs tabular-nums">
              <CurrencyIcon currency={r.currency} size={12} /> {fmt(r.total)}
            </span>,
            <span key="c" className="text-xs tabular-nums text-pink-200">+{fmt(r.charm)}</span>,
            r.status === 'reversed' ? (
              <span key="s" className="text-[11px] text-ruby-200" title={r.reverseReason ?? ''}>
                {t('admin.gifts.reversed')}
                {r.refunded && ` · ${t('admin.gifts.refunded')}`}
              </span>
            ) : (
              <Pill key="s" tone="emerald">OK</Pill>
            ),
            can('gifts.manage') && r.status === 'completed' ? (
              <Button key="a" size="sm" variant="ruby" onClick={() => setReversing(r)}>
                {t('admin.gifts.reverse')}
              </Button>
            ) : (
              <span key="a" />
            ),
          ])}
        />
      )}
    </Panel>
  );
}
