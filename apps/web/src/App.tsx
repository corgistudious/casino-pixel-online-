import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HashRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthPage, EmailLinkPage, VerifyEmailGate } from './pages/AuthPage';
import { GameHub } from './hub/GameHub';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { FrameLibraryPage } from './pages/FrameLibraryPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { MarketPage } from './pages/MarketPage';
import { CollectionPage } from './pages/CollectionPage';
import { MailboxPage } from './pages/MailboxPage';
import { VipPage } from './pages/VipPage';
import { BankPage } from './pages/BankPage';
import { SupportPage } from './support/SupportPage';
import { BjtLobbyPage } from './bjt/BjtLobbyPage';
import { AchievementsPage } from './pages/AchievementsPage';
import { TradingPage } from './pages/TradingPage';
import { MissionsPage } from './pages/MissionsPage';
import { ChatPage, ChatContent } from './social/ChatPage';
import { NavIcon } from './ui/NavIcons';
import { FriendsPage } from './social/FriendsPage';
import { GuildPage } from './social/GuildPage';
import { RankPage } from './pages/RankPage';
import { GiftcodePage } from './pages/GiftcodePage';
import { CardLobbyPage } from './pages/CardLobbyPage';
import { PlayerActionHost } from './players/PlayerActions';
import { IdentitySync } from './players/identity';
import { GiftShopHost } from './players/GiftShopDialog';
import { SupportMenuHost } from './support/SupportMenu';
import { VictoryEffectHost } from './cosmetics/VictoryEffect';
import { PlayerProfilePage } from './players/PlayerProfilePage';
import { RoomInviteHost } from './rooms/RoomInviteHost';
import { RoomsPage } from './rooms/RoomsPage';
import { useCatalog } from './store/catalog';
import { useSession } from './store/session';
import { useSettings } from './store/settings';
import { ConnectionBanner, LevelUpBanner, TestEnvBadge, Toasts } from './ui/Chrome';
import { OrientationGuard } from './ui/OrientationGuard';
import { KeyoLogo } from './ui/KeyoLogo';

// Heavy, rarely-first screens load on demand: the game rooms (Phaser) and the staff console.
// Game rooms are prefetched once the player is signed in and the app is idle, so entering a room stays instant.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const named = <M extends Record<K, ComponentType<any>>, K extends keyof M & string>(load: () => Promise<M>, key: K) => lazy(() => load().then((m) => ({ default: m[key] })));
const loadGames = {
  blackjack: () => import('./game/controls/BlackjackGame'),
  roulette: () => import('./game/controls/RouletteGame'),
  sicbo: () => import('./game/controls/SicBoGame'),
  slots: () => import('./game/controls/SlotsGame'),
  shared: () => import('./game/controls/SharedTableGame'),
  cards: () => import('./pages/CardTablePage'),
  bjt: () => import('./bjt/BjtTablePage'),
};
const BlackjackGame = named(loadGames.blackjack, 'BlackjackGame');
const RouletteGame = named(loadGames.roulette, 'RouletteGame');
const SicBoGame = named(loadGames.sicbo, 'SicBoGame');
const SlotsGame = named(loadGames.slots, 'SlotsGame');
const SharedTableGame = named(loadGames.shared, 'SharedTableGame');
const CardTablePage = named(loadGames.cards, 'CardTablePage');
const BjtTablePage = named(loadGames.bjt, 'BjtTablePage');
const AdminRoutes = named(() => import('./admin/AdminRoutes'), 'AdminRoutes');

function prefetchGames() {
  const run = () => Object.values(loadGames).forEach((load) => void load().catch(() => {}));
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}

function RouteLoading() {
  return (
    <div className="flex h-full items-center justify-center" role="status" aria-live="polite">
      <div className="h-[3px] w-40 animate-pulse rounded-full bg-gradient-to-r from-transparent via-gold-300 to-transparent" />
    </div>
  );
}

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

