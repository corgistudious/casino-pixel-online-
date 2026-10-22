import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { formatChips } from '../lib/format';
import { useSession } from '../store/session';
import { Avatar } from './Avatar';
import { CoinIcon } from './Icons';
import { useToasts } from './toast';

export function BalancePill({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const balance = useSession((s) => s.balance);
  return (
    <div className={`gold-border flex items-center gap-2 rounded-full ${compact ? 'px-2.5 py-1' : 'px-3.5 py-1.5'}`}>
      <CoinIcon size={compact ? 16 : 20} />
      <span className={`font-semibold tabular-nums text-gold-100 ${compact ? 'text-sm' : 'text-base'}`}>{formatChips(balance, i18n.language)}</span>
    </div>
  );
}

export function TopBar({ title, back = false }: { title?: string; back?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const online = useSession((s) => s.online);
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/5 bg-ink-950/60 px-4 backdrop-blur-xl">
      {back ? (
        <button onClick={() => navigate('/')} className="rounded-lg px-2 py-1 text-sm text-white/70 transition hover:bg-white/10 hover:text-white">
          ← {t('nav.back')}
        </button>
      ) : (
        <Link to="/" className="font-display text-lg font-bold text-gold">
          {t('app.title')}
        </Link>
      )}
      {title && <h1 className="font-display text-lg font-semibold text-white/90">{title}</h1>}
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden items-center gap-1.5 text-xs text-white/50 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#3fc583]" />
          {t('app.online', { count: online })}
        </span>
        <BalancePill compact />
        {user && (
          <Link to="/profile" aria-label={t('nav.profile')}>
            <Avatar index={user.avatar} size={36} />
          </Link>
        )}
      </div>
    </header>
  );
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`glass animate-rise px-4 py-2 text-sm ${t.tone === 'error' ? 'border-ruby-400/50 text-ruby-400' : t.tone === 'success' ? 'border-emerald-400/50 text-emerald-400' : 'text-white'}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function ConnectionBanner() {
  const { t } = useTranslation();
  const status = useSession((s) => s.status);
  if (status !== 'offline') return null;
  return <div className="fixed inset-x-0 top-0 z-50 bg-ruby-600/90 py-1 text-center text-xs font-medium backdrop-blur">{t('app.offline')}</div>;
}

/** Mobile web in portrait: ask the player to rotate (gameplay is landscape-only). */
export function RotateOverlay() {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[60] hidden flex-col items-center justify-center gap-6 bg-ink-950 p-8 text-center portrait:max-md:flex">
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none" className="animate-pulse">
        <rect x="22" y="8" width="28" height="48" rx="5" stroke="#f2c14e" strokeWidth="3" />
        <path d="M58 40a22 22 0 0 1-22 22" stroke="#f2c14e" strokeWidth="3" strokeLinecap="round" />
        <path d="M36 56l0 6 6-2" stroke="#f2c14e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="font-display text-xl text-gold-100">{t('app.rotate')}</p>
    </div>
  );
}
