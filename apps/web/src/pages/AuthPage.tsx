import { ECONOMY, type PublicUser } from '@casino/shared';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { Button } from '../ui/Button';
import { GameArt } from '../ui/Icons';
import { KeyoLogo } from '../ui/KeyoLogo';
import { toast } from '../ui/toast';
import { LanguageSwitch } from './SettingsPage';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

/** Runs an async form action with loading and error state shared by every account form. */
function useAction() {
  const { t, i18n } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(errorText(t, err, i18n.language));
    } finally {
      setLoading(false);
    }
  };
  return { error, setError, loading, run };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-white/60">{label}</span>
      {children}
      {hint && <span className="text-xs text-white/40">{hint}</span>}
    </label>
  );
}

/** Centered card with the brand column on wide screens; shared by sign-in and the e-mailed link pages. */
export function AuthFrame({ title, children, onSubmit }: { title: string; children: ReactNode; onSubmit?: (e: FormEvent) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-4">
      <div className="grid w-full max-w-4xl animate-rise items-center gap-6 lg:grid-cols-2">
        <div className="hidden flex-col gap-4 lg:flex">
          <KeyoLogo size={84} />
          <p className="text-white/70">{t('app.tagline')}</p>
          <div className="grid grid-cols-2 gap-3">
            {(['roulette', 'blackjack', 'slots', 'sicbo'] as const).map((g) => (
              <div key={g} className="glass aspect-[5/3] overflow-hidden p-0">
                <GameArt game={g} />
              </div>
            ))}
          </div>
        </div>
        <form onSubmit={onSubmit ?? ((e) => e.preventDefault())} className="glass mx-auto flex w-full max-w-md flex-col gap-3 p-5 sm:gap-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
            <LanguageSwitch />
          </div>
          {children}
          <p className="text-[11px] leading-snug text-white/40">{t('app.disclaimer')}</p>
        </form>
      </div>
    </div>
  );
}

const PASSWORD_PROPS = { className: 'field', type: 'password', required: true, minLength: 8, maxLength: 128, autoComplete: 'new-password' } as const;
const CODE_PROPS = { className: 'field tracking-[0.4em] tabular-nums', inputMode: 'numeric', pattern: '\\d{6}', maxLength: 6, required: true, autoComplete: 'one-time-code' } as const;

