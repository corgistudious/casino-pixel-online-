import { ITEM_KINDS, ITEM_SOURCES, ITEM_STATUSES, RARITIES, type CatalogItem, type FrameRender, type ItemKind } from '@casino/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { adminApi, newIdempotencyKey } from '../net/adminApi';
import { assetSrc, useCatalog } from '../store/catalog';
import { FramedAvatar } from '../ui/Avatar';
import { CardBack, ChatBubble, TitleBadge } from '../ui/Cosmetics';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';
import { Empty, Panel, Pill, Table } from './parts';
import { useAdminKit } from './useAdmin';

type AdminItem = CatalogItem & { owners: number };

interface Draft {
  id: string;
  kind: ItemKind;
  nameVi: string;
  nameEn: string;
  descVi: string;
  descEn: string;
  rarity: CatalogItem['rarity'];
  source: CatalogItem['source'];
  status: CatalogItem['status'];
  tradable: boolean;
  price: string;
  /** Gold shop price (an item has at most one price). */
  priceGold: string;
  assetId: string | null;
  assetUrl: string | null;
  render: FrameRender;
  /** Drawn look (no image): colour stops "#rrggbb, #rrggbb…" and animation. */
  colors: string;
  animated: boolean;
}

const DRAWABLE: ItemKind[] = ['frame', 'title', 'chat_bubble', 'card_back'];
const parseColors = (v: string) => v.split(/[\s,]+/).filter((c) => /^#[0-9a-f]{6}$/i.test(c));

const EMPTY: Draft = {
  id: '',
  kind: 'frame',
  nameVi: '',
  nameEn: '',
  descVi: '',
  descEn: '',
  rarity: 'common',
  source: 'event',
  status: 'draft',
  tradable: false,
  price: '',
  priceGold: '',
  assetId: null,
  assetUrl: null,
  render: { scale: 1.25, offsetX: 0, offsetY: 0 },
  colors: '#fff1b8, #f2c14e',
  animated: false,
};

function fromItem(i: AdminItem): Draft {
  return {
    id: i.id,
    kind: i.kind,
    nameVi: i.name.vi,
    nameEn: i.name.en,
    descVi: i.description?.vi ?? '',
    descEn: i.description?.en ?? '',
    rarity: i.rarity,
    source: i.source,
    status: i.status,
    tradable: i.tradable,
    price: i.priceSilver === null ? '' : String(i.priceSilver),
    priceGold: i.priceGold === null ? '' : String(i.priceGold),
    assetId: i.assetUrl ? i.assetUrl.split('/').pop()! : null,
    colors: i.style?.colors.join(', ') ?? EMPTY.colors,
    animated: i.style?.animated ?? false,
    assetUrl: i.assetUrl,
    render: i.render ?? EMPTY.render,
  };
}

export function ItemsPage() {
  const { t, can, fail } = useAdminKit();
  const reloadPublic = useCatalog((c) => c.load);
  const [items, setItems] = useState<AdminItem[]>([]);
  const [editing, setEditing] = useState<{ draft: Draft; isNew: boolean } | null>(null);
  const load = () => void adminApi<{ items: AdminItem[] }>('/api/admin/items').then((r) => setItems(r.items), fail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl">{t('admin.items.title')}</h1>
        {can('items.manage') && (
          <Button variant="gold" onClick={() => setEditing({ draft: { ...EMPTY }, isNew: true })}>
            {t('admin.items.create')}
          </Button>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Panel>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => setEditing({ draft: fromItem(i), isNew: false })}
                  className={`flex w-full flex-col items-center gap-1 rounded-xl border p-3 text-center transition ${editing?.draft.id === i.id && !editing.isNew ? 'border-gold-300/60 bg-gold-300/10' : 'border-white/10 hover:border-gold-300/30'}`}
                >
                  <ItemThumb item={i} size={56} />
                  <span className="line-clamp-1 text-xs text-white/85">{i.name.vi}</span>
                  <span className="flex flex-wrap justify-center gap-1">
                    <Pill tone={i.status === 'released' ? 'emerald' : i.status === 'hidden' ? 'muted' : 'cyan'}>{t(`admin.items.statuses.${i.status}`).split(' (')[0]}</Pill>
                    <Pill>{t(`admin.items.kinds.${i.kind}`)}</Pill>
                  </span>
                  <span className="text-[10px] text-white/45">{t('admin.items.ownersCount', { count: i.owners })}</span>
                </button>
              </li>
            ))}
          </ul>
          {!items.length && <Empty />}
        </Panel>
        {editing ? (
          <Editor
            key={`${editing.draft.id}-${editing.isNew}`}
            initial={editing.draft}
            isNew={editing.isNew}
            builtIn={!editing.isNew && !editing.draft.assetUrl}
            onSaved={(id) => {
              load();
              void reloadPublic();
              setEditing((e) => (e ? { draft: { ...e.draft, id }, isNew: false } : e));
            }}
          />
        ) : (
          <Panel>
            <Empty>{t('admin.items.selectHint')}</Empty>
          </Panel>
        )}
      </div>
    </>
  );
}

