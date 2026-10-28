import type { FriendsOverview, RoomEngine, RoomView } from '@casino/shared';
import { PlayerAvatar, PlayerRankBadge, type IdentityLike } from '../players/identity';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { socket } from '../net/socket';
import { PlayerTrigger } from '../players/PlayerActions';
import { Modal, PlayerChip } from '../social/parts';
import { useSession } from '../store/session';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';
import { RoomForm } from './RoomForm';

export interface TableMember extends IdentityLike {
  seat: number;
}

/**
 * Players at a table (each opens the interaction menu) and, for player rooms, the room header and
 * the host's controls: settings, invitations, removing a player, closing the room.
 */
export function RoomPanel({ engine, tableId, members }: { engine: RoomEngine; tableId: string; members: TableMember[] }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const me = useSession((s) => s.user?.uid);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const fmt = (n: number) => formatChips(n, i18n.language);

  const load = useCallback(() => {
    api<{ room: RoomView | null }>(`/api/rooms/by-table/${engine}/${tableId}`).then(
      (r) => setRoom(r.room),
      () => setRoom(null),
    );
  }, [engine, tableId]);
  useEffect(load, [load]);
  useEffect(
    () =>
      socket.listen((ev) => {
        if (ev.event === 'room' && ev.data.tableId === tableId) {
          if (ev.data.closed) {
            toast(t('room.panel.closed'));
            navigate('/custom-rooms');
          } else load();
        }
      }),
    [tableId, load, navigate, t],
  );

  const kick = async (m: TableMember) => {
    if (!room || !window.confirm(t('room.panel.confirmKick', { name: m.displayName }))) return;
    try {
      await api(`/api/rooms/${encodeURIComponent(room.id)}/kick`, { method: 'POST', body: { uid: m.uid } });
      toast(t('room.panel.kicked', { name: m.displayName }), 'success');
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    }
  };
  const close = async () => {
    if (!room) return;
    try {
      await api(`/api/rooms/${encodeURIComponent(room.id)}/close`, { method: 'POST' });
      navigate('/custom-rooms');
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/25 p-2">
      {room && (
        <div className="flex flex-col gap-1 border-b border-white/10 pb-2">
          <div className="flex items-center gap-1.5 text-sm font-strong text-white">
            {room.locked && <span aria-label={t('room.locked')}>🔒</span>}
            <span className="truncate">{room.name}</span>
          </div>
          <div className="text-[11px] text-white/55">
            {room.isOwner ? t('room.panel.youHost') : t('room.panel.title', { name: room.owner.displayName })} · {room.engine === 'bj' ? t('room.stakeBj', { min: fmt(room.range[0]), max: fmt(room.range[1]) }) : t('room.stakeCard', { stake: fmt(room.stake) })}
          </div>
          {room.isOwner && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => setInviting(true)}>
                {t('room.panel.invite')}
              </Button>
              <Button size="sm" onClick={() => setEditing(true)} disabled={room.status === 'playing'} title={room.status === 'playing' ? t('room.panel.busyNote') : undefined}>
                {t('room.panel.settings')}
              </Button>
              {members.length === 0 && (
                <Button size="sm" variant="ruby" onClick={() => void close()}>
                  {t('room.panel.close')}
                </Button>
              )}
            </div>
          )}
          <p className="text-[10px] leading-snug text-white/40">{t('room.panel.hostLeaves')}</p>
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {members.map((m) => (
          <li key={m.seat} className="flex items-center gap-2">
            <PlayerTrigger uid={m.uid} label={m.displayName} context={room ? `room:${room.id}` : `table:${engine}:${tableId}`} className="flex min-w-0 flex-1 items-center gap-2 p-1 hover:bg-white/5">
              <PlayerAvatar player={m} size={26} />
              <span className="truncate text-xs text-white/85">{m.displayName}</span>
              <PlayerRankBadge rank={m.rank} size={14} />
              {room && room.owner.uid === m.uid && <span className="text-[10px] text-gold-200">★</span>}
            </PlayerTrigger>
            {room?.isOwner && m.uid !== me && (
              <button type="button" onClick={() => void kick(m)} className="rounded-md px-1.5 text-[11px] text-ruby-200 hover:bg-ruby-500/20" aria-label={t('room.panel.kick')} title={t('room.panel.kick')}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {room && editing && <RoomForm room={room} onClose={() => setEditing(false)} onDone={(r) => (setRoom(r), setEditing(false))} />}
      {room && inviting && <InviteDialog room={room} onClose={() => setInviting(false)} />}
    </div>
  );
}

function InviteDialog({ room, onClose }: { room: RoomView; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [friends, setFriends] = useState<FriendsOverview['friends'] | null>(null);
  useEffect(() => {
    void api<FriendsOverview>('/api/friends').then((r) => setFriends(r.friends), () => setFriends([]));
  }, []);
  const invite = async (uid: number, name: string) => {
    try {
      await api(`/api/rooms/${encodeURIComponent(room.id)}/invite`, { method: 'POST', body: { uid } });
      toast(t('room.panel.invited', { name }), 'success');
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    }
  };
  return (
    <Modal title={t('room.panel.invite')} onClose={onClose}>
      <p className="text-xs text-white/55">{t('room.panel.inviteHint')}</p>
      {friends === null ? (
        <p className="text-sm text-white/50">{t('app.loading')}</p>
      ) : friends.length === 0 ? (
        <p className="text-sm text-white/50">{t('room.panel.noFriends')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {friends.map((f) => (
            <li key={f.uid} className="flex items-center justify-between gap-2 rounded-xl bg-black/25 p-2">
              <PlayerChip card={f} online={f.online} size={34} />
              <Button size="sm" variant="gold" onClick={() => void invite(f.uid, f.displayName)}>
                {t('room.panel.invite')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
