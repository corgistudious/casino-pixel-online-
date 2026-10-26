import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { useSession } from '../store/session';
import { startSocialSync, useSocial } from '../store/social';
import { NavIcon } from './NavIcons';

/** 💬 in the top bar: the single entry to Chat (Server · Guild · Private), with the unread badge. */
export function ChatButton() {
  const { t } = useTranslation();
  const unread = useSocial((s) => s.unreadDm);
  const online = useSession((s) => s.status === 'online');
  useEffect(() => {
    startSocialSync();
    useSocial.getState().refresh();
  }, [online]);
  return (
    <NavLink
      to="/chat"
      title={t('nav.chat')}
      aria-label={unread ? `${t('nav.chat')} (${unread})` : t('nav.chat')}
      className={({ isActive }) =>
        `relative flex h-9 w-9 items-center justify-center rounded-full border transition ${isActive ? 'border-gold-300/70 bg-gold-300/15' : 'border-white/10 bg-black/30 hover:border-gold-300/40'}`
      }
    >
      <NavIcon name="chat" size={20} active />
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-ruby-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white shadow-[0_0_8px_rgba(255,64,96,0.7)]">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </NavLink>
  );
}
