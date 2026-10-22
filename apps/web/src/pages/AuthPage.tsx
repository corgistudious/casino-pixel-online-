import { ECONOMY, type PublicUser } from '@casino/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../lib/format';
import { api, ApiError } from '../net/api';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { Button } from '../ui/Button';
import { GameArt } from '../ui/Icons';
import { LanguageSwitch } from './SettingsPage';

export function AuthPage() {
  const { t, i18n } = useTranslation();
  const signIn = useSession((s) => s.signIn);
  const locale = useSettings((s) => s.locale);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body =
        mode === 'login' ? { username, password } : { username, password, locale, ...(displayName.trim() ? { displayName: displayName.trim() } : {}) };
      const res = await api<{ token: string; user: PublicUser }>(`/api/auth/${mode}`, { method: 'POST', body });
      signIn(res.token, res.user);
    } catch (err) {
      setError(t(`errors.${err instanceof ApiError ? err.code : 'internal'}`));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-4">
      <div className="grid w-full max-w-4xl animate-rise items-center gap-6 lg:grid-cols-2">
        <div className="hidden flex-col gap-4 lg:flex">
          <h1 className="font-display text-5xl font-bold leading-tight text-gold">{t('app.title')}</h1>
          <p className="text-white/70">{t('app.tagline')}</p>
          <div className="grid grid-cols-2 gap-3">
            {(['roulette', 'blackjack', 'slots', 'sicbo'] as const).map((g) => (
              <div key={g} className="glass aspect-[5/3] overflow-hidden p-0">
                <GameArt game={g} />
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="glass mx-auto flex w-full max-w-md flex-col gap-3 p-5 sm:gap-4 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold">{mode === 'login' ? t('auth.login') : t('auth.register')}</h2>
            <LanguageSwitch />
          </div>
          {mode === 'register' && (
            <p className="rounded-xl border border-gold-300/30 bg-gold-300/10 px-3 py-2 text-sm text-gold-100">
              {t('auth.welcomeBonus', { amount: formatChips(ECONOMY.startingBalance, i18n.language) })}
            </p>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-white/60">{t('auth.username')}</span>
            <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" />
            {mode === 'register' && <span className="text-xs text-white/40">{t('auth.usernameHint')}</span>}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-white/60">{t('auth.password')}</span>
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'register' ? 8 : 1}
              maxLength={128}
            />
            {mode === 'register' && <span className="text-xs text-white/40">{t('auth.passwordHint')}</span>}
          </label>
          {mode === 'register' && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-white/60">{t('auth.displayName')}</span>
              <input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={24} />
            </label>
          )}
          {error && <p className="text-sm text-ruby-400">{error}</p>}
          <Button variant="gold" size="lg" type="submit" disabled={loading}>
            {loading ? t('app.loading') : mode === 'login' ? t('auth.submitLogin') : t('auth.submitRegister')}
          </Button>
          <button type="button" className="text-sm text-white/60 transition hover:text-gold-200" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin')}
          </button>
          <p className="text-[11px] leading-snug text-white/40">{t('app.disclaimer')}</p>
        </form>
      </div>
    </div>
  );
}
