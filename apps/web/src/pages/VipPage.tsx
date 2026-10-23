import { VIP_LEVELS, vipProgress } from '@casino/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEMO_EXTRAS } from '../demo';
import { formatChips } from '../lib/format';
import { AppShell, DemoTag, PageHeader } from '../ui/AppShell';
import { CurrencyIcon } from '../ui/OfficialAssets';
import { VipEmblem, vipTier } from '../ui/VipEmblem';

const RULES = ['earn', 'noBuy', 'permanent', 'max', 'fair'] as const;

export function VipPage() {
  const { t, i18n } = useTranslation();
  const fmt = (n: number) => formatChips(n, i18n.language);
  // VIP is not implemented on the server yet; EXP is demo data.
  const exp = DEMO_EXTRAS.vipExp;
  const vip = vipProgress(exp);
  const [selected, setSelected] = useState(vip.level);
  const level = VIP_LEVELS[selected - 1]!;
  const tierColor = vipTier(selected).colors[1];

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <PageHeader icon="vip" title={t('vip.title')} subtitle={t('vip.subtitle')} />
        <p className="rounded-xl border border-neon-cyan/30 bg-neon-cyan/5 px-3 py-2 text-xs text-neon-cyan/90">{t('vip.notLive')}</p>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* Current level */}
          <section className="relative overflow-hidden rounded-2xl border border-gold-300/25 bg-gradient-to-br from-ink-800 via-ink-900 to-emerald-900 p-5 shadow-panel">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold-300/15 blur-3xl" />
            <span className="sheen opacity-50" />
            <div className="relative flex items-center gap-4">
              <div className="animate-[pulseGlow_3s_ease-in-out_infinite] rounded-full">
                <VipEmblem level={vip.level} size={104} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/50">
                  {t('vip.yourLevel')} <DemoTag />
                </div>
                <div className="font-display text-4xl font-bold text-gold">VIP {vip.level}</div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
                  <div className="relative h-full rounded-full bg-gradient-to-r from-gold-500 via-gold-300 to-gold-100 shadow-[0_0_12px_rgba(242,193,78,0.7)]" style={{ width: `${vip.ratio * 100}%` }}>
                    <span className="absolute inset-y-0 right-0 w-8 bg-gradient-to-r from-transparent to-white/60" />
                  </div>
                </div>
                <div className="mt-1.5 flex justify-between text-xs tabular-nums text-white/55">
                  <span>
                    {t('player.vipExp')} {fmt(exp)}
                  </span>
                  <span>{vip.next ? t('player.toNext', { exp: fmt(vip.toNext), level: vip.next.level }) : t('player.maxLevel')}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Selected level detail */}
          <section className="glass flex flex-col gap-3 p-5">
            <div className="flex items-center gap-3">
              <VipEmblem level={selected} size={56} />
              <div>
                <div className="font-display text-2xl font-bold" style={{ color: tierColor }}>
                  VIP {selected}
                </div>
                <div className="text-xs text-white/50">{t('vip.requires', { exp: fmt(level.exp) })}</div>
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs uppercase tracking-widest text-white/50">{t('vip.dailyReward')}</div>
              <div className="grid grid-cols-2 gap-2">
                {(['silver', 'gold'] as const).map((c) => (
                  <div key={c} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <CurrencyIcon currency={c} size={40} />
                    <div>
                      <div className={`font-display text-xl font-bold tabular-nums ${c === 'gold' ? 'text-gold-100' : ''}`}>{fmt(level.daily[c])}</div>
                      <div className="text-[11px] text-white/50">{t(`currency.${c}`)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-white/40">{t('vip.dailyNote')}</p>
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-widest text-white/50">{t('vip.perks')}</div>
              <p className="rounded-xl border border-dashed border-white/15 px-3 py-2 text-sm text-white/55">{t('vip.perksPending')}</p>
            </div>
          </section>
        </div>

        {/* Level track */}
        <section className="glass p-4">
          <h2 className="mb-3 font-display text-lg text-gold">{t('vip.levels')}</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {VIP_LEVELS.map((l) => {
              const reached = l.level <= vip.level;
              const active = l.level === selected;
              return (
                <button
                  key={l.level}
                  onClick={() => setSelected(l.level)}
                  className={`flex w-20 shrink-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 transition ${
                    active ? 'border-gold-300/70 bg-gold-300/10 shadow-glow' : 'border-white/5 bg-black/20 hover:border-white/20'
                  }`}
                >
                  <VipEmblem level={l.level} size={46} dim={!reached && !active} />
                  <span className={`text-xs font-bold ${reached ? 'text-white' : 'text-white/45'}`}>VIP {l.level}</span>
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
