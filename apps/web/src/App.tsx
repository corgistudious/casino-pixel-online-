import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { BlackjackGame } from './game/controls/BlackjackGame';
import { RouletteGame } from './game/controls/RouletteGame';
import { SicBoGame } from './game/controls/SicBoGame';
import { SlotsGame } from './game/controls/SlotsGame';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { GameHub } from './hub/GameHub';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { MarketPage } from './pages/MarketPage';
import { VipPage } from './pages/VipPage';
import { useSession } from './store/session';
import { useSettings } from './store/settings';
import { ConnectionBanner, RotateOverlay, Toasts } from './ui/Chrome';

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
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
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
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-gold-300/20 border-t-gold-300" />
        <p className="font-display text-gold-100">{t('app.loading')}</p>
      </div>
    );
  }

  return (
    <HashRouter>
      <ConnectionBanner />
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
        <Route path="/admin" element={<Authed admin><AdminPage /></Authed>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
