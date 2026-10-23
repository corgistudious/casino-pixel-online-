import { ECONOMY } from '@casino/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatChips } from '../lib/format';
import { api, ApiError } from '../net/api';
import { useSession } from '../store/session';
import { AppShell } from '../ui/AppShell';
import { Button } from '../ui/Button';
import { GameArt, WheelArt, type HubGameKey } from '../ui/Icons';
import { BadgeIcon, CurrencyIcon } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';
import { CheckinPanel } from './CheckinPanel';
import { WelcomeModal } from './WelcomeModal';

/** Official hub line-up. Royal Slots stays in the codebase (route /play/slots) but is hidden here. */
const HUB_GAMES: { key: HubGameKey; live: boolean }[] = [
  { key: 'poker', live: false },
  { key: 'sicbo', live: true },
  { key: 'roulette', live: true },
  { key: 'lieng', live: false },
  { key: 'xito', live: false },
  { key: 'blackjack', live: true },
];

function Hero() {
  const { t } = useTranslation();
  return (
    <section className="relative overflow-hidden rounded-2xl border border-gold-300/25 bg-gradient-to-br from-ink-800 via-[#0b2a3a] to-emerald-800 shadow-panel">
      {/* Light beams and glow */}
      <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-gold-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-10 h-64 w-96 rounded-full bg-emerald-400/25 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(115deg,transparent_0_38px,rgba(255,241,184,0.05)_38px_40px)]" />
      <span className="sheen opacity-60" />
      <div className="relative grid items-center gap-2 p-4 sm:grid-cols-[1.6fr_1fr] lg:px-7 lg:py-5 short:gap-1 short:px-4 short:py-2.5">
        <div className="flex flex-col gap-2 lg:gap-3">
          <span className="w-fit rounded-full border border-gold-300/40 short:hidden bg-black/30 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-200">
            {t('hub.heroKicker')}
          </span>
          <h2 className="font-display text-2xl font-bold leading-tight text-white drop-shadow xl:text-4xl short:text-xl">{t('hub.heroTitle')}</h2>
          <p className="hidden max-w-lg text-sm text-white/70 md:block short:!hidden">{t('hub.heroBody')}</p>
          <Link to="/play/roulette" className="w-fit">
            <Button variant="gold" size="md" className="mt-1 xl:h-12 xl:px-7 xl:text-base short:h-8 short:text-xs">
              {t('hub.heroCta')}
            </Button>
          </Link>
        </div>
        <div className="relative hidden h-32 sm:block xl:h-48 short:h-20">
          <div className="absolute inset-4 rounded-full bg-gold-300/25 blur-2xl" />
          <div className="absolute inset-0 animate-[spin_30s_linear_infinite]">
            <WheelArt />
          </div>
        </div>
      </div>
    </section>
  );
}

function GameTile({ game, live, index }: { game: HubGameKey; live: boolean; index: number }) {
  const { t } = useTranslation();
  const body = (
    <>
      <div className="relative aspect-[2/1] overflow-hidden">
        <div className={`h-full w-full transition duration-500 ${live ? 'group-hover:scale-105' : 'scale-100 saturate-[0.7]'}`}>
          <GameArt game={game} />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-900/90 via-transparent to-transparent" />
        {live ? (
          <>
            <span className="sheen opacity-0 transition group-hover:opacity-100" />
            <span className="absolute bottom-2 right-2 rounded-lg bg-gold-sheen px-3 py-1 text-xs font-bold text-ink-900 shadow-button transition group-hover:scale-105">
              {t('hub.playNow')}
            </span>
          </>
        ) : (
          <span className="absolute right-2 top-2 rounded-full border border-gold-300/40 bg-ink-950/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-200 backdrop-blur">
            {t('hub.comingSoon')}
          </span>
        )}
      </div>
      <div className="px-3 py-2">
        <h3 className="truncate font-display text-[15px] font-semibold lg:text-lg">{t(`games.${game}.name`)}</h3>
        <p className="truncate text-[11px] text-white/50 lg:text-xs">{t(`games.${game}.desc`)}</p>
      </div>
    </>
  );
  const cls = `group glass animate-rise overflow-hidden p-0 transition ${
    live ? 'hover:-translate-y-1 hover:border-gold-300/50 hover:shadow-glow' : 'cursor-default opacity-90'
  }`;
  const style = { animationDelay: `${index * 60}ms` };
  return live ? (
    <Link to={`/play/${game}`} className={cls} style={style}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style} aria-disabled>
      {body}
    </div>
  );
}

export function HubPage() {
  const { t, i18n } = useTranslation();
  const balance = useSession((s) => s.balance);
  const bigWins = useSession((s) => s.bigWins);
  const setBalance = useSession((s) => s.setBalance);

  const rescue = async () => {
    try {
      const { balance } = await api<{ balance: number }>('/api/me/rescue', { method: 'POST' });
      setBalance(balance);
      toast(t('hub.rescueDone', { amount: formatChips(ECONOMY.rescueAmount, i18n.language) }), 'success');
    } catch (err) {
      toast(t(`errors.${err instanceof ApiError ? err.code : 'internal'}`), 'error');
    }
  };

  return (
    <AppShell>
      <WelcomeModal />
      <div className="grid gap-4 p-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Hero />
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold text-gold">{t('hub.games')}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {HUB_GAMES.map((g, i) => (
              <GameTile key={g.key} game={g.key} live={g.live} index={i} />
            ))}
          </div>
          <p className="text-[11px] text-white/35">{t('app.disclaimer')}</p>
        </div>

        <aside className="flex flex-col gap-4">
          <CheckinPanel />
          {balance < ECONOMY.rescueThreshold && (
            <Button variant="emerald" size="sm" onClick={() => void rescue()}>
              {t('hub.rescue', { amount: formatChips(ECONOMY.rescueAmount, i18n.language) })}
            </Button>
          )}
          <div className="glass flex min-h-0 flex-col gap-2 p-4">
            <h3 className="font-display text-lg">{t('hub.bigWins')}</h3>
            {bigWins.length === 0 && <p className="text-sm text-white/50">{t('hub.noBigWins')}</p>}
            <ul className="flex flex-col gap-1.5 text-sm">
              {bigWins.slice(0, 6).map((w) => (
                <li key={w.at + w.displayName} className="flex animate-rise items-center gap-2 rounded-lg bg-black/20 px-3 py-1.5">
                  <CurrencyIcon currency="silver" size={20} />
                  <span className="min-w-0 flex-1 truncate">
                    {t('hub.bigWinLine', { name: w.displayName, payout: formatChips(w.payout, i18n.language), game: t(`games.${w.game}.name`) })}
                  </span>
                  {(w.badges ?? []).map((b) => (
                    <BadgeIcon key={b} badge={b} size={16} />
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