export function AuthPage() {
  const { t, i18n } = useTranslation();
  const signIn = useSession((s) => s.signIn);
  const locale = useSettings((s) => s.locale);
  const [mode, setMode] = useState<Mode>('login');
  const [login, setLogin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const { error, setError, loading, run } = useAction();

  const go = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setConfirm('');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if ((mode === 'register' || mode === 'reset') && password !== confirm) return setError(t('errors.password_mismatch'));
    void run(async () => {
      if (mode === 'login') {
        const res = await api<{ token: string; user: PublicUser }>('/api/auth/login', { method: 'POST', body: { login, password } });
        signIn(res.token, res.user);
      } else if (mode === 'register') {
        const body = { displayName: displayName.trim(), ...(email.trim() ? { email: email.trim() } : {}), password, confirmPassword: confirm, acceptTerms: true, locale };
        const res = await api<{ token: string; user: PublicUser }>('/api/auth/register', { method: 'POST', body });
        signIn(res.token, res.user, true);
      } else if (mode === 'forgot') {
        await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
        setNotice(t('auth.forgotSent'));
        setMode('reset');
      } else {
        await api('/api/auth/reset-password', { method: 'POST', body: { email, code, password, confirmPassword: confirm } });
        go('login');
        setNotice(t('auth.resetDone'));
      }
    });
  };

  const titles: Record<Mode, string> = { login: t('auth.login'), register: t('auth.register'), forgot: t('auth.forgotTitle'), reset: t('auth.forgotTitle') };
  const submitLabel: Record<Mode, string> = { login: t('auth.submitLogin'), register: t('auth.submitRegister'), forgot: t('auth.sendReset'), reset: t('auth.resetSubmit') };

  return (
    <AuthFrame title={titles[mode]} onSubmit={submit}>
      {mode === 'register' && (
        <p className="rounded-xl border border-gold-300/30 bg-gold-300/10 px-3 py-2 text-sm text-gold-100">
          {t('auth.welcomeBonus', { silver: formatChips(ECONOMY.welcome.silver, i18n.language) })}
        </p>
      )}
      {notice && <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-400">{notice}</p>}

      {mode === 'login' && (
        <>
          <Field label={locale === 'vi' ? 'UID hoặc email đã xác minh' : 'UID or verified email'}>
            <input className="field" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required maxLength={254} />
          </Field>
          <Field label={t('auth.password')}>
            <input {...PASSWORD_PROPS} minLength={1} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </>
      )}

      {mode === 'register' && (
        <>
          <Field label={t('auth.displayName')}>
            <input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={24} placeholder="Keyo Player" autoComplete="nickname" required />
          </Field>
          <Field label={t('auth.email')}>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} />
          </Field>
          <p className="text-xs text-white/55">{locale === 'vi' ? 'Email không bắt buộc, có thể liên kết sau trong Bảo mật.' : 'Email is optional; link it later in Security.'}</p>
          <Field label={t('auth.password')} hint={t('auth.passwordHint')}>
            <input {...PASSWORD_PROPS} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label={t('auth.confirmPassword')}>
            <input {...PASSWORD_PROPS} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <label className="flex items-start gap-2 text-xs leading-snug text-white/70">
            <input type="checkbox" className="mt-0.5 accent-gold-300" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
            <span>{t('auth.acceptTerms')}</span>
          </label>
        </>
      )}

      {(mode === 'forgot' || mode === 'reset') && (
        <>
          {mode === 'forgot' && <p className="text-sm text-white/60">{t('auth.forgotBody')}</p>}
          <Field label={t('auth.email')}>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={254} />
          </Field>
          {mode === 'reset' && (
            <>
              <Field label={t('auth.code')}>
                <input {...CODE_PROPS} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              </Field>
              <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')}>
                <input {...PASSWORD_PROPS} value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Field label={t('auth.confirmPassword')}>
                <input {...PASSWORD_PROPS} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
            </>
          )}
        </>
      )}

      {error && <p className="text-sm text-ruby-400" role="alert">{error}</p>}
      <Button variant="gold" size="lg" type="submit" disabled={loading}>
        {loading ? t('app.loading') : submitLabel[mode]}
      </Button>

      <div className="flex flex-wrap justify-between gap-2 text-sm text-white/60">
        {mode === 'login' && (
          <>
            <button type="button" className="transition hover:text-gold-200" onClick={() => go('register')}>
              {t('auth.switchToRegister')}
            </button>
            <button type="button" className="transition hover:text-gold-200" onClick={() => go('forgot')}>
              {t('auth.forgot')}
            </button>
          </>
        )}
        {mode === 'register' && (
          <button type="button" className="transition hover:text-gold-200" onClick={() => go('login')}>
            {t('auth.switchToLogin')}
          </button>
        )}
        {(mode === 'forgot' || mode === 'reset') && (
          <>
            <button type="button" className="transition hover:text-gold-200" onClick={() => go('login')}>
              {t('auth.backToLogin')}
            </button>
            {mode === 'forgot' && (
              <button type="button" className="transition hover:text-gold-200" onClick={() => go('reset')}>
                {t('auth.haveCode')}
              </button>
            )}
          </>
        )}
      </div>
    </AuthFrame>
  );
}

