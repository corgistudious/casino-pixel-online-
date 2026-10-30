import { SUPPORT_EMAIL, type SupportCategory } from '@casino/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { useSession } from '../store/session';
import { Button } from '../ui/Button';
import { KeyoLogo } from '../ui/KeyoLogo';
import { toast } from '../ui/toast';

/**
 * Keyo Captain's support menu. Keyo Captain takes no direct messages: every "Message" button for
 * UID 1000 (friends, profile, player menus, chat deep links) opens this menu instead. Guides are
 * static text; anything needing staff goes to the existing Support Center ticket form.
 */

export const BEGINNER_TOPICS = [
  'gettingStarted',
  'createAccount',
  'verifyEmail',
  'changePassword',
  'forgotPassword',
  'currency',
  'vip',
  'rankLevel',
  'friends',
  'gifts',
  'games',
  'faq',
] as const;
export type GuideTopic = (typeof BEGINNER_TOPICS)[number] | 'security' | 'reporting';
export const FAQ_IDS = ['money', 'dm', 'balance', 'email', 'reset', 'fair'] as const;

/** Contact topics and the Support Center category each one files under. */
export const CONTACT_TOPICS: { id: string; category: SupportCategory | null; icon: string }[] = [
  { id: 'official', category: null, icon: '✉️' },
  { id: 'account', category: 'account', icon: '🔐' },
  { id: 'bug', category: 'game', icon: '🐞' },
  { id: 'wallet', category: 'payment', icon: '🪙' },
  { id: 'report', category: 'report', icon: '🚩' },
  { id: 'lag', category: 'game', icon: '📶' },
  { id: 'update', category: 'other', icon: '🔄' },
  { id: 'other', category: 'other', icon: '💬' },
];
const GUIDE_ICON: Record<GuideTopic, string> = {
  gettingStarted: '🚀',
  createAccount: '🆕',
  verifyEmail: '📧',
  changePassword: '🔑',
  forgotPassword: '❓',
  currency: '🪙',
  vip: '👑',
  rankLevel: '🏆',
  friends: '👥',
  gifts: '🎁',
  games: '🎲',
  faq: '💡',
  security: '🛡️',
  reporting: '🚩',
};

type View = 'home' | 'beginner' | 'contact' | 'official';
interface SupportMenuStore {
  view: View | null;
  show(view?: View): void;
  hide(): void;
}
export const useSupportMenu = create<SupportMenuStore>((set) => ({
  view: null,
  show: (view = 'home') => set({ view }),
  hide: () => set({ view: null }),
}));
export const openSupportMenu = (view?: View) => useSupportMenu.getState().show(view);

/** The Support Center link for a contact topic (prefills the new-request form). */
export const ticketLink = (topic: string, category: SupportCategory) => `/support?tab=new&category=${category}&topic=${topic}`;

