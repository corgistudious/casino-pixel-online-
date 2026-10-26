import { ROOM_GAMES, type RoomFilter, type RoomGame, type RoomSummary, type RoomView } from '@casino/shared';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { PlayerTrigger } from '../players/PlayerActions';
import { AppShell, PageHeader } from '../ui/AppShell';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';
import { RoomForm, RoomPasswordPrompt, tablePath } from './RoomForm';

const FILTERS: RoomFilter[] = ['all', 'public', 'private', 'available'];

/** Player rooms: browse, filter, create and join (password prompt for locked rooms). */
export function RoomsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<RoomFilter>('all');
  const [game, setGame] = useState<RoomGame | ''>('');
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [locked, setLocked] = useState<RoomSummary | null>(null);
  const fmt = (n: number) => formatChips(n, i18n.language);

  const load = useCallback(() => {
    const q = new URLSearchParams({ filter, ...(game ? { game } : {}) });
    api<{ rooms: RoomSummary[] }>(`/api/rooms?${q}`).then(
      (r) => setRooms(r.rooms),
      (err) => toast(errorText(t, err, i18n.language), 'error'),
    );
  }, [filter, game, t, i18n.language]);
  useEffect(() => {
    load();
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, [load]);

  const join = async (r: RoomSummary) => {
    try {
      const { room } = await api<{ room: RoomView }>(`/api/rooms/${encodeURIComponent(r.id)}`);
      if (room.access) return navigate(tablePath(room));
      if (room.locked) return setLocked(r);
      const joined = await api<{ room: RoomView }>(`/api/rooms/${encodeURIComponent(r.id)}/join`, { method: 'POST', body: {} });
      navigate(tablePath(joined.room));
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <PageHeader icon="rooms" title={t('room.title')} subtitle={t('room.subtitle')} right={<Button variant="gold" onClick={() => setCreating(true)}>＋ {t('room.create')}</Button>} />
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-xs transition ${filter === f ? 'border-gold-300/70 bg-gold-300/15 text-gold-100' : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10'}`}>
              {t(`room.filters.${f}`)}
            </button>
          ))}
          <select className="field ml-auto h-8 w-auto py-0 text-xs" value={game} onChange={(e) => setGame(e.target.value as RoomGame | '')} aria-label={t('room.form.game')}>
            <option value="">{t('room.allGames')}</option>
            {ROOM_GAMES.map((g) => (
              <option key={g} value={g}>
                {t(`room.games.${g}`)}
              </option>
            ))}
          </select>
        </div>
        {rooms === null && <p className="glass p-6 text-center text-white/50">{t('app.loading')}</p>}
        {rooms?.length === 0 && <p className="glass p-6 text-center text-white/55">{t('room.empty')}</p>}
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rooms?.map((r) => (
            <li key={r.id} className="glass flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {r.locked && <span title={t('room.locked')} aria-label={t('room.locked')}>🔒</span>}
                    <h2 className="truncate font-display text-lg text-white">{r.name}</h2>
                  </div>
                  <div className="text-xs text-gold-100">{t(`room.games.${r.game}`)}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${r.status === 'playing' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10 text-white/70'}`}>{t(`room.status.${r.status}`)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-white/60">
                {t('room.host')}:
                <PlayerTrigger uid={r.owner.uid} label={r.owner.displayName} context={`room:${r.id}`} className="truncate font-strong text-white/85">
                  {r.owner.displayName}
                </PlayerTrigger>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/60">
                <span>{t('room.players', { n: r.seated, max: r.seats })}</span>
                <span>{r.engine === 'bj' ? t('room.stakeBj', { min: fmt(r.range[0]), max: fmt(r.range[1]) }) : t('room.stakeCard', { stake: fmt(r.stake) })}</span>
                {r.engine === 'card' && <span>{t('room.buyIn', { min: fmt(r.range[0]), max: fmt(r.range[1]) })}</span>}
              </div>
              <Button variant="gold" size="sm" className="mt-1 self-start" onClick={() => void join(r)}>
                {t('room.join')}
              </Button>
            </li>
          ))}
        </ul>
      </div>
      {creating && <RoomForm onClose={() => setCreating(false)} onDone={(room) => navigate(tablePath(room))} />}
      {locked && <RoomPasswordPrompt roomId={locked.id} name={locked.name} onClose={() => setLocked(null)} onJoined={(room) => navigate(tablePath(room))} />}
    </AppShell>
  );
}
