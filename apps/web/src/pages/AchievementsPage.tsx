import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../net/api';
import { AppShell, PageHeader } from '../ui/AppShell';
import { toast } from '../ui/toast';
import { useSession } from '../store/session';

type Achievement = { id: string; rounds: number; silver: number; completed: boolean; claimed: boolean };
const TITLES: Record<string, [string, string]> = {
  first_game: ['Trận đấu đầu tiên', 'First game'],
  ten_games: ['Người chơi chăm chỉ', 'Active player'],
  hundred_games: ['Cao thủ trăm trận', 'Hundred-game veteran'],
  thousand_games: ['Huyền thoại nghìn trận', 'Thousand-game legend'],
};
export function AchievementsPage() {
  const { i18n } = useTranslation();
  const vi = i18n.language.startsWith('vi');
  const [items, setItems] = useState<Achievement[]>([]);
  const [rounds, setRounds] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = async () => {
    const r = await api<{ rounds: number; achievements: Achievement[] }>('/api/achievements');
    setItems(r.achievements); setRounds(r.rounds);
  };
  useEffect(() => { void refresh().catch(() => {}); }, []);
  const claim = async (id: string) => {
    setBusy(id);
    try {
      await api(`/api/achievements/${id}/claim`, { method: 'POST' });
      const { user } = await api<{ user: NonNullable<ReturnType<typeof useSession.getState>['user']> }>('/api/me');
      useSession.getState().setUser(user);
      await refresh();
      toast(vi ? 'Đã nhận thưởng thành tích' : 'Achievement reward claimed', 'success');
    } catch (err) { toast(err instanceof Error ? err.message : 'Error', 'error'); }
    finally { setBusy(null); }
  };
  return <AppShell><div className="flex flex-col gap-4 p-4">
    <PageHeader icon="collection" title={vi ? 'Thành tích' : 'Achievements'} subtitle={vi ? `Đã hoàn thành ${rounds} trận` : `${rounds} completed games`} />
    <div className="grid gap-3 md:grid-cols-2">{items.map(a => <section key={a.id} className="glass flex flex-col gap-3 p-4">
      <h2 className="font-bold text-amber-300">{TITLES[a.id]?.[vi ? 0 : 1] ?? a.id}</h2>
      <div className="text-sm text-white/60">{Math.min(rounds, a.rounds)} / {a.rounds} · +{a.silver.toLocaleString()} {vi ? 'Cxu Bạc' : 'Silver Cxu'}</div>
      <div className="h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-amber-500" style={{ width: `${Math.min(100, rounds / a.rounds * 100)}%` }} /></div>
      <button disabled={!a.completed || a.claimed || busy !== null} className="rounded-xl bg-amber-500 p-2 font-bold text-black disabled:opacity-40" onClick={() => void claim(a.id)}>
        {a.claimed ? (vi ? 'Đã nhận' : 'Claimed') : (vi ? 'Nhận thưởng' : 'Claim reward')}
      </button>
    </section>)}</div>
  </div></AppShell>;
}