/** Keyo Captain's portrait: the official crest in a gold ring with an "on duty" dot. */
export function CaptainAvatar({ size = 56, dot = true }: { size?: number; dot?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span className="flex h-full w-full items-center justify-center rounded-full border-2 border-gold-300/80 bg-gradient-to-br from-violet-900 via-[#1b0f33] to-black shadow-[0_0_18px_rgba(242,193,78,0.35)]">
        <KeyoLogo size={Math.round(size * 0.62)} />
      </span>
      {dot && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-ink-950 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" aria-hidden />}
    </span>
  );
}

/** "Official Support" + "Owner" chips shown next to Keyo Captain everywhere. */
export function CaptainBadges({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      <span className="rounded-full border border-sky-300/40 bg-sky-500/15 px-1.5 py-px text-[10px] font-label leading-tight text-sky-100">✔ {t('captain.official')}</span>
      <span className="rounded-full border border-gold-300/50 bg-gold-300/15 px-1.5 py-px text-[10px] font-label leading-tight text-gold-100">♛ {t('captain.owner')}</span>
    </span>
  );
}

/** One expandable guide (native <details>, so it works with keyboard and screen readers). */
export function GuideItem({ topic, defaultOpen = false }: { topic: GuideTopic; defaultOpen?: boolean }) {
  const { t } = useTranslation();
  if (topic === 'faq') return <FaqList />;
  return (
    <details className="group rounded-xl border border-white/10 bg-black/25 open:border-gold-300/35 open:bg-violet-950/40" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-label text-white/90 [&::-webkit-details-marker]:hidden">
        <span aria-hidden>{GUIDE_ICON[topic]}</span>
        <span className="flex-1">{t(`captain.guides.${topic}.title`)}</span>
        <span className="text-gold-200 transition group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <p className="px-3 pb-3 text-[13px] leading-relaxed text-white/75">{t(`captain.guides.${topic}.body`)}</p>
    </details>
  );
}

export function FaqList() {
  const { t } = useTranslation();
  return (
    <details className="group rounded-xl border border-white/10 bg-black/25 open:border-gold-300/35 open:bg-violet-950/40">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-label text-white/90 [&::-webkit-details-marker]:hidden">
        <span aria-hidden>{GUIDE_ICON.faq}</span>
        <span className="flex-1">{t('captain.guides.faq.title')}</span>
        <span className="text-gold-200 transition group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <dl className="flex flex-col gap-2 px-3 pb-3">
        {FAQ_IDS.map((id) => (
          <div key={id}>
            <dt className="text-[13px] font-label text-gold-100">{t(`captain.faq.${id}.q`)}</dt>
            <dd className="text-[13px] leading-relaxed text-white/75">{t(`captain.faq.${id}.a`)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Official email card: copy, mailto and a link to the Support Center. No email is sent by the server. */
export function OfficialContact({ onOpenCenter }: { onOpenCenter?: () => void }) {
  const { t } = useTranslation();
  const uid = useSession((s) => s.user?.uid);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      toast(t('captain.email.copied'), 'success');
    } catch {
      toast(t('captain.email.copyFailed'), 'error');
    }
  };
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('captain.email.subject', { uid: uid ?? '' }))}`;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gold-300/30 bg-gradient-to-br from-violet-950/70 to-black/60 p-4">
      <div className="flex items-center gap-3">
        <CaptainAvatar size={44} />
        <div className="min-w-0">
          <div className="font-strong text-white">{t('captain.name')}</div>
          <CaptainBadges />
        </div>
      </div>
      <p className="text-[13px] text-white/70">{t('captain.email.body')}</p>
      <div className="select-all break-all rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-center font-strong tracking-wide text-gold-100">{SUPPORT_EMAIL}</div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" onClick={() => void copy()}>
          {t('captain.email.copy')}
        </Button>
        <a href={mailto} className="inline-flex items-center justify-center rounded-xl border border-gold-300/40 bg-gold-300/10 px-3 py-1.5 text-sm font-strong text-gold-100 transition hover:bg-gold-300/20">
          {t('captain.email.send')}
        </a>
      </div>
      {onOpenCenter && (
        <Button size="sm" variant="gold" onClick={onOpenCenter}>
          {t('captain.email.openCenter')}
        </Button>
      )}
      <p className="text-[11px] text-amber-100/80">🛡️ {t('captain.email.note')}</p>
    </div>
  );
}

/** Mount once inside the router. */
export function SupportMenuHost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { view, show, hide } = useSupportMenu();
  const box = useRef<HTMLDivElement>(null);
  const [lastFocus, setLastFocus] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!view) return;
    setLastFocus((f) => f ?? (document.activeElement as HTMLElement | null));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, hide]);
  useEffect(() => {
    if (view) box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    else if (lastFocus) {
      lastFocus.focus?.();
      setLastFocus(null);
    }
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!view) return null;
  const go = (path: string) => {
    hide();
    navigate(path);
  };
  const back = view === 'official' ? 'contact' : 'home';

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-ink-950/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4 short:items-center short:p-2" onClick={hide}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-menu-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[min(88dvh,640px)] w-full flex-col overflow-hidden rounded-t-3xl border border-gold-300/45 bg-gradient-to-b from-[#24103f] via-[#140a26] to-[#08050f] shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_24px_70px_-10px_rgba(0,0,0,0.9)] sm:max-w-md sm:rounded-3xl short:max-h-[94dvh] short:max-w-2xl short:rounded-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-gold-300/20 bg-gradient-to-r from-violet-700/30 via-fuchsia-700/10 to-transparent px-4 py-3 short:py-2">
          {view !== 'home' ? (
            <button type="button" onClick={() => show(back)} className="rounded-lg px-2 py-1 text-gold-100 hover:bg-white/10" aria-label={t('captain.menu.back')}>
              ←
            </button>
          ) : null}
          <CaptainAvatar size={40} />
          <div className="min-w-0 flex-1">
            <h2 id="support-menu-title" className="truncate font-display text-lg font-heading text-gold-100">
              {view === 'home' ? t('captain.menu.title') : view === 'beginner' ? t('captain.menu.beginner') : view === 'contact' ? t('captain.menu.contact') : t('captain.email.title')}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/60">
              <span className="font-strong text-white/85">{t('captain.name')}</span>
              <span className="inline-flex items-center gap-1 text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                {t('captain.onDuty')}
              </span>
            </div>
          </div>
          <button type="button" data-autofocus onClick={hide} className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label={t('captain.menu.close')}>
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {view === 'home' && (
            <div className="flex flex-col gap-3">
              <p className="rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white/85">{t('captain.greeting')}</p>
              <div className="grid gap-2 short:grid-cols-2">
                {(['beginner', 'contact'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => show(v)}
                    className="flex items-center gap-3 rounded-2xl border border-gold-300/30 bg-gradient-to-r from-violet-800/40 to-black/40 px-4 py-3 text-left transition hover:border-gold-300/70 hover:from-violet-700/50"
                  >
                    <span className="text-2xl" aria-hidden>
                      {v === 'beginner' ? '📘' : '🎧'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-strong text-gold-100">{t(`captain.menu.${v}`)}</span>
                      <span className="block text-xs text-white/55">{t(`captain.menu.${v}Desc`)}</span>
                    </span>
                    <span className="text-gold-200" aria-hidden>
                      ›
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-white/45">{t('captain.noDm')}</p>
            </div>
          )}

          {view === 'beginner' && (
            <div className="grid gap-2 short:grid-cols-2 short:items-start">
              {BEGINNER_TOPICS.map((topic) => (
                <GuideItem key={topic} topic={topic} />
              ))}
            </div>
          )}

          {view === 'contact' && (
            <div className="grid gap-2 sm:grid-cols-2">
              {CONTACT_TOPICS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => (c.category ? go(ticketLink(c.id, c.category)) : show('official'))}
                  className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-left transition hover:border-gold-300/50 hover:bg-violet-900/30"
                >
                  <span className="text-xl" aria-hidden>
                    {c.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-strong text-white">{t(`captain.contact.${c.id}.title`)}</span>
                    <span className="block truncate text-[11px] text-white/50">{t(`captain.contact.${c.id}.desc`)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {view === 'official' && <OfficialContact onOpenCenter={() => go('/support')} />}
        </div>
      </div>
    </div>
  );
}
