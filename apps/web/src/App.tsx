import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { BlackjackGame } from './game/controls/BlackjackGame';
import { RouletteGame } from './game/controls/RouletteGame';
import { SicBoGame } from './game/controls/SicBoGame';
import { SlotsGame } from './game/controls/SlotsGame';
import { AdminLayout, RequirePerm } from './admin/AdminLayout';
import { AuditPage } from './admin/AuditPage';
import { DashboardPage } from './admin/DashboardPage';
import { DeletionsPage, SystemPage, UidsPage } from './admin/MiscPages';
import { PlayersPage } from './admin/PlayersPage';
import { StaffPage } from './admin/StaffPage';
import { AuthPage, EmailLinkPage, VerifyEmailGate } from './pages/AuthPage';
import { GameHub } from './hub/GameHub';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { MarketPage } from './pages/MarketPage';
import { VipPage } from './pages/VipPage';
import { useSession } from './store/session';
import { useSettings } from './store/settings';
import { ConnectionBanner, RotateOverlay, TestEnvBadge, Toasts } from './ui/Chrome';
import { KeyoLogo } from './ui/KeyoLogo';

function GameRoute() {
  const { game } = useParams();
  switch (game) {
    case 'slots':
      return <SlotsGame />;
    case 'roulette':
      return <RouletteGame />;
    case 'sicbo':
      return <SicBoGame />;
    case 'blackjack':
      return <BlackjackGame />;
    default:
      return <Navigate to="/" replace />;
  }
}

function Authed({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const user = useSession((s) => s.user);
  if (!user) return <AuthPage />;
  if (user.status === 'pending_verification') return <VerifyEmailGate />;
  // Access is decided by server-side permissions; the server re-checks every admin request.
  if (admin && !user.permissions.includes('admin.access')) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  const { t } = useTranslation();
  const booting = useSession((s) => s.booting);
  const boot = useSession((s) => s.boot);
  const reduceMotion = useSettings((s) => s.reduceMotion);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  if (booting) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 bg-[radial-gradient(ellipse_at_50%_30%,#2a1a66,#0b0822_60%,#05040f)]">
        <KeyoLogo size={88} />
        <div className="h-[3px] w-40 animate-pulse rounded-full bg-gradient-to-r from-transparent via-gold-300 to-transparent" />
        <p className="text-sm text-white/60">{t('app.loading')}</p>
      </div>
    );
  }

  return (
    <HashRouter>
      <ConnectionBanner />
      <TestEnvBadge />
      <RotateOverlay />
      <Toasts />
      <Routes>
        <Route path="/" element={<Authed><GameHub /></Authed>} />
        <Route path="/play/:game" element={<Authed><GameRoute /></Authed>} />
        <Route path="/profile" element={<Authed><ProfilePage /></Authed>} />
        <Route path="/market" element={<Authed><MarketPage /></Authed>} />
        <Route path="/shop" element={<Navigate to="/market" replace />} />
        <Route path="/vip" element={<Authed><VipPage /></Authed>} />
        <Route path="/rooms" element={<Authed><ComingSoonPage section="rooms" /></Authed>} />
        <Route path="/collection" element={<Authed><ComingSoonPage section="collection" /></Authed>} />
        <Route path="/missions" element={<Authed><ComingSoonPage section="missions" /></Authed>} />
        <Route path="/friends" element={<Authed><ComingSoonPage section="friends" /></Authed>} />
        <Route path="/gifts" element={<Authed><ComingSoonPage section="gifts" /></Authed>} />
        <Route path="/leaderboard" element={<Authed><LeaderboardPage /></Authed>} />
        <Route path="/settings" element={<Authed><SettingsPage /></Authed>} />
        <Route path="/admin" element={<Authed admin><AdminLayout /></Authed>}>
          <Route path="dashboard" element={<RequirePerm perm="dashboard.read"><DashboardPage /></RequirePerm>} />
          <Route path="players" element={<RequirePerm perm="users.read"><PlayersPage /></RequirePerm>} />
          <Route path="players/:uid" element={<RequirePerm perm="users.read"><PlayersPage /></RequirePerm>} />
          <Route path="staff" element={<RequirePerm perm="staff.read"><StaffPage /></RequirePerm>} />
          <Route path="audit" element={<RequirePerm perm="audit.read"><AuditPage /></RequirePerm>} />
          <Route path="uids" element={<RequirePerm perm="uid.assign"><UidsPage /></RequirePerm>} />
          <Route path="deletions" element={<RequirePerm perm="deletion.manage"><DeletionsPage /></RequirePerm>} />
          <Route path="system" element={<RequirePerm perm="mail.read"><SystemPage /></RequirePerm>} />
        </Route>
        <Route path="/verify-email" element={<EmailLinkPage kind="verify" />} />
        <Route path="/reset-password" element={<EmailLinkPage kind="reset" />} />
        <Route path="/activate" element={<EmailLinkPage kind="activate" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
