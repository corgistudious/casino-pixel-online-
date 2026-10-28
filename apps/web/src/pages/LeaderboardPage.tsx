import type { CharmBoardEntry, LeaderboardEntry } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { PlayerAvatar } from '../players/identity';
import { PlayerTrigger } from '../players/PlayerActions';
import { useSession } from '../store/session';
import { AppShell, CharmIcon, PageHeader } from '../ui/AppShell';
import { Medal } from '../ui/Avatar';
import { Amount, PlayerName } from '../ui/OfficialAssets';

/** Wealth ranking (unchanged) and the separate Charm Points ranking. */
export function LeaderboardPage() {
  const { t, i18n } = useTranslation();
  const me = useSession((s) => s.user);
  const [board, setBoard] = useState<'wealth' | 'charm'>('wealth');
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [charm, setCharm] = useState<CharmBoardEntry[] | null>(null);

  useEffect(() => {
    void api<{ entries: LeaderboardEntry[] }>('/api/leaderboard').then((r) => setEntries(r.entries), () => setEntries([]));
  }, []);
  useEffect(() => {
    if (board === 'charm' && charm === null) void api<{ entries: CharmBoardEntry[] }>('/api/charm/leaderboard').then((r) => setCharm(r.entries), () => setCharm([]));
  }, [board, charm]);

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <PageHeader icon="leaderboard" title={t('nav.leaderboard')} />
        <div className="flex gap-1" role="tablist">
          {(['wealth', 'charm'] as const).map((b) => (
            <button
              key={b}
              type="button"
              role="tab"
              aria-selected={board === b}
              onClick={() => setBoard(b)}
              className={`rounded-full border px-4 py-1.5 text-sm ${board === b ? 'border-gold-300/70 bg-gold-300/15 text-gold-100' : 'border-white/10 text-white/60 hover:bg-white/10'}`}
            >
              {t(`identity.boards.${b}`)}
            </button>
          ))}
        </div>
        <div className="glass w-full max-w-3xl p-2">
          {board === 'wealth' ? (
            <>
              {entries === null && <p className="p-4 text-center text-white/50">{t('app.loading')}</p>}
              <ul>
                {entries?.map((e, i) => (
                  <li
                    key={e.username}
                    className={`flex animate-rise items-center gap-3 rounded-xl px-3 py-2 ${e.username === me?.username ? 'bg-gold-300/10 ring-1 ring-gold-300/40' : i % 2 ? '' : 'bg-white/[0.03]'}`}
                    style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}
                  >
                    <Medal rank={e.rank} />
                    <PlayerTrigger uid={e.uid} label={e.displayName} context="leaderboard" className="flex min-w-0 flex-1 items-center gap-3">
                      <PlayerAvatar player={e} size={34} animated={e.rank === 1} />
                      <PlayerName name={e.displayName} badges={e.badges} className="flex-1" />
                    </PlayerTrigger>
                    <Amount currency="silver" value={formatChips(e.balance, i18n.language)} size={20} className="font-semibold" />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="px-3 pb-2 pt-1 text-[11px] text-white/45">{t('identity.charmBoardNote')}</p>
              {charm === null && <p className="p-4 text-center text-white/50">{t('app.loading')}</p>}
              {charm?.length === 0 && <p className="p-4 text-center text-white/50">{t('identity.charmBoardEmpty')}</p>}
              <ul>
                {charm?.map((e, i) => (
                  <li key={e.uid} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${e.uid === me?.uid ? 'bg-pink-400/10 ring-1 ring-pink-300/40' : i % 2 ? '' : 'bg-white/[0.03]'}`}>
                    <Medal rank={e.position} />
                    <PlayerTrigger uid={e.uid} label={e.displayName} context="leaderboard:charm" className="min-w-0 flex-1 truncate text-sm text-white">
                      {e.displayName}
                    </PlayerTrigger>
                    <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-pink-100">
                      <CharmIcon size={18} />
                      {formatChips(e.charm, i18n.language)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