/** Floating in-room chat: opening it does not unmount the active game/table. */
function InGameChat() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const inGame = ['/play/', '/tables/', '/bjt/', '/cards/'].some((prefix) => pathname.startsWith(prefix)) || pathname === '/bjt';
  useEffect(() => setOpen(false), [pathname]);
  if (!inGame) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Chat"
        title="Chat"
        className="hide-on-keyboard fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-40 flex h-11 w-11 items-center justify-center rounded-full border border-[#f2c14e]/70 bg-[#180f38]/95 shadow-lg hover:brightness-125"
      >
        <NavIcon name="chat" size={23} active />
      </button>
      {open && (
        <div className="overlay z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-label="Chat">
          <div className="flex h-[min(100%,680px)] w-[min(94vw,850px)] min-h-0 flex-col overflow-hidden rounded-2xl border border-[#f2c14e]/50 bg-[#0b0920] shadow-2xl">
            <div className="flex shrink-0 justify-end border-b border-white/10 px-3 py-1">
              <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-lg px-3 py-1 text-lg text-white hover:bg-white/10">×</button>
            </div>
            <div className="min-h-0 flex-1"><ChatContent /></div>
          </div>
        </div>
      )}
    </>
  );
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
  const signedIn = useSession((s) => !!s.user);
  useEffect(() => {
    if (signedIn) prefetchGames();
  }, [signedIn]);

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
      <OrientationGuard />
      <Toasts />
      <LevelUpBanner />
      <PlayerActionHost />
      <IdentitySync />
      <GiftShopHost />
      <SupportMenuHost />
      <VictoryEffectHost />
      <RoomInviteHost />
      <InGameChat />
      <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/" element={<Authed><GameHub /></Authed>} />
        <Route path="/play/:game" element={<Authed><GameRoute /></Authed>} />
        <Route path="/tables/:tableId" element={<Authed><TableRoute /></Authed>} />
        <Route path="/profile" element={<Authed><ProfilePage /></Authed>} />
        <Route path="/player/:uid" element={<Authed><PlayerProfilePage /></Authed>} />
        <Route path="/custom-rooms" element={<Authed><RoomsPage /></Authed>} />
        <Route path="/market" element={<Authed><MarketPage /></Authed>} />
        <Route path="/shop" element={<Navigate to="/market" replace />} />
        <Route path="/vip" element={<Authed><VipPage /></Authed>} />
        <Route path="/bank" element={<Authed><BankPage /></Authed>} />
        <Route path="/support" element={<Authed><SupportPage /></Authed>} />
        <Route path="/achievements" element={<Authed><AchievementsPage /></Authed>} />
        <Route path="/trading" element={<Authed><TradingPage /></Authed>} />
        <Route path="/chat" element={<Authed><ChatPage /></Authed>} />
        <Route path="/rooms" element={<Authed><CardLobbyPage /></Authed>} />
        <Route path="/bjt" element={<Authed><BjtLobbyPage /></Authed>} />
        <Route path="/bjt/:tableId" element={<Authed><BjtTablePage /></Authed>} />
        <Route path="/cards/:tableId" element={<Authed><CardTablePage /></Authed>} />
        <Route path="/collection" element={<Authed><CollectionPage /></Authed>} />
        <Route path="/frames" element={<Authed><FrameLibraryPage /></Authed>} />
        <Route path="/mail" element={<Authed><MailboxPage /></Authed>} />
        <Route path="/missions" element={<Authed><MissionsPage /></Authed>} />
        <Route path="/guild" element={<Authed><GuildPage /></Authed>} />
        <Route path="/friends" element={<Authed><FriendsPage /></Authed>} />
        <Route path="/gifts" element={<Authed><GiftcodePage /></Authed>} />
        <Route path="/giftcode" element={<Navigate to="/gifts" replace />} />
        <Route path="/leaderboard" element={<Authed><LeaderboardPage /></Authed>} />
        <Route path="/rank" element={<Authed><RankPage /></Authed>} />
        <Route path="/settings" element={<Authed><SettingsPage /></Authed>} />
        <Route path="/admin/*" element={<Authed admin><Suspense fallback={<RouteLoading />}><AdminRoutes /></Suspense></Authed>} />
        <Route path="/verify-email" element={<EmailLinkPage kind="verify" />} />
        <Route path="/reset-password" element={<EmailLinkPage kind="reset" />} />
        <Route path="/activate" element={<EmailLinkPage kind="activate" />} />
        <Route path="/captain-setup" element={<EmailLinkPage kind="captain" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </HashRouter>
  );
}
