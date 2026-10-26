import { useEffect, useState } from 'react';
import { api } from '../net/api';
import { toast } from '../ui/toast';

type Table = { id: string; game: string; nameVi?: string; nameEn?: string; name_vi?: string; name_en?: string; status: 'open' | 'paused' | 'closed' };
export function RoomsAdminPage() {
  const [round, setRound] = useState<Table[]>([]);
  const [cards, setCards] = useState<Table[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const refresh = async () => {
    try {
      const [a,b] = await Promise.all([api<{tables:Table[]}>('/api/tables'), api<{tables:Table[]}>('/api/cards/tables')]);
      setRound(a.tables); setCards(b.tables); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
  };
  useEffect(() => { void refresh(); }, []);
  const change = async (table: Table, card: boolean, status: 'open' | 'paused' | 'closed') => {
    setBusy(table.id);
    try {
      await api(`/api/admin/${card ? 'cards/tables' : 'tables'}/${encodeURIComponent(table.id)}`, { method:'PATCH', body: { status } });
      await refresh(); toast('Table updated', 'success');
    } catch(e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setBusy(null); }
  };
  return <div className="flex flex-col gap-5">
    <h1 className="font-display text-2xl font-bold text-gold-100">Quản lý bàn chơi / Table Management</h1>
    {error && <p className="text-red-300">{error}</p>}
    {([{title:'Tài Xỉu & Roulette / Shared tables',data:round,card:false},{title:'Poker, Liêng & Xì Tố / Card tables',data:cards,card:true}] as const).map(group =>
      <section key={group.title} className="glass p-4"><h2 className="mb-3 font-bold">{group.title}</h2>
        {group.data.length === 0 && <p className="text-white/50">No tables</p>}
        {group.data.map(table => <div key={table.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 py-3">
          <div><p className="font-semibold">{table.nameVi ?? table.name_vi ?? table.id}</p><p className="text-xs text-white/50">{table.game} · {table.id} · {table.status}</p></div>
          <div className="flex gap-2">
            {(['open','paused',...(group.card ? ['closed'] : [])] as Array<'open'|'paused'|'closed'>).map(status =>
              <button key={status} className="rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-30" disabled={busy !== null || table.status === status} onClick={() => void change(table,group.card,status)}>{status}</button>
            )}
          </div>
        </div>)}
      </section>
    )}
  </div>;
}
