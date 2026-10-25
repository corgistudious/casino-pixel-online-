import { useEffect, useState } from 'react';
import { adminApi } from '../net/adminApi';
import { DailyBars, Panel, Pill, Stat, Table } from './parts';
import { useAdminKit } from './useAdmin';

interface Dashboard {
  players: { total: number; newToday: number; new7d: number; pendingVerification: number; test: number; banned: number };
  rounds: { total: number; last24h: number; open: number; wagered24h: number; paid24h: number };
  circulation: { silver: number; gold: number };
  progression: { maxLevel: number; level10: number; season: string | null; ranked: number; topEligible: number };
  online: number;
  series: { day: string; registrations: number; rounds: number; wagered: number; activePlayers: number }[];
  alerts: { level: 'info' | 'warning' | 'critical'; code: string; count?: number }[];
  recentTransactions: { id: number; uid: number; username: string; currency: string; delta: number; balanceAfter: number; reason: string; createdAt: string }[] | null;
}

const ALERT_TONE = { info: 'cyan', warning: 'gold', critical: 'ruby' } as const;

export function DashboardPage() {
  const { t, fmt, date, fail } = useAdminKit();
  const [d, setD] = useState<Dashboard | null>(null);

  useEffect(() => {
    const load = () => void adminApi<Dashboard>('/api/admin/dashboard').then(setD, fail);
    load();
    // Live numbers (online count, rounds) refresh every 30 s while the page is open.
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!d) return <p className="text-white/50">{t('app.loading')}</p>;
  const n = (v: number) => fmt(v);
  return (
    <>
      <h1 className="font-display text-2xl">{t('admin.nav.dashboard')}</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('admin.dash.players')} value={n(d.players.total)} hint={d.players.test ? `${t('admin.dash.test')}: ${n(d.players.test)}` : undefined} />
        <Stat label={t('admin.dash.online')} value={n(d.online)} />
        <Stat label={t('admin.dash.newToday')} value={n(d.players.newToday)} hint={`${t('admin.dash.new7d')}: ${n(d.players.new7d)}`} />
        <Stat label={t('admin.dash.banned')} value={n(d.players.banned)} hint={`${t('admin.dash.pending')}: ${n(d.players.pendingVerification)}`} />
        <Stat label={t('admin.dash.rounds')} value={n(d.rounds.total)} hint={`${t('admin.dash.roundsToday')}: ${n(d.rounds.last24h)}`} />
        <Stat label={t('admin.dash.wagered24h')} value={n(d.rounds.wagered24h)} hint={`${t('admin.dash.paid24h')}: ${n(d.rounds.paid24h)}`} />
        <Stat label={t('admin.dash.silver')} value={n(d.circulation.silver)} />
        <Stat label={t('admin.dash.gold')} value={n(d.circulation.gold)} hint={d.rounds.open ? `${t('admin.dash.openRounds')}: ${n(d.rounds.open)}` : undefined} />
        <Stat label={t('admin.dash.season')} value={d.progression.season ?? '—'} hint={`${t('admin.dash.rankedPlayers')}: ${n(d.progression.ranked)}`} />
        <Stat label={t('admin.dash.topEligible')} value={n(d.progression.topEligible)} />
        <Stat label={t('admin.dash.maxLevel')} value={n(d.progression.maxLevel)} hint={`${t('admin.dash.level10')}: ${n(d.progression.level10)}`} />
      </div>

      <Panel title={t('admin.dash.alerts')}>
        {d.alerts.length === 0 ? (
          <p className="text-sm text-white/50">{t('admin.dash.noAlerts')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {d.alerts.map((a) => (
              <li key={a.code} className="flex items-start gap-2 text-sm text-white/80">
                <Pill tone={ALERT_TONE[a.level]}>{t(`admin.levels.${a.level}`)}</Pill>
                <span>{t(`admin.alerts.${a.code}`, { count: a.count ?? 0, defaultValue: a.code })}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t('admin.dash.activity')}>
        <div className="grid gap-5 md:grid-cols-3">
          <DailyBars title={t('admin.dash.registrations')} data={d.series.map((s) => ({ day: s.day, value: s.registrations }))} format={n} />
          <DailyBars title={t('admin.dash.roundsChart')} data={d.series.map((s) => ({ day: s.day, value: s.rounds }))} format={n} />
          <DailyBars title={t('admin.dash.activePlayers')} data={d.series.map((s) => ({ day: s.day, value: s.activePlayers }))} format={n} />
        </div>
      </Panel>

      {d.recentTransactions && (
        <Panel title={t('admin.dash.recentTx')}>
          <Table
            empty={t('admin.dash.noTx')}
            head={[t('admin.fields.time'), t('admin.fields.uid'), t('admin.fields.reason'), t('admin.fields.delta'), t('admin.fields.balanceAfter')]}
            rows={d.recentTransactions.map((x) => [
              date(x.createdAt),
              `#${x.uid} ${x.username}`,
              x.reason,
              <span key="d" className={x.delta < 0 ? 'text-ruby-400' : 'text-emerald-400'}>
                {x.delta > 0 ? '+' : ''}
                {n(x.delta)} {t(`currency.${x.currency}`)}
              </span>,
              n(x.balanceAfter),
            ])}
          />
        </Panel>
      )}
    </>
  );
}
