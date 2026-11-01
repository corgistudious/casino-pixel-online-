import type { RoomSummary } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { socket } from '../net/socket';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';
import { tablePath } from './RoomForm';

/** Room invitations from friends (with a "join now" button) and notices when a host removes me. */
export function RoomInviteHost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<{ room: RoomSummary; from: { uid: number; displayName: string } } | null>(null);
  useEffect(
    () =>
      socket.listen((ev) => {
        if (ev.event === 'roomInvite') setInvite(ev.data);
        if (ev.event === 'roomKicked') {
          toast(t('room.kickedNotice'), 'error');
          if (window.location.hash.includes(ev.data.tableId)) navigate('/custom-rooms');
        }
      }),
    [navigate, t],
  );
  useEffect(() => {
    if (!invite) return;
    const id = setTimeout(() => setInvite(null), 20_000);
    return () => clearTimeout(id);
  }, [invite]);
  if (!invite) return null;
  return (
    <div role="alertdialog" aria-label={t('room.invite.title')} className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[75] w-[min(92vw,320px)] animate-rise rounded-2xl border border-gold-300/40 bg-ink-900/95 p-4 shadow-glow backdrop-blur">
      <div className="font-display text-base text-gold-100">{t('room.invite.title')}</div>
      <p className="mt-1 text-sm text-white/80">{t('room.invite.body', { name: invite.from.displayName, room: invite.room.name, game: t(`room.games.${invite.room.game}`) })}</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" onClick={() => setInvite(null)}>
          {t('people.cancel')}
        </Button>
        <Button
          size="sm"
          variant="gold"
          onClick={() => {
            navigate(tablePath(invite.room));
            setInvite(null);
          }}
        >
          {t('room.invite.go')}
        </Button>
      </div>
    </div>
  );
}
