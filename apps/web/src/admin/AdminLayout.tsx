import type { Permission } from '@casino/shared';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { KeyoLogo } from '../ui/KeyoLogo';
import { ReauthDialog } from '../ui/ReauthDialog';
import { Pill } from './parts';
import { useAdminKit, useAdminStore } from './useAdmin';

export const ADMIN_SECTIONS: { path: string; key: string; perm: Permission }[] = [
  { path: 'dashboard', key: 'dashboard', perm: 'dashboard.read' },
  { path: 'players', key: 'players', perm: 'users.read' },
  { path: 'staff', key: 'staff', perm: 'staff.read' },
  { path: 'support', key: 'support', perm: 'support.read' },
  { path: 'progression', key: 'progression', perm: 'progression.read' },
  { path: 'season-rewards', key: 'seasonRewards', perm: 'progression.read' },
  { path: 'missions', key: 'missions', perm: 'progression.read' },
  { path: 'giftcodes', key: 'giftcodes', perm: 'giftcode.manage' },
  { path: 'rooms', key: 'rooms', perm: 'rooms.manage' },
  { path: 'items', key: 'items', perm: 'items.read' },
  { path: 'mail', key: 'mail', perm: 'mail.send' },
  { path: 'audit', key: 'audit', perm: 'audit.read' },
  { path: 'uids', key: 'uids', perm: 'uid.assign' },
  { path: 'deletions', key: 'deletions', perm: 'deletion.manage' },
  { path: 'system', key: 'system', perm: 'mail.read' },
];

/** Admin shell: section navigation filtered by the viewer's permissions, role badge and the re-auth prompt. */
export function AdminLayout() {
  const { t, me, can, fail } = useAdminKit();
  const load = useAdminStore((s) => s.load);
  const [error, setError] = useState(false);
  const location = useLocation();

  useEffect(() => {
    load().catch((err) => {
      setError(true);
      fail(err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  if (error) return <Navigate to="/" replace />;
  if (!me) return <div className="flex h-full items-center justify-center text-white/50">{t('app.loading')}</div>;
  const sections = ADMIN_SECTIONS.filter((s) => can(s.perm));
  if (location.pathname.replace(/\/+$/, '') === '/admin') return <Navigate to={sections[0] ? `/admin/${sections[0].path}` : '/'} replace />;

  return (
    <div className="flex h-full flex-col bg-[radial-gradient(ellipse_at_20%_0%,#24185a,#0b0822_55%,#05040f)] lg:flex-row">
      <ReauthDialog />
      <aside className="flex shrink-0 flex-col gap-3 border-b border-white/10 bg-black/25 p-3 lg:w-60 lg:border-b-0 lg:border-r lg:p-4">
        <div className="flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2" title={t('admin.nav.backToGame')}>
            <KeyoLogo size={34} />
          </Link>
          <div className="flex flex-wrap justify-end gap-1">
            {me.roles.map((r) => (
              <Pill key={r} tone={r === 'owner' ? 'gold' : 'cyan'}>
                {t(`admin.roleNames.${r}`, { defaultValue: r })}
              </Pill>
            ))}
          </div>
        </div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label={t('admin.title')}>
          {sections.map((s) => (
            <NavLink
              key={s.path}
              to={`/admin/${s.path}`}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-gold-300/15 text-gold-100' : 'text-white/65 hover:bg-white/5 hover:text-white'}`
              }
            >
              {t(`admin.nav.${s.key}`, { defaultValue: s.key === 'rooms' ? 'Bàn chơi / Rooms' : s.key })}
            </NavLink>
          ))}
        </nav>
        <Link to="/" className="mt-auto hidden text-sm text-white/50 hover:text-white lg:block">
          ← {t('admin.nav.backToGame')}
        </Link>
      </aside>
      <main className="min-h-0 flex-1 overflow-y-auto p-3 lg:p-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/** Wraps a section so a direct link to a page the viewer may not see bounces to the first allowed section. */
export function RequirePerm({ perm, children }: { perm: Permission; children: ReactElement }) {
  const { can } = useAdminKit();
  return can(perm) ? children : <Navigate to="/admin" replace />;
}
