import type { LeaderboardEntry } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { useSession } from '../store/session';
import { Avatar, Medal } from '../ui/Avatar';
import { PlayerTrigger } from '../players/PlayerActions';
import { AppShell, PageHeader } from '../ui/AppShell';
import { Amount, PlayerName } from '../ui/OfficialAssets';

export function LeaderboardPage() {
  const { t, i18n } = useTranslation();
  const me = useSession((s) => s.user);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    void api<{ entries: LeaderboardEntry[] }>('/api/leaderboard').then((r) => setEntries(r.entries), () => setEntries([]));
  }, []);

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <PageHeader icon="leaderboard" title={t('nav.leaderboard')} />
        <div className="glass w-full max-w-3xl p-2">
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
                  <Avatar index={e.avatar} avatarItem={e.avatarItem} size={34} frame={e.frame} animated={e.rank === 1} />
                  <PlayerName name={e.displayName} badges={e.badges} className="flex-1" />
                </PlayerTrigger>
                <Amount currency="silver" value={formatChips(e.balance, i18n.language)} size={20} className="font-semibold" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
