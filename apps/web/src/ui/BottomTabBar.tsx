import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import { useSession } from '../store/session';
import { useSocial } from '../store/social';
import { NAV_ITEMS } from './AppShell';
import { NavIcon, type NavIconName } from './NavIcons';

const TABS: { to: string; icon: NavIconName; label: string }[] = [
  { to: '/', icon: 'hub', label: 'nav.tabHub' },
  { to: '/rooms', icon: 'rooms', label: 'nav.tabRooms' },
  { to: '/market', icon: 'market', label: 'nav.tabMarket' },
  { to: '/friends', icon: 'friends', label: 'nav.tabFriends' },
];

/**
 * Portrait (phone) navigation: four main tabs and "More", which opens a bottom sheet with every
 * destination of the desktop rail (nothing is lost). Sits above the home indicator (safe area).
 */
export function BottomTabBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  const user = useSession((s) => s.user);
  const unreadSupport = useSocial((s) => s.unreadSupport);
  useEffect(() => setMore(false), [pathname]);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [more]);
  const dots: Record<string, boolean> = { '/mail': (user?.unreadMail ?? 0) > 0, '/support': unreadSupport > 0 };
  const extra = [...NAV_ITEMS.filter((n) => !TABS.some((tb) => tb.to === n.to)), ...(user?.permissions.includes('admin.access') ? [{ to: '/admin', icon: 'settings' as NavIconName, label: 'nav.admin' }] : [])];
  const moreActive = extra.some((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));

  return (
    <>
      <nav className="ptabbar hide-on-keyboard" aria-label={t('nav.hub')}>
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className="ptabbar-item">
            {({ isActive }) => (
              <>
                <span className="ptabbar-icon">
                  <NavIcon name={tab.icon} size={22} active={isActive} />
                </span>
                <span className="ptabbar-label">{t(tab.label)}</span>
              </>
            )}
          </NavLink>
        ))}
        <button type="button" className="ptabbar-item" aria-expanded={more} aria-current={moreActive ? 'page' : undefined} onClick={() => setMore((v) => !v)}>
          <span className="ptabbar-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
            {Object.values(dots).some(Boolean) && <span className="ptabbar-dot" />}
          </span>
          <span className="ptabbar-label">{t('nav.more')}</span>
        </button>
      </nav>
      {more && (
        <>
          <div className="psheet-scrim" onClick={() => setMore(false)} aria-hidden />
          <div className="psheet" role="dialog" aria-modal="true" aria-label={t('nav.more')}>
            <div className="psheet-grip" aria-hidden />
            <div className="grid grid-cols-4 gap-2">
              {extra.map((item) => (
                <NavLink key={item.to} to={item.to} className="psheet-item">
                  {({ isActive }) => (
                    <>
                      <span className="picon relative">
                        <NavIcon name={item.icon} size={22} active={isActive} />
                        {dots[item.to] && <span className="ptabbar-dot" />}
                      </span>
                      <span className="mt-1 line-clamp-2 text-center text-[11px] font-semibold leading-tight text-white/85">{t(item.label)}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