/** Pages opened from e-mailed links: `#/verify-email?token=`, `#/reset-password?token=`, `#/activate?token=`. */
export function EmailLinkPage({ kind }: { kind: 'verify' | 'reset' | 'activate' }) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const signIn = useSession((s) => s.signIn);
  const setUser = useSession((s) => s.setUser);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const { error, setError, loading, run } = useAction();
  const started = useRef(false);

  useEffect(() => {
    if (kind !== 'verify' || started.current) return;
    started.current = true;
    void run(async () => {
      await api('/api/auth/verify-email', { method: 'POST', body: { token } });
      setDone(true);
      // Refresh the signed-in session (if any) so the verification gate lifts immediately.
      if (user) setUser((await api<{ user: PublicUser }>('/api/me')).user);
    });
  }, [kind, token, run, user, setUser]);

  const back = (
    <Link to="/" className="text-center text-sm text-white/60 transition hover:text-gold-200">
      {t('auth.backToLogin')}
    </Link>
  );

  if (kind === 'verify') {
    return (
      <AuthFrame title={t('auth.verifyTitle')}>
        {loading && <p className="text-sm text-white/60">{t('auth.verifyLinkWorking')}</p>}
        {done && <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-400">{t('auth.verifyLinkOk')}</p>}
        {error && <p className="text-sm text-ruby-400" role="alert">{error}</p>}
        {back}
      </AuthFrame>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError(t('errors.password_mismatch'));
    void run(async () => {
      const body = { token, password, confirmPassword: confirm };
      if (kind === 'activate') {
        const res = await api<{ token: string; user: PublicUser }>('/api/auth/activate', { method: 'POST', body });
        signIn(res.token, res.user);
        navigate('/', { replace: true });
      } else {
        await api('/api/auth/reset-password', { method: 'POST', body });
        useSession.getState().signOut();
        toast(t('auth.resetDone'), 'success');
        setDone(true);
      }
    });
  };

  return (
    <AuthFrame title={kind === 'activate' ? t('auth.activateTitle') : t('auth.forgotTitle')} onSubmit={submit}>
      {kind === 'activate' && <p className="text-sm text-white/60">{t('auth.activateBody')}</p>}
      {done ? (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-400">{t('auth.resetDone')}</p>
      ) : (
        <>
          <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')}>
            <input {...PASSWORD_PROPS} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label={t('auth.confirmPassword')}>
            <input {...PASSWORD_PROPS} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-ruby-400" role="alert">{error}</p>}
          <Button variant="gold" size="lg" type="submit" disabled={loading || !token}>
            {loading ? t('app.loading') : kind === 'activate' ? t('auth.activateSubmit') : t('auth.resetSubmit')}
          </Button>
        </>
      )}
      {back}
    </AuthFrame>
  );
}

/** Shown instead of the game while the account's email is unverified; the server enforces the same restriction. */
export function VerifyEmailGate() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const signOut = useSession((s) => s.signOut);
  const [code, setCode] = useState('');
  const { error, loading, run } = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await api<{ user: PublicUser }>('/api/auth/verify-email', { method: 'POST', body: { code } });
      setUser(res.user);
    });
  };

  const resend = () =>
    void run(async () => {
      await api('/api/auth/resend-verification', { method: 'POST' });
      toast(t('auth.resent'), 'success');
    });

  return (
    <AuthFrame title={t('auth.verifyTitle')} onSubmit={submit}>
      <p className="text-sm text-white/70">{t('auth.verifyBody', { email: user.email ?? '' })}</p>
      <p className="rounded-xl border border-gold-300/30 bg-gold-300/10 px-3 py-2 text-xs text-gold-100">{t('auth.verifyPending')}</p>
      <Field label={t('auth.code')}>
        <input {...CODE_PROPS} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
      </Field>
      {error && <p className="text-sm text-ruby-400" role="alert">{error}</p>}
      <Button variant="gold" size="lg" type="submit" disabled={loading || code.length !== 6}>
        {loading ? t('app.loading') : t('auth.verifySubmit')}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm text-white/60">
        <button type="button" className="transition hover:text-gold-200" onClick={resend} disabled={loading}>
          {t('auth.resend')}
        </button>
        <button type="button" className="transition hover:text-gold-200" onClick={signOut}>
          {t('auth.logout')}
        </button>
      </div>
      <p className="text-xs text-white/45">{t('auth.neverShare')}</p>
    </AuthFrame>
  );
}
