import { vipProgress, type MissionGroup, type MissionsOverview, type MissionView } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { socket } from '../net/socket';
import { useFail } from '../social/parts';
import { AppShell } from '../ui/AppShell';
import { Button } from '../ui/Button';
import { NavIcon } from '../ui/NavIcons';
import { CurrencyIcon } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';
import { VipEmblem } from '../ui/VipEmblem';

const GROUPS: { id: MissionGroup; tone: string; ring: string; icon: string }[] = [
  { id: 'daily', tone: 'from-sky-500/25 via-sky-500/5', ring: 'border-sky-300/30', icon: '☀️' },
  { id: 'weekly', tone: 'from-violet-500/25 via-violet-500/5', ring: 'border-violet-300/30', icon: '📅' },
  { id: 'rank', tone: 'from-amber-500/30 via-amber-500/5', ring: 'border-amber-300/40', icon: '🏆' },
];

/** Daily, weekly and rank missions with live progress, countdowns and one-tap claiming. */
export function MissionsPage() {
  const { t } = useTranslation();
  const fail = useFail();
  const [data, setData] = useState<MissionsOverview | null>(null);
  const [now, setNow] = useState(Date.now());
  const load = () => void api<MissionsOverview>('/api/missions').then(setData, fail);
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  // A settled round or ranked match moves progress: refresh quietly when the wallet changes.
  useEffect(() => socket.listen((ev) => ev.event === 'wallet' && load()), []); // eslint-disable-line react-hooks/exhaustive-deps

  const total = data?.missions.length ?? 0;
  const done = data?.missions.filter((m) => m.claimed).length ?? 0;
  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <section className="relative overflow-hidden rounded-3xl border border-emerald-300/25 bg-gradient-to-br from-[#0c3b2e] via-[#0f1d33] to-[#24113d] p-5 shadow-panel">
          <div className="pointer-events-none absolute -left-10 -top-16 h-56 w-56 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-300/40 bg-black/30">
              <NavIcon name="missions" size={30} active />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-3xl font-heading text-white">{t('missions.title')}</h1>
              <p className="text-sm text-white/60">{t('missions.subtitle')}</p>
            </div>
            {data && (
              <div className="flex items-center gap-4">
                <Ring value={total ? done / total : 0} label={t('missions.done', { done, total })} />
                <div className="flex items-center gap-2 rounded-2xl border border-gold-300/30 bg-black/30 px-3 py-2">
                  <VipEmblem level={vipProgress(data.vip.exp).level} size={34} />
                  <div className="text-xs">
                    <div className="font-label text-gold-100">{t('missions.vipCap', { granted: data.vip.weekGranted, cap: data.vip.weekCap })}</div>
                    <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-black/50">
                      <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-200" style={{ width: `${Math.min(100, (data.vip.weekGranted / data.vip.weekCap) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
        {!data ? (
          <p className="text-white/50">{t('app.loading')}</p>
        ) : (
          GROUPS.map((g) => {
            const list = data.missions.filter((m) => m.group === g.id);
            return (
              <section key={g.id} className={`overflow-hidden rounded-3xl border ${g.ring} bg-gradient-to-br ${g.tone} to-black/30`}>
                <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
                  <h2 className="font-display text-xl font-heading text-white">
                    <span aria-hidden>{g.icon}</span> {t(`missions.groups.${g.id}`)}
                  </h2>
                  <span className="text-xs text-white/50">{t(`missions.groupHint.${g.id}`)}</span>
                </header>
                <ul className="grid gap-3 p-4 md:grid-cols-2">
                  {list.map((m) => (
                    <MissionCard key={m.id} m={m} now={now} onClaimed={load} />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </AppShell>
  );
}

function Ring({ value, label }: { value: number; label: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-2">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
        <circle cx="28" cy="28" r={r} fill="none" stroke="#7ff0a8" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value)} transform="rotate(-90 28 28)" className="transition-all duration-700" />
      </svg>
      <span className="text-sm font-label text-emerald-200">{label}</span>
    </div>
  );
}

function countdown(t: (k: string, o?: Record<string, unknown>) => string, iso: string, now: number) {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${t('missions.days', { n: d })} ${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

function MissionCard({ m, now, onClaimed }: { m: MissionView; now: number; onClaimed: () => void }) {
  const { t, i18n } = useTranslation();
  const fail = useFail();
  const [busy, setBusy] = useState(false);
  const fmt = (n: number) => formatChips(n, i18n.language);
  const isDivision = m.metric === 'peak_division';
  const ratio = isDivision ? (m.progress >= m.target ? 1 : 0) : Math.min(1, m.progress / m.target);
  const complete = ratio >= 1 && !m.unavailable;
  const claim = async () => {
    setBusy(true);
    try {
      await api('/api/missions/claim', { method: 'POST', body: { id: m.id } });
      toast(t('missions.got'), 'success');
      onClaimed();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={`relative flex flex-col gap-3 rounded-2xl border p-4 transition ${m.claimed ? 'border-white/5 bg-black/30 opacity-70' : complete ? 'border-emerald-300/50 bg-emerald-500/10 shadow-[0_0_24px_-8px_rgba(127,240,168,0.6)]' : 'border-white/10 bg-black/30'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-strong text-white">{t(`missions.names.${m.id}`, { target: fmt(m.target) })}</h3>
          <p className="text-[11px] text-white/45">
            {m.unavailable ? t('missions.unavailable') : m.resetsAt ? t(m.period === 'season' ? 'missions.seasonEnds' : 'missions.resetsIn', { time: countdown(t, m.resetsAt, now) }) : ''}
          </p>
        </div>
        {m.claimed ? (
          <span className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-label text-white/60">✓ {t('missions.claimed')}</span>
        ) : (
          <Button size="sm" variant={complete ? 'gold' : 'glass'} disabled={!complete || busy} onClick={() => void claim()}>
            {complete ? t('missions.claim') : t('missions.inProgress')}
          </Button>
        )}
      </div>
      {!isDivision && (
        <div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
            <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${complete ? 'bg-gradient-to-r from-emerald-400 to-lime-200' : 'bg-gradient-to-r from-sky-500 to-cyan-300'}`} style={{ width: `${ratio * 100}%` }} />
          </div>
          <div className="mt-1 text-right text-[11px] tabular-nums text-white/55">
            {fmt(Math.min(m.progress, m.target))}/{fmt(m.target)}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-white/45">{t('missions.reward')}:</span>
        {!!m.reward.silver && (
          <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 font-label">
            <CurrencyIcon currency="silver" size={16} /> {fmt(m.reward.silver)}
          </span>
        )}
        {!!m.reward.gold && (
          <span className="flex items-center gap-1 rounded-full bg-gold-300/10 px-2 py-0.5 font-label text-gold-100">
            <CurrencyIcon currency="gold" size={16} /> {fmt(m.reward.gold)}
          </span>
        )}
        {!!m.reward.vipExp && <span className="rounded-full bg-gradient-to-r from-gold-500/30 to-amber-300/20 px-2 py-0.5 font-label text-gold-100">{t('missions.vipExp', { n: m.reward.vipExp })}</span>}
      </div>
    </li>
  );
}
