import { ECONOMY, GAME_KEYS, type PublicUser } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatChips, formatDuration } from '../lib/format';
import { api, ApiError } from '../net/api';
import { useSession } from '../store/session';
import { Button } from '../ui/Button';
import { BalancePill, TopBar } from '../ui/Chrome';
import { GameArt } from '../ui/Icons';
import { toast } from '../ui/toast';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function HubPage() {
  const { t, i18n } = useTranslation();
  const user = useSession((s) => s.user)!;
  const balance = useSession((s) => s.balance);
  const bigWins = useSession((s) => s.bigWins);
  const setUser = useSession((s) => s.setUser);
  const setBalance = useSession((s) => s.setBalance);
  const now = useNow();
  const nextBonus = user.nextDailyBonusAt ? new Date(user.nextDailyBonusAt).getTime() : 0;
  const bonusReady = nextBonus <= now;

  const claim = async () => {
    try {
      const { user: fresh } = await api<{ user: PublicUser }>('/api/me/daily-bonus', { method: 'POST' });
      setUser(fresh);
      toast(t('hub.claimed', { amount: formatChips(ECONOMY.dailyBonus, i18n.language) }), 'success');
    } catch (err) {
      toast(t(`errors.${err instanceof ApiError ? err.code : 'internal'}`), 'error');
    }
  };

  const rescue = async () => {
    try {
      const { balance } = await api<{ balance: number }>('/api/me/rescue', { method: 'POST' });
      setBalance(balance);
      toast(t('hub.claimed', { amount: formatChips(ECONOMY.rescueAmount, i18n.language) }), 'success');
    } catch (err) {
      toast(t(`errors.${err instanceof ApiError ? err.code : 'internal'}`), 'error');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_300px]">
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-white/50">{user.displayName}</p>
              <h1 className="font-display text-3xl font-bold text-gold">{t('hub.title')}</h1>
            </div>
            <BalancePill />
          </div>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {GAME_KEYS.map((game, i) => (
              <Link
                key={game}
                to={`/play/${game}`}
                className="group glass animate-rise overflow-hidden p-0 transition hover:-translate-y-1 hover:border-gold-300/40 hover:shadow-glow"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="relative aspect-[5/3] overflow-hidden">
                  <div className="h-full w-full transition duration-500 group-hover:scale-105">
                    <GameArt game={game} />
                  </div>
                  <span className="sheen opacity-0 group-hover:opacity-100" />
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-lg font-semibold">{t(`games.${game}.name`)}</h2>
                    <p className="truncate text-xs text-white/50">{t(`games.${game}.desc`)}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-gold-sheen px-3 py-1 text-xs font-bold text-ink-900">{t('hub.play')}</span>
                </div>
              </Link>
            ))}
          </div>
          <p className="text-[11px] text-white/35">{t('app.disclaimer')}</p>
        </section>

        <aside className="flex flex-col gap-4">
          <div className={`glass flex flex-col gap-3 p-4 ${bonusReady ? 'animate-pulse-glow' : ''}`}>
            <h3 className="font-display text-lg">{t('hub.dailyBonus')}</h3>
            {bonusReady ? (
              <Button variant="gold" onClick={() => void claim()}>
                {t('hub.claim', { amount: formatChips(ECONOMY.dailyBonus, i18n.language) })}
              </Button>
            ) : (
              <p className="text-sm text-white/60">{t('hub.nextBonus', { time: formatDuration(nextBonus - now) })}</p>
            )}
            {balance < ECONOMY.rescueThreshold && (
              <Button variant="emerald" size="sm" onClick={() => void rescue()}>
                {t('hub.rescue', { amount: formatChips(ECONOMY.rescueAmount, i18n.language) })}
              </Button>
            )}
          </div>
          <div className="glass flex min-h-0 flex-col gap-2 p-4">
            <h3 className="font-display text-lg">{t('hub.bigWins')}</h3>
            {bigWins.length === 0 && <p className="text-sm text-white/50">{t('hub.noBigWins')}</p>}
            <ul className="flex flex-col gap-1.5 text-sm">
              {bigWins.slice(0, 10).map((w) => (
                <li key={w.at + w.displayName} className="animate-rise rounded-lg bg-black/20 px-3 py-1.5">
                  {t('hub.bigWinLine', {
                    name: w.displayName,
                    payout: formatChips(w.payout, i18n.language),
                    game: t(`games.${w.game}.name`),
                  })}
                </li>
              ))}
            </ul>
          </div>
          <nav className="grid grid-cols-3 gap-2">
            <Link to="/leaderboard" className="glass py-2 text-center text-sm hover:border-gold-300/40">
              {t('nav.leaderboard')}
            </Link>
            <Link to="/profile" className="glass py-2 text-center text-sm hover:border-gold-300/40">
              {t('nav.profile')}
            </Link>
            <Link to="/settings" className="glass py-2 text-center text-sm hover:border-gold-300/40">
              {t('nav.settings')}
            </Link>
          </nav>
          {user.role === 'admin' && (
            <Link to="/admin" className="glass py-2 text-center text-sm text-neon-violet hover:border-neon-violet/50">
              {t('nav.admin')}
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
