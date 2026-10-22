import type { LeaderboardEntry } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { useSession } from '../store/session';
import { Avatar, Medal } from '../ui/Avatar';
import { TopBar } from '../ui/Chrome';

export function LeaderboardPage() {
  const { t, i18n } = useTranslation();
  const me = useSession((s) => s.user);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    void api<{ entries: LeaderboardEntry[] }>('/api/leaderboard').then((r) => setEntries(r.entries), () => setEntries([]));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TopBar title={t('leaderboard.title')} back />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="glass mx-auto max-w-2xl p-2">
          {entries === null && <p className="p-4 text-center text-white/50">{t('app.loading')}</p>}
          <ul>
            {entries?.map((e, i) => (
              <li
                key={e.username}
                className={`flex animate-rise items-center gap-3 rounded-xl px-3 py-2 ${e.username === me?.username ? 'bg-gold-300/10 ring-1 ring-gold-300/40' : i % 2 ? '' : 'bg-white/[0.03]'}`}
                style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}
              >
                <Medal rank={e.rank} />
                <Avatar index={e.avatar} size={34} frame={e.rank <= 3 ? 'gold' : 'none'} animated={e.rank === 1} />
                <span className="min-w-0 flex-1 truncate">{e.displayName}</span>
                <span className="font-semibold tabular-nums text-gold-100">{formatChips(e.balance, i18n.language)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
