import { vipTierOf, type StaffVipView, type VipLevelInput, type VipLevelView } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminApi, newIdempotencyKey } from '../net/adminApi';
import { Button } from '../ui/Button';
import { CurrencyIcon } from '../ui/OfficialAssets';
import { VipEmblem } from '../ui/VipEmblem';
import { Panel, Pill, Table } from './parts';
import { useAdminKit } from './useAdmin';

const toInput = (l: VipLevelView): VipLevelInput => ({
  level: l.level,
  name: l.name,
  description: l.description,
  color: l.color,
  iconAsset: l.iconUrl ? l.iconUrl.split('/').pop()! : null,
  exp: l.exp,
  daily: l.daily,
  benefits: l.benefits,
  active: l.active,
});

/** Admin → VIP: the level table (vip.levels) and per-player VIP (vip.manage). Every change is audited. */
export function VipAdminPage() {
  const { t, fmt, can, fail, done } = useAdminKit();
  const [levels, setLevels] = useState<VipLevelView[] | null>(null);
  const [editing, setEditing] = useState<VipLevelInput | null>(null);
  const load = () => void adminApi<{ levels: VipLevelView[] }>('/api/admin/vip/levels').then((r) => setLevels(r.levels), fail);
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  const canEdit = can('vip.levels');

  const addLevel = () => {
    const last = levels?.[levels.length - 1];
    setEditing({
      level: (last?.level ?? 0) + 1,
      name: { vi: `VIP ${(last?.level ?? 0) + 1}`, en: `VIP ${(last?.level ?? 0) + 1}` },
      description: { vi: '', en: '' },
      color: last?.color ?? '#c27bff',
      iconAsset: null,
      exp: (last?.exp ?? 0) + 50_000,
      daily: last?.daily ?? { silver: 0, gold: 0 },
      benefits: [],
      active: false,
    });
  };
  const remove = (level: number) => {
    if (!window.confirm(t('admin.vip.confirmDelete', { level }))) return;
    void adminApi<{ levels: VipLevelView[] }>(`/api/admin/vip/levels/${level}`, { method: 'DELETE' }).then((r) => {
      setLevels(r.levels);
      done();
    }, fail);
  };

  return (
    <>
      <h1 className="font-display text-2xl">{t('admin.vip.title')}</h1>
      <Panel
        title={t('admin.vip.levels')}
        actions={
          canEdit && (
            <Button size="sm" variant="gold" onClick={addLevel}>
              + {t('admin.vip.addLevel')}
            </Button>
          )
        }
      >
        <p className="text-xs text-white/55">{t('admin.vip.levelsHint')}</p>
        {!canEdit && <p className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{t('admin.vip.readOnly')}</p>}
        {levels === null ? (
          <p className="text-white/50">{t('app.loading')}</p>
        ) : (
          <Table
            head={[t('admin.vip.badge'), t('admin.vip.name'), t('admin.vip.exp'), t('admin.vip.daily'), t('admin.vip.state'), '']}
            rows={levels.map((l) => [
              <span key="b" className="flex items-center gap-2">
                <VipEmblem level={l.level} size={30} dim={!l.active} />
                <span className="text-[11px] text-white/50">{t(`identity.tiers.${vipTierOf(l.level)}`)}</span>
              </span>,
              <span key="n">
                <span style={{ color: l.color }}>{l.name.vi}</span> <span className="text-white/45">/ {l.name.en}</span>
              </span>,
              <span key="e" className="tabular-nums">{fmt(l.exp)}</span>,
              <span key="d" className="inline-flex items-center gap-1 tabular-nums">
                <CurrencyIcon currency="silver" size={14} /> {fmt(l.daily.silver)} · <CurrencyIcon currency="gold" size={14} /> {fmt(l.daily.gold)}
              </span>,
              l.active ? <Pill key="s" tone="emerald">{t('admin.vip.active')}</Pill> : <Pill key="s">{t('admin.vip.inactive')}</Pill>,
              canEdit ? (
                <span key="a" className="flex gap-1">
                  <Button size="sm" onClick={() => setEditing(toInput(l))}>
                    {t('admin.vip.edit')}
                  </Button>
                  {l.level > 1 && (
                    <Button size="sm" variant="ruby" onClick={() => remove(l.level)}>
                      {t('admin.vip.delete')}
                    </Button>
                  )}
                </span>
              ) : (
                <span key="a" />
              ),
            ])}
          />
        )}
      </Panel>
      {editing && (
        <LevelEditor
          value={editing}
          onCancel={() => setEditing(null)}
          onSaved={(next) => {
            setLevels(next);
            setEditing(null);
            done();
          }}
        />
      )}
      <PlayerVip />
    </>
  );
}