function ItemThumb({ item, size }: { item: Pick<CatalogItem, 'kind' | 'assetUrl' | 'render' | 'id' | 'style'> & Partial<Pick<CatalogItem, 'name'>>; size: number }) {
  if (item.kind === 'frame') return <FramedAvatar index={3} size={size} frame={item.id} frameItem={item} />;
  if (item.kind === 'avatar') return <FramedAvatar index={3} size={size} frame="none" avatarSrc={assetSrc(item.assetUrl)} avatarArt={!item.assetUrl && item.style?.art === 'vuong_gia' ? 'vuong_gia' : undefined} />;
  if (item.kind === 'title') return <TitleBadge itemId={item.id} item={item} size={size > 80 ? 'md' : 'sm'} />;
  if (item.kind === 'chat_bubble') return <ChatBubble itemId={item.id} item={item}>Keyo</ChatBubble>;
  if (item.kind === 'card_back') return <CardBack itemId={item.id} item={item} width={Math.round(size * 0.7)} />;
  return item.assetUrl ? <img src={assetSrc(item.assetUrl)} alt="" className="object-contain" style={{ width: size, height: size }} /> : null;
}

function Editor({ initial, isNew, builtIn, onSaved }: { initial: Draft; isNew: boolean; builtIn: boolean; onSaved: (id: string) => void }) {
  const { t, can, fail, done } = useAdminKit();
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const editable = can('items.manage');

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const { asset } = await adminApi<{ asset: { id: string; url: string } }>('/api/admin/assets', { method: 'PUT', raw: file });
      setD((x) => ({ ...x, assetId: asset.id, assetUrl: asset.url }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const common = {
      nameVi: d.nameVi,
      nameEn: d.nameEn,
      descVi: d.descVi || null,
      descEn: d.descEn || null,
      rarity: d.rarity,
      source: d.source,
      status: d.status,
      tradable: d.tradable,
      priceSilver: d.price === '' ? null : Number(d.price),
      priceGold: d.priceGold === '' ? null : Number(d.priceGold),
      ...(d.kind === 'frame' && !builtIn ? { render: d.render } : {}),
      ...(d.assetId && !builtIn ? { assetId: d.assetId } : {}),
      ...(!d.assetId && DRAWABLE.includes(d.kind) && parseColors(d.colors).length >= 2 ? { style: { colors: parseColors(d.colors), animated: d.animated } } : {}),
    };
    try {
      if (isNew) await adminApi('/api/admin/items', { method: 'POST', body: { id: d.id, kind: d.kind, ...common } });
      else await adminApi(`/api/admin/items/${d.id}`, { method: 'PATCH', body: common });
      done();
      onSaved(d.id);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const drawn = !d.assetUrl && DRAWABLE.includes(d.kind);
  const style = drawn && parseColors(d.colors).length >= 2 ? { colors: parseColors(d.colors), animated: d.animated } : null;
  const previewItem = { id: d.id || 'preview', kind: d.kind, assetUrl: d.assetUrl, render: d.render, style, name: { vi: d.nameVi || d.id, en: d.nameEn || d.id } };
  return (
    <Panel title={isNew ? t('admin.items.create') : d.id}>
      <form onSubmit={save} className="flex flex-col gap-3">
        {builtIn && <p className="text-xs text-white/50">{t('admin.items.builtIn')}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('admin.items.id')}
            <input className="field" value={d.id} onChange={(e) => set('id', e.target.value.toLowerCase())} disabled={!isNew} required pattern="[a-z0-9_]{2,40}" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('admin.items.kind')}
            <select className="field" value={d.kind} onChange={(e) => set('kind', e.target.value as ItemKind)} disabled={!isNew}>
              {ITEM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`admin.items.kinds.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('admin.items.nameVi')}
            <input className="field" value={d.nameVi} onChange={(e) => set('nameVi', e.target.value)} required maxLength={60} disabled={!editable} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('admin.items.nameEn')}
            <input className="field" value={d.nameEn} onChange={(e) => set('nameEn', e.target.value)} required maxLength={60} disabled={!editable} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('admin.items.descVi')}
            <input className="field" value={d.descVi} onChange={(e) => set('descVi', e.target.value)} maxLength={300} disabled={!editable} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('admin.items.descEn')}
            <input className="field" value={d.descEn} onChange={(e) => set('descEn', e.target.value)} maxLength={300} disabled={!editable} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('admin.items.rarity')}
            <select className="field" value={d.rarity} onChange={(e) => set('rarity', e.target.value as Draft['rarity'])} disabled={!editable}>
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {t(`rarity.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('admin.items.source')}
            <select className="field" value={d.source} onChange={(e) => set('source', e.target.value as Draft['source'])} disabled={!editable}>
              {ITEM_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`itemSource.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('admin.items.status')}
            <select className="field" value={d.status} onChange={(e) => set('status', e.target.value as Draft['status'])} disabled={!editable}>
              {ITEM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`admin.items.statuses.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('admin.items.price')}
            <input className="field" inputMode="numeric" value={d.price} onChange={(e) => set('price', e.target.value.replace(/\D/g, ''))} disabled={!editable || d.priceGold !== ''} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('admin.items.priceGold')}
            <input className="field" inputMode="numeric" value={d.priceGold} onChange={(e) => set('priceGold', e.target.value.replace(/\D/g, ''))} disabled={!editable || d.price !== '' || d.source === 'role'} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-white/75">
          <input type="checkbox" className="accent-gold-300" checked={d.tradable} onChange={(e) => set('tradable', e.target.checked)} disabled={!editable} />
          {t('admin.items.tradable')}
        </label>
        {!builtIn && editable && (
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('admin.items.upload')}
            <input type="file" accept="image/png,image/webp,image/gif" onChange={(e) => void upload(e.target.files?.[0])} className="text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white" />
          </label>
        )}
        {drawn && editable && (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="flex flex-col gap-1 text-xs text-white/55">
              {t('admin.items.colors')}
              <input className="field font-mono" value={d.colors} onChange={(e) => set('colors', e.target.value)} placeholder="#fff1b8, #f2c14e" />
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-white/75">
              <input type="checkbox" className="accent-gold-300" checked={d.animated} onChange={(e) => set('animated', e.target.checked)} />
              {t('admin.items.animated')}
            </label>
          </div>
        )}
        {d.kind === 'frame' && !builtIn && d.assetUrl && (
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ['scale', 1, 1.8, 0.01],
                ['offsetX', -0.25, 0.25, 0.005],
                ['offsetY', -0.25, 0.25, 0.005],
              ] as const
            ).map(([k, min, max, step]) => (
              <label key={k} className="flex flex-col gap-1 text-xs text-white/55">
                {t(`admin.items.${k}`)} · {d.render[k].toFixed(3)}
                <input type="range" min={min} max={max} step={step} value={d.render[k]} onChange={(e) => set('render', { ...d.render, [k]: Number(e.target.value) })} className="accent-gold-300" disabled={!editable} />
              </label>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-white/55">{t('admin.items.preview')}</span>
          <div className="flex flex-wrap items-end gap-6 rounded-xl bg-black/30 p-4">
            {[40, 72, 120].map((size, i) =>
              d.kind === 'frame' ? (
                <FramedAvatar key={size} index={i * 5 + 1} size={size} frame={builtIn ? d.id : previewItem.id} frameItem={builtIn ? undefined : previewItem} />
              ) : (
                <ItemThumb key={size} item={previewItem} size={size} />
              ),
            )}
          </div>
        </div>
        {d.status === 'hidden' && <p className="text-xs text-white/45">{t('admin.items.hideNote')}</p>}
        {editable && (
          <Button type="submit" variant="gold" disabled={busy || (isNew && !d.assetId && !style)}>
            {t('admin.items.save')}
          </Button>
        )}
      </form>
      {!isNew && <Owners itemId={d.id} />}
    </Panel>
  );
}

function Owners({ itemId }: { itemId: string }) {
  const { t, can, date, fail, done } = useAdminKit();
  const [rows, setRows] = useState<{ instanceId: string; uid: number; username: string; source: string; acquiredAt: string }[]>([]);
  const [uid, setUid] = useState('');
  const [reason, setReason] = useState('');
  const load = () => void adminApi<{ owners: typeof rows }>(`/api/admin/items/${itemId}/owners?limit=100`).then((r) => setRows(r.owners), fail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [itemId]);

  const grant = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await adminApi<{ outcome: string }>(`/api/admin/items/${itemId}/grant`, { method: 'POST', body: { uid: Number(uid), reason: reason.trim(), idempotencyKey: newIdempotencyKey() } });
      if (r.outcome === 'already_owned') toast(t('errors.already_owned'), 'error');
      else done();
      setUid('');
      load();
    } catch (err) {
      fail(err);
    }
  };
  const revoke = async (instanceId: string) => {
    try {
      await adminApi(`/api/admin/inventory/${instanceId}/revoke`, { method: 'POST', body: { reason: reason.trim() } });
      done();
      load();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
      <h3 className="font-display text-base">{t('admin.items.owners')}</h3>
      {can('items.grant') && (
        <form onSubmit={grant} className="flex flex-wrap gap-2">
          <input className="field max-w-32" placeholder="UID" inputMode="numeric" value={uid} onChange={(e) => setUid(e.target.value.replace(/\D/g, ''))} aria-label="UID" />
          <input className="field min-w-48 flex-1" placeholder={t('admin.items.grantReason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <Button type="submit" size="sm" variant="gold" disabled={!uid || reason.trim().length < 3}>
            {t('admin.items.grant')}
          </Button>
        </form>
      )}
      <Table
        head={[t('admin.fields.uid'), t('admin.fields.acquired'), t('admin.items.source'), '']}
        rows={rows.map((r) => [
          `#${r.uid} ${r.username}`,
          date(r.acquiredAt),
          t(`itemSource.${r.source}`, { defaultValue: r.source }),
          can('items.grant') ? (
            <Button key="r" size="sm" disabled={reason.trim().length < 3} title={t('admin.items.revokeReason')} onClick={() => void revoke(r.instanceId)}>
              {t('admin.items.revoke')}
            </Button>
          ) : (
            ''
          ),
        ])}
      />
    </div>
  );
}
