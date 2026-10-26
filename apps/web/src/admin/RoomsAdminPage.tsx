import { ROOM_GAMES, type RoomGame, type RoomSummary } from '@casino/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../net/api';
import { adminApi } from '../net/adminApi';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';
import { Panel } from './parts';
import { useAdminKit } from './useAdmin';

type Table = { id: string; game: string; nameVi?: string; nameEn?: string; name_vi?: string; name_en?: string; status: 'open' | 'paused' | 'closed' };
type StaffRoom = RoomSummary & { tableStatus: 'open' | 'paused' | 'closed'; closedAt: string | null };

/** Official tables (open / pause / close) and player rooms (pause, hand over, close), rooms.manage only. */
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
    <PlayerRooms />
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

function PlayerRooms() {
  const { t, fmt, date, fail } = useAdminKit();
  const [status, setStatus] = useState<'open' | 'closed' | 'all'>('open');
  const [game, setGame] = useState<RoomGame | ''>('');
  const [uid, setUid] = useState('');
  const [rows, setRows] = useState<StaffRoom[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => {
    const q = new URLSearchParams({ status, ...(game ? { game } : {}), ...(/^\d+$/.test(uid.trim()) ? { uid: uid.trim() } : {}) });
    void adminApi<{ rooms: StaffRoom[] }>(`/api/admin/rooms?${q}`).then((r) => setRows(r.rooms), fail);
  };
  useEffect(load, [status, game]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (r: StaffRoom, path: string, body: object) => {
    setBusy(r.id);
    try {
      await adminApi(`/api/admin/rooms/${encodeURIComponent(r.id)}/${path}`, { method: 'POST', body });
      toast(t('admin.playerRooms.done'), 'success');
      load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title={t('admin.playerRooms.title')}>
      <p className="text-xs text-white/55">{t('admin.playerRooms.intro')}</p>
      <div className="flex flex-wrap items-center gap-2">
        {(['open', 'closed', 'all'] as const).map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1 text-xs ${status === s ? 'border-gold-300/70 bg-gold-300/15 text-gold-100' : 'border-white/10 text-white/70 hover:bg-white/10'}`}>
            {t(`admin.playerRooms.filters.${s}`)}
          </button>
        ))}
        <select className="field h-8 w-auto py-0 text-xs" value={game} onChange={(e) => setGame(e.target.value as RoomGame | '')} aria-label={t('room.form.game')}>
          <option value="">{t('room.allGames')}</option>
          {ROOM_GAMES.map((g) => (
            <option key={g} value={g}>
              {t(`room.games.${g}`)}
            </option>
          ))}
        </select>
        <form onSubmit={(e) => (e.preventDefault(), load())} className="flex gap-1">
          <input className="field h-8 w-36 py-0 text-xs" inputMode="numeric" placeholder={t('admin.playerRooms.ownerUid')} value={uid} onChange={(e) => setUid(e.target.value)} />
          <Button size="sm" type="submit">🔍</Button>
        </form>
      </div>
      {rows === null && <p className="text-sm text-white/50">{t('app.loading')}</p>}
      {rows?.length === 0 && <p className="text-sm text-white/55">{t('admin.playerRooms.empty')}</p>}
      <ul className="flex flex-col gap-2">
        {rows?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/25 p-3">
            <div className="min-w-0 text-sm">
              <div className="flex items-center gap-1.5 font-strong text-white">
                {r.locked && <span aria-label={t('room.locked')}>🔒</span>}
                <span className="truncate">{r.name}</span>
                <span className="text-xs font-normal text-gold-100">· {t(`room.games.${r.game}`)}</span>
              </div>
              <div className="flex flex-wrap gap-x-3 text-xs text-white/55">
                <span>
                  {t('admin.playerRooms.host')}: <Link className="underline-offset-2 hover:underline" to={`/admin/players/${r.owner.uid}`}>{r.owner.displayName} (UID {r.owner.uid})</Link>
                </span>
                <span>{t('admin.playerRooms.seated')}: {r.seated}/{r.seats}</span>
                <span>{r.engine === 'bj' ? t('room.stakeBj', { min: fmt(r.range[0]), max: fmt(r.range[1]) }) : t('room.stakeCard', { stake: fmt(r.stake) })}</span>
                <span>{t('admin.playerRooms.table')}: {r.tableStatus} · {t(`room.status.${r.status}`)}</span>
                <span>{t('admin.playerRooms.created')}: {date(r.createdAt)}</span>
                {r.closedAt && <span>{t('admin.playerRooms.closedAt')}: {date(r.closedAt)}</span>}
                <span className="font-mono">{r.id}</span>
              </div>
            </div>
            {!r.closedAt && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy === r.id} onClick={() => void act(r, 'pause', { paused: r.tableStatus === 'open' })}>
                  {r.tableStatus === 'open' ? t('admin.playerRooms.pause') : t('admin.playerRooms.resume')}
                </Button>
                <Button
                  size="sm"
                  disabled={busy === r.id}
                  onClick={() => {
                    const v = window.prompt(t('admin.playerRooms.transferPrompt'));
                    if (v && /^\d+$/.test(v.trim())) void act(r, 'transfer', { uid: Number(v.trim()) });
                  }}
                >
                  {t('admin.playerRooms.transfer')}
                </Button>
                <Button
                  size="sm"
                  variant="ruby"
                  disabled={busy === r.id}
                  onClick={() => {
                    const reason = window.prompt(t('admin.playerRooms.closePrompt'));
                    if (reason && reason.trim().length >= 3) void act(r, 'close', { reason: reason.trim() });
                  }}
                >
                  {t('admin.playerRooms.close')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