function LevelEditor({ value, onCancel, onSaved }: { value: VipLevelInput; onCancel: () => void; onSaved: (levels: VipLevelView[]) => void }) {
  const { t, fail } = useAdminKit();
  const [v, setV] = useState(value);
  const [benefits, setBenefits] = useState(value.benefits.map((b) => `${b.vi} | ${b.en}`).join('\n'));
  useEffect(() => {
    setV(value);
    setBenefits(value.benefits.map((b) => `${b.vi} | ${b.en}`).join('\n'));
  }, [value]);
  const num = (s: string) => Math.max(0, Math.floor(Number(s.replace(/\D/g, '')) || 0));
  const save = () => {
    const parsed = benefits
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [vi, en] = l.split('|').map((x) => x.trim());
        return { vi: vi!, en: en || vi! };
      });
    void adminApi<{ levels: VipLevelView[] }>(`/api/admin/vip/levels/${v.level}`, { method: 'PUT', body: { ...v, benefits: parsed } }).then((r) => onSaved(r.levels), fail);
  };
  return (
    <Panel title={t('admin.vip.editTitle', { level: v.level })}>
      <div className="flex items-center gap-3">
        <VipEmblem level={v.level} size={56} />
        <span className="text-sm" style={{ color: v.color }}>
          {v.name.vi} / {v.name.en}
        </span>
        <span className="text-xs text-white/50">{t('admin.vip.preview')}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-white/60">
          {t('admin.vip.nameVi')}
          <input className="field" maxLength={40} value={v.name.vi} onChange={(e) => setV({ ...v, name: { ...v.name, vi: e.target.value } })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.vip.nameEn')}
          <input className="field" maxLength={40} value={v.name.en} onChange={(e) => setV({ ...v, name: { ...v.name, en: e.target.value } })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.vip.descVi')}
          <textarea className="field" rows={2} maxLength={500} value={v.description.vi} onChange={(e) => setV({ ...v, description: { ...v.description, vi: e.target.value } })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.vip.descEn')}
          <textarea className="field" rows={2} maxLength={500} value={v.description.en} onChange={(e) => setV({ ...v, description: { ...v.description, en: e.target.value } })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.vip.exp')}
          <input className="field" inputMode="numeric" value={v.exp} disabled={v.level === 1} onChange={(e) => setV({ ...v, exp: num(e.target.value) })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.vip.color')}
          <input className="field h-10" type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.vip.dailySilver')}
          <input className="field" inputMode="numeric" value={v.daily.silver} onChange={(e) => setV({ ...v, daily: { ...v.daily, silver: num(e.target.value) } })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.vip.dailyGold')}
          <input className="field" inputMode="numeric" value={v.daily.gold} onChange={(e) => setV({ ...v, daily: { ...v.daily, gold: num(e.target.value) } })} />
        </label>
        <label className="text-xs text-white/60">
          {t('admin.vip.icon')}
          <input className="field" placeholder="sha256.png" value={v.iconAsset ?? ''} onChange={(e) => setV({ ...v, iconAsset: e.target.value.trim() || null })} />
        </label>
        <label className="flex items-center gap-2 self-end text-sm text-white/80">
          <input type="checkbox" checked={v.active} disabled={v.level === 1} onChange={(e) => setV({ ...v, active: e.target.checked })} />
          {t('admin.vip.active')}
        </label>
      </div>
      <label className="text-xs text-white/60">
        {t('admin.vip.benefits')}
        <textarea className="field" rows={3} value={benefits} onChange={(e) => setBenefits(e.target.value)} placeholder="Khung VIP độc quyền | Exclusive VIP frame" />
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>{t('admin.cancel')}</Button>
        <Button variant="gold" onClick={save}>
          {t('admin.vip.save')}
        </Button>
      </div>
    </Panel>
  );
}

/** Look a player up by UID; grant/revoke a level or add/remove EXP with a reason. */
function PlayerVip() {
  const { t, fmt, can, fail, done, date } = useAdminKit();
  const params = useParams();
  const [uid, setUid] = useState(params.uid ?? '');
  const [view, setView] = useState<StaffVipView | null>(null);
  const [action, setAction] = useState<'exp_add' | 'exp_remove' | 'grant' | 'revoke'>('exp_add');
  const [amount, setAmount] = useState(100);
  const [level, setLevel] = useState(2);
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const lookup = (u = uid) => {
    const n = Number(u);
    if (!Number.isInteger(n) || n < 1) return;
    void adminApi<StaffVipView>(`/api/admin/vip/players/${n}`).then(setView, fail);
  };
  useEffect(() => void (params.uid && lookup(params.uid)), [params.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => {
    if (!view) return;
    const body =
      action === 'grant'
        ? { action, level, ...(days ? { days: Number(days) } : {}), reason, idempotencyKey: newIdempotencyKey() }
        : action === 'revoke'
          ? { action, reason, idempotencyKey: newIdempotencyKey() }
          : { action, amount, reason, idempotencyKey: newIdempotencyKey() };
    void adminApi(`/api/admin/vip/players/${view.uid}`, { method: 'POST', body }).then(() => {
      done();
      setReason('');
      lookup(String(view.uid));
    }, fail);
  };
  return (
    <Panel title={t('admin.vip.players')}>
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
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-black/25 p-3 text-sm">
            <VipEmblem level={view.status.level} size={44} />
            <div>
              <div className="font-strong">
                {view.displayName} <span className="text-white/45">· UID {view.uid}</span>
              </div>
              <div className="text-xs text-white/60">
                {t('admin.vip.current', { level: view.status.level, expLevel: view.status.expLevel, exp: fmt(view.status.exp) })}
                {view.status.override && ` · ${t('admin.vip.granted', { level: view.status.override.level, until: view.status.override.until ? date(view.status.override.until) : '∞' })}`}
              </div>
            </div>
          </div>
          {can('vip.manage') ? (
            <div className="grid gap-2 sm:grid-cols-4">
              <select className="field" value={action} onChange={(e) => setAction(e.target.value as typeof action)} aria-label={t('admin.vip.action')}>
                {(['exp_add', 'exp_remove', 'grant', 'revoke'] as const).map((a) => (
                  <option key={a} value={a}>
                    {t(`admin.vip.actions.${a}`)}
                  </option>
                ))}
              </select>
              {(action === 'exp_add' || action === 'exp_remove') && (
                <input className="field" inputMode="numeric" aria-label={t('admin.vip.amount')} value={amount} onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value.replace(/\D/g, '')) || 1)))} />
              )}
              {action === 'grant' && (
                <>
                  <input className="field" inputMode="numeric" aria-label={t('admin.vip.level')} value={level} onChange={(e) => setLevel(Math.max(1, Math.floor(Number(e.target.value.replace(/\D/g, '')) || 1)))} />
                  <input className="field" inputMode="numeric" placeholder={t('admin.vip.days')} value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} />
                </>
              )}
              <input className="field sm:col-span-4" maxLength={500} placeholder={t('admin.vip.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="gold" disabled={reason.trim().length < 3} onClick={submit}>
                {t('admin.vip.apply')}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-white/50">{t('admin.vip.noManage')}</p>
          )}
          <Table
            head={[t('admin.vip.when'), t('admin.vip.action'), t('admin.vip.change'), t('admin.vip.reason'), t('admin.vip.by')]}
            rows={view.events.map((e) => [
              <span key="w" className="text-xs">{date(e.createdAt)}</span>,
              t(`admin.vip.actions.${e.kind}`),
              <span key="c" className="text-xs tabular-nums">
                VIP {e.oldLevel} → {e.newLevel} · EXP {fmt(e.oldExp)} → {fmt(e.newExp)}
                {e.overrideUntil && ` · ⏳ ${date(e.overrideUntil)}`}
              </span>,
              <span key="r" className="text-xs">{e.reason}</span>,
              <span key="b" className="text-xs">{e.actor ? `${e.actor.displayName} (UID ${e.actor.uid})` : '—'}</span>,
            ])}
          />
        </>
      )}
    </Panel>
  );
}
