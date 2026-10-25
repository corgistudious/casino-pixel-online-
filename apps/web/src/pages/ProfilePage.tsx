import { type FairnessInfo, type PlayerStats, type PublicUser, type RevealedSeed, type RoundSummary } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { DEMO_EXTRAS, IS_DEMO } from '../demo';
import { formatChips } from '../lib/format';
import { api, ApiError } from '../net/api';
import { useSession } from '../store/session';
import { ProgressStrip } from '../ui/ProgressStrip';
import { TitleBadge } from '../ui/Cosmetics';
import { AppShell, CharmIcon, DemoTag, VipMeter } from '../ui/AppShell';
import { Avatar, avatarCount } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { GameArt } from '../ui/Icons';
import { BadgeIcon, CurrencyIcon, PlayerName } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';

const TABS = ['overview', 'history', 'fairness'] as const;
type Tab = (typeof TABS)[number];
const STAT_GAMES = ['roulette', 'sicbo', 'blackjack'] as const;

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const signOut = useSession((s) => s.signOut);
  const balance = useSession((s) => s.balance);
  const gold = useSession((s) => s.gold);
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [history, setHistory] = useState<RoundSummary[]>([]);
  const [fair, setFair] = useState<FairnessInfo | null>(null);
  const [revealed, setRevealed] = useState<RevealedSeed | null>(null);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatar, setAvatar] = useState(user.avatar);
  const [clientSeed, setClientSeed] = useState('');
  const fmt = (n: number) => formatChips(n, i18n.language);
  const fail = (err: unknown) => toast(t(`errors.${err instanceof ApiError ? err.code : 'internal'}`), 'error');

  useEffect(() => {
    void api<{ stats: PlayerStats }>('/api/me/stats').then((r) => setStats(r.stats), fail);
    void api<{ rounds: RoundSummary[] }>('/api/me/history').then((r) => setHistory(r.rounds), fail);
    void api<FairnessInfo>('/api/me/fairness').then((r) => {
      setFair(r);
      setClientSeed(r.clientSeed);
    }, fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    try {
      const { user: fresh } = await api<{ user: PublicUser }>('/api/me', { method: 'PATCH', body: { displayName, avatar } });
      setUser(fresh);
      toast(t('profile.saved'), 'success');
    } catch (err) {
      fail(err);
    }
  };

  const rotate = async () => {
    try {
      const r = await api<{ revealed: RevealedSeed; next: FairnessInfo }>('/api/me/fairness/rotate', {
        method: 'POST',
        body: clientSeed.trim() ? { clientSeed: clientSeed.trim() } : {},
      });
      setRevealed(r.revealed);
      setFair(r.next);
    } catch (err) {
      fail(err);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        {/* Profile header */}
        <section className="relative overflow-hidden rounded-2xl border border-gold-300/25 shadow-panel">
          <div className="absolute inset-0 bg-gradient-to-r from-ink-800 via-[#0b2a3a] to-emerald-800" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_30%,rgba(242,193,78,0.22),transparent_45%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(115deg,transparent_0_38px,rgba(255,241,184,0.04)_38px_40px)]" />
          <div className="relative flex flex-wrap items-center gap-4 p-4 lg:gap-6 lg:p-6">
            <Avatar index={avatar} frame={user.frame} avatarItem={user.avatarItem} size={104} />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-bold lg:text-3xl">
                <PlayerName name={user.displayName} badges={user.badges} size={26} />
              </h1>
              {user.title && (
                <div className="mt-1">
                  <TitleBadge itemId={user.title} />
                </div>
              )}
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-white/55">
                <span className="tabular-nums">{t('player.id', { id: user.uid })}</span>
                <span>@{user.username}</span>
                <span>{t('profile.memberSince', { date: new Date(user.createdAt).toLocaleDateString(i18n.language) })}</span>
              </div>
              <div className="mt-3">
                <VipMeter />
              </div>
              <div className="mt-2">
                <ProgressStrip />
              </div>
            </div>
            <div className="grid w-full grid-cols-3 gap-2 sm:w-auto">
              {(['silver', 'gold'] as const).map((c) => (
                <div key={c} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                  <CurrencyIcon currency={c} size={34} />
                  <div>
                    <div className="text-[10px] text-white/50">{t(`currency.${c}`)}</div>
                    <div className={`font-bold tabular-nums ${c === 'gold' ? 'text-gold-100' : ''}`}>{fmt(c === 'gold' ? gold : balance)}</div>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 rounded-xl border border-pink-300/20 bg-black/30 px-3 py-2" title={t('player.charmDesc')}>
                <CharmIcon size={30} />
                <div>
                  <div className="flex items-center gap-1 text-[10px] text-white/50">
                    {t('player.charm')} <DemoTag />
                  </div>
                  <div className="font-bold tabular-nums text-pink-100">{fmt(DEMO_EXTRAS.charm)}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-1">
          {TABS.map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === key ? 'bg-gold-sheen text-ink-900 shadow-button' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              {t(key === 'overview' ? 'profile.overview' : key === 'history' ? 'profile.history' : 'profile.fairnessTab')}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="glass flex flex-col gap-3 p-4">
              <h2 className="font-display text-lg text-gold">{t('profile.stats')}</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {stats &&
                  (
                    [
                      ['profile.rounds', String(stats.rounds)],
                      ['profile.wagered', fmt(stats.wagered)],
                      ['profile.won', fmt(stats.won)],
                      ['profile.biggestWin', fmt(stats.biggestWin)],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-black/25 px-3 py-2">
                      <div className="text-xs text-white/50">{t(k)}</div>
                      <div className="font-semibold tabular-nums text-gold-100">{v}</div>
                    </div>
                  ))}
              </div>
              {stats && (
                <div className="flex flex-col gap-2">
                  {STAT_GAMES.map((g) => {
                    const s = stats.byGame[g];
                    const share = stats.rounds ? s.rounds / stats.rounds : 0;
                    return (
                      <div key={g} className="flex items-center gap-3">
                        <div className="h-9 w-14 shrink-0 overflow-hidden rounded-md">
                          <GameArt game={g} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between text-xs">
                            <span className="truncate">{t(`games.${g}.name`)}</span>
                            <span className="tabular-nums text-white/50">{s.rounds}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-black/40">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-gold-300" style={{ width: `${share * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {user.badges.length > 0 && (
                <div className="flex flex-col gap-2">
                  {user.badges.map((b) => (
                    <div key={b} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <BadgeIcon badge={b} size={34} />
                      <div>
                        <div className="text-sm font-semibold">{t(`badges.${b}`)}</div>
                        <div className="text-xs text-white/50">{t(`badges.${b}Desc`)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="glass flex flex-col gap-3 p-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-white/60">{t('auth.displayName')}</span>
                <input className="field" value={displayName} maxLength={24} onChange={(e) => setDisplayName(e.target.value)} />
              </label>
              <div>
                <p className="mb-2 text-sm text-white/60">{t('profile.avatar')}</p>
                <div className="grid grid-cols-8 gap-2">
                  {Array.from({ length: avatarCount() }, (_, i) => (
                    <button key={i} onClick={() => setAvatar(i)} className={`mx-auto w-fit rounded-full transition ${i === avatar ? 'scale-110 shadow-glow' : 'opacity-70 hover:opacity-100'}`}>
                      <Avatar index={i} size={34} frame={i === avatar ? user.frame : 'none'} />
                    </button>
                  ))}
                </div>
              </div>
              <Link to="/market" className="glass flex items-center justify-center gap-2 py-2 text-sm hover:border-gold-300/40">
                <CurrencyIcon currency="gold" size={20} />
                {t('nav.market')} · {t('market.tabs.frames')}
              </Link>
              <div className="mt-auto flex gap-2">
                <Button variant="gold" onClick={() => void save()}>
                  {t('profile.save')}
                </Button>
                {!IS_DEMO && (
                  <Button variant="ruby" onClick={signOut} className="ml-auto">
                    {t('nav.logout')}
                  </Button>
                )}
              </div>
            </section>
          </div>
        )}

        {tab === 'history' && (
          <section className="glass p-4">
            {history.length === 0 && <p className="text-sm text-white/50">{t('profile.noHistory')}</p>}
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-white/40">
                <tr>
                  <th className="py-1">{t('profile.game')}</th>
                  <th>{t('play.bet')}</th>
                  <th>{t('play.win')}</th>
                  <th className="text-right">{t('profile.time')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="py-2">{t(`games.${r.game}.name`)}</td>
                    <td className="tabular-nums">{fmt(r.bet)}</td>
                    <td className={`tabular-nums ${r.payout > r.bet ? 'text-emerald-400' : r.payout === 0 ? 'text-white/40' : ''}`}>{fmt(r.payout)}</td>
                    <td className="text-right text-xs text-white/40">{new Date(r.createdAt).toLocaleTimeString(i18n.language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'fairness' && (
          <section className="glass flex flex-col gap-3 p-4">
            <h2 className="font-display text-lg text-gold">{t('fairness.title')}</h2>
            <p className="text-sm text-white/60">{t('fairness.explain')}</p>
            {fair && (
              <div className="grid gap-2 text-xs md:grid-cols-3">
                <div className="rounded-xl bg-black/25 px-3 py-2">
                  <div className="text-white/40">{t('fairness.serverSeedHash')}</div>
                  <div className="break-all font-mono text-gold-100">{fair.serverSeedHash}</div>
                </div>
                <label className="rounded-xl bg-black/25 px-3 py-2">
                  <div className="text-white/40">{t('fairness.clientSeed')}</div>
                  <input className="w-full bg-transparent font-mono text-white outline-none" value={clientSeed} maxLength={64} onChange={(e) => setClientSeed(e.target.value)} />
                </label>
                <div className="rounded-xl bg-black/25 px-3 py-2">
                  <div className="text-white/40">{t('fairness.nonce')}</div>
                  <div className="font-mono">{fair.nonce}</div>
                </div>
              </div>
            )}
            <Button className="self-start" onClick={() => void rotate()}>
              {t('fairness.rotate')}
            </Button>
            {revealed && (
              <div className="rounded-xl border border-gold-300/30 bg-gold-300/5 px-3 py-2 text-xs">
                <div className="text-white/50">{t('fairness.revealed')}</div>
                <div className="break-all font-mono text-gold-100">{revealed.serverSeed}</div>
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
