import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { IS_DEMO } from '../demo';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { sfx } from '../audio/sfx';
import { useSession } from '../store/session';
import { Avatar } from './Avatar';
import { CurrencyIcon } from './OfficialAssets';
import { KeyoLogo } from './KeyoLogo';
import { useToasts } from './toast';

export function BalancePill({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const balance = useSession((s) => s.balance);
  const gold = useSession((s) => s.gold);
  const icon = compact ? 20 : 26;
  const text = `font-semibold tabular-nums ${compact ? 'text-sm' : 'text-base'}`;
  return (
    <div className={`gold-border flex items-center rounded-full ${compact ? 'gap-2 px-2 py-0.5' : 'gap-3 px-3 py-1'}`}>
      <span className="flex items-center gap-1" title={t('currency.silver')}>
        <CurrencyIcon currency="silver" size={icon} />
        <span className={`${text} text-white`}>{formatChips(balance, i18n.language)}</span>
      </span>
      <span className="h-4 w-px bg-white/15" />
      <span className="flex items-center gap-1" title={t('currency.gold')}>
        <CurrencyIcon currency="gold" size={icon} />
        <span className={`${text} text-gold-100`}>{formatChips(gold, i18n.language)}</span>
      </span>
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
        <Link to="/" aria-label={t('app.title')}>
          <KeyoLogo size={30} />
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
            <Avatar customAvatar={user.customAvatar} index={user.avatar} frame={user.frame} avatarItem={user.avatarItem} size={36} />
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

/**
 * Permanent corner label on servers running with KEYO_DATA_MODE=test, so testers never mistake
 * test data for the real game. Hidden on production servers and in the UI preview build.
 */
export function TestEnvBadge() {
  const { t } = useTranslation();
  const [test, setTest] = useState(false);
  useEffect(() => {
    if (IS_DEMO) return;
    void api<{ dataMode?: string }>('/api/health').then((r) => setTest(r.dataMode === 'test'), () => {});
  }, []);
  if (!test) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-2 left-2 z-[55] max-w-[min(22rem,calc(100vw-1rem))] rounded-lg border border-neon-cyan/50 bg-ink-950/85 px-2.5 py-1.5 text-[10px] leading-snug text-neon-cyan shadow-lg backdrop-blur"
      role="note"
    >
      <span className="font-bold tracking-wider">{t('env.test')}</span> · <span className="text-white/70">{t('env.testNote')}</span>
    </div>
  );
}

/** Level-up celebration: a short, non-blocking banner (the game keeps running underneath). */
export function LevelUpBanner() {
  const { t } = useTranslation();
  const level = useSession((s) => s.levelUp);
  const dismiss = useSession((s) => s.dismissLevelUp);
  useEffect(() => {
    if (level === null) return;
    sfx.win();
    const id = setTimeout(dismiss, 3800);
    return () => clearTimeout(id);
  }, [level, dismiss]);
  if (level === null) return null;
  return (
    <button
      type="button"
      onClick={dismiss}
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-24 z-50 flex -translate-x-1/2 animate-rise items-center gap-4 rounded-2xl border border-gold-300/70 bg-gradient-to-br from-[#3b2470] via-[#1a1040] to-[#0b0822] px-6 py-3 text-left shadow-[0_0_40px_rgba(242,193,78,0.45)]"
    >
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-gold-300 bg-[radial-gradient(circle_at_35%_30%,#ffe08a,#a8700f)] font-display text-2xl font-bold text-ink-900">
        <span className="absolute inset-0 animate-ping rounded-full border-2 border-gold-300/60 motion-reduce:hidden" />
        {level}
      </span>
      <span>
        <span className="block font-display text-xl font-bold text-gold-100">{t('level.up')}</span>
        <span className="block text-sm text-white/75">{t('level.upBody', { level })}</span>
      </span>
    </button>
  );
}
