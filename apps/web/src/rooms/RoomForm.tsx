import { ROOM_GAMES, ROOM_MAX_SEATS, ROOM_RULES, ROOM_STAKES, roomBlackjackLimits, roomCardConfig, type RoomGame, type RoomView } from '@casino/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { Modal } from '../social/parts';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';

/** Create a room, or (with `room`) edit its settings between hands. */
export function RoomForm({ room, onClose, onDone }: { room?: RoomView; onClose: () => void; onDone: (room: RoomView) => void }) {
  const { t, i18n } = useTranslation();
  const editing = !!room;
  const [game, setGame] = useState<RoomGame>(room?.game ?? 'poker');
  const [name, setName] = useState(room?.name ?? '');
  const [visibility, setVisibility] = useState<'public' | 'private'>(room?.visibility ?? 'public');
  const [password, setPassword] = useState('');
  const [stake, setStake] = useState<number>(room?.stake ?? ROOM_STAKES.poker[0]!);
  const [seats, setSeats] = useState<number>(room?.seats ?? ROOM_MAX_SEATS.poker);
  const [busy, setBusy] = useState(false);
  const fmt = (n: number) => formatChips(n, i18n.language);
  const stakes = ROOM_STAKES[game];
  const maxSeats = ROOM_MAX_SEATS[game];
  const needsPassword = visibility === 'private' && (!editing || room!.visibility === 'public');
  const pwOk = password === '' ? !needsPassword : password.length >= ROOM_RULES.passwordMin && password.length <= ROOM_RULES.passwordMax;
  const nameOk = name.trim().length >= ROOM_RULES.nameMin && name.trim().length <= ROOM_RULES.nameMax;
  const range = game === 'blackjack' ? (({ minBet, maxBet }) => [minBet, maxBet])(roomBlackjackLimits(stake)) : (({ minBuyIn, maxBuyIn }) => [minBuyIn, maxBuyIn])(roomCardConfig(game, stake, seats));

  const pickGame = (g: RoomGame) => {
    setGame(g);
    setStake(ROOM_STAKES[g][0]!);
    setSeats(ROOM_MAX_SEATS[g]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = editing
        ? { name: name.trim(), visibility, stake, seats, ...(password ? { password } : {}) }
        : { game, name: name.trim(), visibility, stake, seats, ...(visibility === 'private' ? { password } : {}) };
      const res = editing
        ? await api<{ room: RoomView }>(`/api/rooms/${encodeURIComponent(room!.id)}`, { method: 'PATCH', body })
        : await api<{ room: RoomView }>('/api/rooms', { method: 'POST', body });
      toast(t(editing ? 'room.saved' : 'room.created'), 'success');
      onDone(res.room);
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t(editing ? 'room.form.settings' : 'room.form.title')} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {!editing && (
          <fieldset>
            <legend className="mb-1.5 text-xs text-white/60">{t('room.form.game')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {ROOM_GAMES.map((g) => (
                <button key={g} type="button" aria-pressed={game === g} onClick={() => pickGame(g)} className={`rounded-xl border px-3 py-2 text-sm transition ${game === g ? 'border-gold-300/70 bg-gold-300/15 text-gold-100' : 'border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.07]'}`}>
                  {t(`room.games.${g}`)}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <label className="flex flex-col gap-1 text-xs text-white/60">
          {t('room.form.name')}
          <input className="field" value={name} maxLength={ROOM_RULES.nameMax} onChange={(e) => setName(e.target.value)} required />
          {!nameOk && name && <span className="text-ruby-200">{t('room.form.nameRule', { min: ROOM_RULES.nameMin, max: ROOM_RULES.nameMax })}</span>}
        </label>
        <fieldset>
          <legend className="mb-1.5 text-xs text-white/60">{t('room.form.visibility')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['public', 'private'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={visibility === v} onClick={() => setVisibility(v)} className={`rounded-xl border px-3 py-2 text-sm transition ${visibility === v ? 'border-gold-300/70 bg-gold-300/15 text-gold-100' : 'border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.07]'}`}>
                {v === 'private' ? '🔒 ' : ''}
                {t(`room.form.${v}`)}
              </button>
            ))}
          </div>
        </fieldset>
        {visibility === 'private' && (
          <label className="flex flex-col gap-1 text-xs text-white/60">
            {editing && room!.visibility === 'private' ? t('room.form.newPassword') : t('room.form.password')}
            <input className="field" type="password" autoComplete="new-password" value={password} maxLength={ROOM_RULES.passwordMax} onChange={(e) => setPassword(e.target.value)} />
            <span className="text-white/40">{t('room.form.passwordHint', { min: ROOM_RULES.passwordMin, max: ROOM_RULES.passwordMax })}</span>
          </label>
        )}
        <fieldset>
          <legend className="mb-1.5 text-xs text-white/60">{t('room.form.stake')}</legend>
          <div className="flex flex-wrap gap-2">
            {stakes.map((s) => (
              <button key={s} type="button" aria-pressed={stake === s} onClick={() => setStake(s)} className={`rounded-lg border px-3 py-1.5 text-sm tabular-nums transition ${stake === s ? 'border-gold-300/70 bg-gold-300/15 text-gold-100' : 'border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.07]'}`}>
                {fmt(s)}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-white/45">{game === 'blackjack' ? t('room.stakeBj', { min: fmt(range[0]!), max: fmt(range[1]!) }) : t('room.buyIn', { min: fmt(range[0]!), max: fmt(range[1]!) })}</p>
        </fieldset>
        <label className="flex items-center justify-between gap-3 text-xs text-white/60">
          {t('room.form.seats')}
          <select className="field w-24" value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
            {Array.from({ length: maxSeats - 1 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {editing && <p className="text-[11px] text-white/45">{t('room.panel.busyNote')}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            {t('people.cancel')}
          </Button>
          <Button type="submit" variant="gold" disabled={busy || !nameOk || !pwOk}>
            {editing ? t('room.form.save') : t('room.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Asks for a room's password; on success the server grants access and `onJoined` runs. */
export function RoomPasswordPrompt({ roomId, name, onClose, onJoined }: { roomId: string; name?: string; onClose: () => void; onJoined: (room: RoomView) => void }) {
  const { t, i18n } = useTranslation();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { room } = await api<{ room: RoomView }>(`/api/rooms/${encodeURIComponent(roomId)}/join`, { method: 'POST', body: { password } });
      onJoined(room);
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t('room.passwordPrompt.title')} onClose={onClose} width="max-w-sm">
      <form onSubmit={submit} className="flex flex-col gap-3">
        {name && <p className="text-sm text-white/70">🔒 {name}</p>}
        <input className="field" type="password" autoComplete="off" autoFocus value={password} maxLength={ROOM_RULES.passwordMax} onChange={(e) => setPassword(e.target.value)} aria-label={t('room.form.password')} />
        <Button type="submit" variant="gold" disabled={busy || !password}>
          {t('room.passwordPrompt.submit')}
        </Button>
      </form>
    </Modal>
  );
}

export const tablePath = (r: Pick<RoomView, 'engine' | 'tableId'>) => (r.engine === 'card' ? `/cards/${r.tableId}` : `/bjt/${r.tableId}`);
