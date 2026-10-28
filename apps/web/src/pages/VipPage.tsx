import { vipTierOf, type VipLevelView } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { assetSrc } from '../store/catalog';
import { useSession } from '../store/session';
import { startVipSync, useVip } from '../store/vip';
import { AppShell, PageHeader } from '../ui/AppShell';
import { CurrencyIcon } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';
import { VipEmblem, vipTier } from '../ui/VipEmblem';

const RULES = ['earn', 'noBuy', 'permanent', 'max', 'fair'] as const;
/** The daily VIP reward resets at midnight Vietnam time (same as the server). */
const vnToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

export function VipPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'vi';
  const fmt = (n: number) => formatChips(n, i18n.language);
  const status = useVip((v) => v.status);
  const levels = useVip((v) => v.levels);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    startVipSync();
    useVip.getState().refresh();
    useVip.getState().loadLevels();
  }, []);

  const claimed = status?.lastClaimDate === vnToday();
  const claim = async () => {
    setBusy(true);
    try {
      await api('/api/vip/daily', { method: 'POST' });
      const { user } = await api<{ user: NonNullable<ReturnType<typeof useSession.getState>['user']> }>('/api/me');
      useSession.getState().setUser(user);
      useVip.getState().refresh();
      toast(t('identity.vipClaimed'), 'success');
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    } finally {
      setBusy(false);
    }
  };

  const table: VipLevelView[] = levels ?? (status ? [status.current, ...(status.next ? [status.next] : [])] : []);
  const level = status?.level ?? 1;
  const shown = table.find((l) => l.level === (selected ?? level)) ?? status?.current ?? null;
  const tierColor = vipTier(shown?.level ?? level).colors[1];

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <PageHeader icon="vip" title={t('vip.title')} subtitle={t('identity.vipSubtitle')} />
        <button disabled={!status || claimed || busy} onClick={() => void claim()} className="rounded-xl bg-amber-500 px-4 py-3 font-bold text-black disabled:opacity-40">
          {claimed ? t('identity.vipClaimedToday') : t('identity.vipClaim')}
        </button>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* Current level */}
          <section className="relative overflow-hidden rounded-2xl border border-gold-300/25 bg-gradient-to-br from-ink-800 via-ink-900 to-emerald-900 p-5 shadow-panel">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold-300/15 blur-3xl" />
            <span className="sheen opacity-50" />
            <div className="relative flex items-center gap-4">
              <div className="animate-[pulseGlow_3s_ease-in-out_infinite] rounded-full">
                <VipEmblem level={level} size={104} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/50">{t('vip.yourLevel')}</div>
                <div className="font-display text-4xl font-bold text-gold">{status?.current.name[lang] ?? `VIP ${level}`}</div>
                <div className="text-xs text-white/55">{t(`identity.tiers.${vipTierOf(level)}`)}</div>
                {status?.override && (
                  <div className="mt-1 text-[11px] text-fuchsia-200">
                    {status.override.until ? t('identity.vipGrantedUntil', { date: new Date(status.override.until).toLocaleDateString(i18n.language), level: status.expLevel }) : t('identity.vipGranted', { level: status.expLevel })}
                  </div>
                )}
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
                  <div className="relative h-full rounded-full bg-gradient-to-r from-gold-500 via-gold-300 to-gold-100 shadow-[0_0_12px_rgba(242,193,78,0.7)]" style={{ width: `${(status?.ratio ?? 0) * 100}%` }}>
                    <span className="absolute inset-y-0 right-0 w-8 bg-gradient-to-r from-transparent to-white/60" />
                  </div>
                </div>
                <div className="mt-1.5 flex justify-between text-xs tabular-nums text-white/55">
                  <span>
                    {t('player.vipExp')} {fmt(status?.exp ?? 0)}
                  </span>
                  <span>{status?.next ? t('player.toNext', { exp: fmt(status.toNext), level: status.next.level }) : t('player.maxLevel')}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Selected level detail */}
          {shown && (
            <section className="glass flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                {shown.iconUrl ? <img src={assetSrc(shown.iconUrl)} alt="" className="h-14 w-14 object-contain" /> : <VipEmblem level={shown.level} size={56} />}
                <div>
                  <div className="font-display text-2xl font-bold" style={{ color: shown.color || tierColor }}>
                    {shown.name[lang]}
                  </div>
                  <div className="text-xs text-white/50">{t('vip.requires', { exp: fmt(shown.exp) })}</div>
                </div>
              </div>
              {shown.description[lang] && <p className="text-sm text-white/70">{shown.description[lang]}</p>}
              <div>
                <div className="mb-1.5 text-xs uppercase tracking-widest text-white/50">{t('vip.dailyReward')}</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['silver', 'gold'] as const).map((c) => (
                    <div key={c} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <CurrencyIcon currency={c} size={40} />
                      <div>
                        <div className={`font-display text-xl font-bold tabular-nums ${c === 'gold' ? 'text-gold-100' : ''}`}>{fmt(shown.daily[c])}</div>
                        <div className="text-[11px] text-white/50">{t(`currency.${c}`)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-white/40">{t('vip.dailyNote')}</p>
              </div>
              <div>
                <div className="mb-1 text-xs uppercase tracking-widest text-white/50">{t('vip.perks')}</div>
                {shown.benefits.length ? (
                  <ul className="flex flex-col gap-1 text-sm text-white/80">
                    {shown.benefits.map((b, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45 bg-gold-300" />
                        {b[lang]}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl border border-dashed border-white/15 px-3 py-2 text-sm text-white/55">{t('vip.perksPending')}</p>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Level track */}
        <section className="glass p-4">
          <h2 className="mb-3 font-display text-lg text-gold">{t('vip.levels')}</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {table.map((l) => {
              const reached = l.level <= level;
              const active = l.level === (selected ?? level);
              return (
                <button
                  key={l.level}
                  onClick={() => setSelected(l.level)}
                  className={`flex w-20 shrink-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 transition ${active ? 'border-gold-300/70 bg-gold-300/10 shadow-glow' : 'border-white/5 bg-black/20 hover:border-white/20'}`}
                >
                  <VipEmblem level={l.level} size={46} dim={!reached && !active} />
                  <span className={`max-w-full truncate text-xs font-bold ${reached ? 'text-white' : 'text-white/45'}`}>{l.name[lang]}</span>
                  <span className="text-[10px] tabular-nums text-white/40">{fmt(l.exp)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="glass p-4">
          <h2 className="mb-2 font-display text-lg text-gold">{t('vip.rulesTitle')}</h2>
          <ul className="grid gap-1.5 text-sm text-white/70 md:grid-cols-2">
            {RULES.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45 bg-gold-300" />
                {t(`vip.rules.${r}`)}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
