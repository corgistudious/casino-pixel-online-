import type { FairnessInfo, PlayerStats, PublicUser, RevealedSeed, RoundSummary } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../lib/format';
import { api, ApiError } from '../net/api';
import { useSession } from '../store/session';
import { Avatar, avatarCount } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { TopBar } from '../ui/Chrome';
import { toast } from '../ui/toast';

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const signOut = useSession((s) => s.signOut);
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
    <div className="flex h-full flex-col">
      <TopBar title={t('profile.title')} back />
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-2">
        <section className="glass flex flex-col gap-4 p-5">
          <div className="flex items-center gap-4">
            <Avatar index={avatar} size={72} animated />
            <div>
              <h2 className="font-display text-2xl font-semibold">{user.displayName}</h2>
              <p className="text-sm text-white/50">@{user.username}</p>
              <p className="text-xs text-white/40">{t('profile.memberSince', { date: new Date(user.createdAt).toLocaleDateString(i18n.language) })}</p>
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-white/60">{t('auth.displayName')}</span>
            <input className="field" value={displayName} maxLength={24} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <div>
            <p className="mb-2 text-sm text-white/60">{t('profile.avatar')}</p>
            <div className="grid grid-cols-8 gap-2">
              {Array.from({ length: avatarCount() }, (_, i) => (
                <button key={i} onClick={() => setAvatar(i)} className={`rounded-full transition ${i === avatar ? 'scale-110 shadow-glow' : 'opacity-70 hover:opacity-100'}`}>
                  <Avatar index={i} size={36} frame={i === avatar ? 'gold' : 'none'} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="gold" onClick={() => void save()}>
              {t('profile.save')}
            </Button>
            <Button variant="ruby" onClick={signOut} className="ml-auto">
              {t('nav.logout')}
            </Button>
          </div>
        </section>

        <section className="glass flex flex-col gap-3 p-5">
          <h3 className="font-display text-xl">{t('profile.stats')}</h3>
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
          <h3 className="mt-2 font-display text-xl">{t('profile.history')}</h3>
          {history.length === 0 && <p className="text-sm text-white/50">{t('profile.noHistory')}</p>}
          <div className="max-h-64 overflow-y-auto">
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
                    <td className="py-1.5">{t(`games.${r.game}.name`)}</td>
                    <td className="tabular-nums">{fmt(r.bet)}</td>
                    <td className={`tabular-nums ${r.payout > r.bet ? 'text-emerald-400' : r.payout === 0 ? 'text-white/40' : ''}`}>{fmt(r.payout)}</td>
                    <td className="text-right text-xs text-white/40">{new Date(r.createdAt).toLocaleTimeString(i18n.language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass flex flex-col gap-3 p-5 lg:col-span-2">
          <h3 className="font-display text-xl">{t('fairness.title')}</h3>
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
              <div className="text-white/40">
                {t('fairness.clientSeed')}: <span className="font-mono">{revealed.clientSeed}</span> · {t('fairness.nonce')}: {revealed.finalNonce}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
