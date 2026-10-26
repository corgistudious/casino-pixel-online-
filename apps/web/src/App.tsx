import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { BlackjackGame } from './game/controls/BlackjackGame';
import { RouletteGame } from './game/controls/RouletteGame';
import { SicBoGame } from './game/controls/SicBoGame';
import { SlotsGame } from './game/controls/SlotsGame';
import { SharedTableGame } from './game/controls/SharedTableGame';
import { AdminLayout, RequirePerm } from './admin/AdminLayout';
import { AuditPage } from './admin/AuditPage';
import { DashboardPage } from './admin/DashboardPage';
import { DeletionsPage, SystemPage, UidsPage } from './admin/MiscPages';
import { PlayersPage } from './admin/PlayersPage';
import { StaffPage } from './admin/StaffPage';
import { ItemsPage } from './admin/ItemsPage';
import { MailAdminPage } from './admin/MailAdminPage';
import { ProgressionAdminPage } from './admin/ProgressionAdminPage';
import { SeasonRewardsPage } from './admin/SeasonRewardsPage';
import { GiftcodesPage } from './admin/GiftcodesPage';
import { AuthPage, EmailLinkPage, VerifyEmailGate } from './pages/AuthPage';
import { GameHub } from './hub/GameHub';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { MarketPage } from './pages/MarketPage';
import { CollectionPage } from './pages/CollectionPage';
import { MailboxPage } from './pages/MailboxPage';
import { VipPage } from './pages/VipPage';
import { BankPage } from './pages/BankPage';
import { SupportPage } from './support/SupportPage';
import { SupportAdminPage } from './admin/SupportAdminPage';
import { MissionConfigPage } from './admin/MissionConfigPage';
import { AchievementsPage } from './pages/AchievementsPage';
import { RoomsAdminPage } from './admin/RoomsAdminPage';
import { TradingPage } from './pages/TradingPage';
import { MissionsPage } from './pages/MissionsPage';
import { ChatPage } from './social/ChatPage';
import { FriendsPage } from './social/FriendsPage';
import { GuildPage } from './social/GuildPage';
import { RankPage } from './pages/RankPage';
import { GiftcodePage } from './pages/GiftcodePage';
import { CardLobbyPage } from './pages/CardLobbyPage';
import { CardTablePage } from './pages/CardTablePage';
import { useCatalog } from './store/catalog';
import { useSession } from './store/session';
import { useSettings } from './store/settings';
import { ConnectionBanner, LevelUpBanner, RotateOverlay, TestEnvBadge, Toasts } from './ui/Chrome';
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

function TableRoute() {
  const { tableId } = useParams();
  // Remount per table so scenes and subscriptions never mix two tables.
  return tableId ? <SharedTableGame key={tableId} tableId={tableId} /> : <Navigate to="/" replace />;
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

  const loadCatalog = useCatalog((c) => c.load);
  useEffect(() => {
    void boot();
    void loadCatalog();
  }, [boot, loadCatalog]);

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
      <LevelUpBanner />
      <Routes>
        <Route path="/" element={<Authed><GameHub /></Authed>} />
        <Route path="/play/:game" element={<Authed><GameRoute /></Authed>} />
        <Route path="/tables/:tableId" element={<Authed><TableRoute /></Authed>} />
        <Route path="/profile" element={<Authed><ProfilePage /></Authed>} />
        <Route path="/market" element={<Authed><MarketPage /></Authed>} />
        <Route path="/shop" element={<Navigate to="/market" replace />} />
        <Route path="/vip" element={<Authed><VipPage /></Authed>} />
        <Route path="/bank" element={<Authed><BankPage /></Authed>} />
        <Route path="/support" element={<Authed><SupportPage /></Authed>} />
        <Route path="/achievements" element={<Authed><AchievementsPage /></Authed>} />
        <Route path="/trading" element={<Authed><TradingPage /></Authed>} />
        <Route path="/chat" element={<Authed><ChatPage /></Authed>} />
        <Route path="/rooms" element={<Authed><CardLobbyPage /></Authed>} />
        <Route path="/cards/:tableId" element={<Authed><CardTablePage /></Authed>} />
        <Route path="/collection" element={<Authed><CollectionPage /></Authed>} />
        <Route path="/mail" element={<Authed><MailboxPage /></Authed>} />
        <Route path="/missions" element={<Authed><MissionsPage /></Authed>} />
        <Route path="/guild" element={<Authed><GuildPage /></Authed>} />
        <Route path="/friends" element={<Authed><FriendsPage /></Authed>} />
        <Route path="/gifts" element={<Authed><GiftcodePage /></Authed>} />
        <Route path="/giftcode" element={<Navigate to="/gifts" replace />} />
        <Route path="/leaderboard" element={<Authed><LeaderboardPage /></Authed>} />
        <Route path="/rank" element={<Authed><RankPage /></Authed>} />
        <Route path="/settings" element={<Authed><SettingsPage /></Authed>} />
        <Route path="/admin" element={<Authed admin><AdminLayout /></Authed>}>
          <Route path="dashboard" element={<RequirePerm perm="dashboard.read"><DashboardPage /></RequirePerm>} />
          <Route path="players" element={<RequirePerm perm="users.read"><PlayersPage /></RequirePerm>} />
          <Route path="players/:uid" element={<RequirePerm perm="users.read"><PlayersPage /></RequirePerm>} />
          <Route path="staff" element={<RequirePerm perm="staff.read"><StaffPage /></RequirePerm>} />
          <Route path="support" element={<RequirePerm perm="support.read"><SupportAdminPage /></RequirePerm>} />
          <Route path="progression" element={<RequirePerm perm="progression.read"><ProgressionAdminPage /></RequirePerm>} />
          <Route path="missions" element={<RequirePerm perm="progression.read"><MissionConfigPage /></RequirePerm>} />
          <Route path="season-rewards" element={<RequirePerm perm="progression.read"><SeasonRewardsPage /></RequirePerm>} />
          <Route path="giftcodes" element={<RequirePerm perm="giftcode.manage"><GiftcodesPage /></RequirePerm>} />
          <Route path="rooms" element={<RequirePerm perm="rooms.manage"><RoomsAdminPage /></RequirePerm>} />
          <Route path="items" element={<RequirePerm perm="items.read"><ItemsPage /></RequirePerm>} />
          <Route path="mail" element={<RequirePerm perm="mail.send"><MailAdminPage /></RequirePerm>} />
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
