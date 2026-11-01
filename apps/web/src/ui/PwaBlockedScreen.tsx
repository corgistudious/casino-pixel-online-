import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PwaPolicy } from '../lib/pwaBlock';

/**
 * Shown INSTEAD of the game when the installed home-screen app is blocked (lib/pwaBlock.ts).
 * Self-contained on purpose: its own fixed, scrollable full-window layer with safe-area padding,
 * no dependency on the game layout or the viewport controller, so it stays readable and usable even
 * with a misbehaving iOS window. It never navigates: the player copies the link and opens a browser
 * (an installed app cannot reliably open Safari / Chrome by itself).
 */
const LOGO = '/assets/official/keyo-game-logo.png';
const COIN = '/assets/official/cxu-vang.png';

/** Clipboard API first; then the legacy selection copy (older iOS / non-secure contexts). */
async function copyText(text: string, field: HTMLInputElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  if (!field) return false;
  field.focus();
  field.setSelectionRange(0, text.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

export function PwaBlockedScreen({ policy }: { policy: PwaPolicy }) {
  const { t, i18n } = useTranslation();
  const field = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const lang = i18n.language === 'en' ? 'en' : 'vi';

  const copy = async () => {
    const ok = await copyText(policy.url, field.current);
    setStatus(ok ? 'copied' : 'manual');
    if (!ok) field.current?.select();
  };

  return (
    <main
      data-testid="pwa-blocked"
      className="fixed inset-0 z-[300] overflow-y-auto overflow-x-hidden bg-[radial-gradient(ellipse_at_50%_0%,#18305f_0%,#0b1733_45%,#050a19_100%)] text-white"
      style={{ padding: 'max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))' }}
    >
      {/* Very light decoration: two blurred Cxu coins and a soft glow, never over the content. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-20%] h-[60%] w-[80%] -translate-x-1/2 rounded-full bg-neon-cyan/10 blur-3xl" />
        <img src={COIN} alt="" className="absolute -left-6 bottom-[8%] w-24 rotate-[-18deg] opacity-[0.07] blur-[1px]" />
        <img src={COIN} alt="" className="absolute -right-4 top-[12%] w-16 rotate-[22deg] opacity-[0.06] blur-[1px]" />
      </div>

      <div className="relative flex min-h-full items-center justify-center">
        <section
          aria-labelledby="pwa-blocked-title"
          className="pwa-in relative w-full max-w-[30rem] rounded-3xl border border-gold-300/30 bg-[#0c1834]/85 p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md [@media(max-height:740px)]:p-5 short:grid short:max-w-[46rem] short:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] short:items-center short:gap-6 short:p-5"
        >
          <div role="group" aria-label={t('pwaBlock.language')} className="absolute right-3 top-3 flex overflow-hidden rounded-full border border-white/15 text-[11px] font-semibold">
            {(['vi', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => void i18n.changeLanguage(l)}
                className={`px-2.5 py-1 transition-colors ${lang === l ? 'bg-neon-cyan/20 text-neon-cyan' : 'text-white/55 hover:text-white/80'}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex flex-col items-center text-center">
            <img
              src={LOGO}
              alt="Keyo Game"
              width={1431}
              height={1099}
              className="h-28 w-auto object-contain drop-shadow-[0_0_18px_rgba(242,193,78,0.35)] [@media(max-height:740px)]:h-20 short:h-20"
            />
            <h1 id="pwa-blocked-title" className="mt-4 font-display text-[1.6rem] font-bold leading-tight text-white [@media(max-height:740px)]:mt-3 [@media(max-height:740px)]:text-[1.35rem] short:mt-2 short:text-xl">
              {t('pwaBlock.title')}
            </h1>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-white/80 [@media(max-height:740px)]:mt-2 [@media(max-height:740px)]:text-sm short:mt-2 short:text-sm">{t('pwaBlock.body1')}</p>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-white/80 [@media(max-height:740px)]:text-sm short:text-sm">{t('pwaBlock.body2')}</p>
          </div>

          <div className="mt-5 flex flex-col gap-3 [@media(max-height:740px)]:mt-4 [@media(max-height:740px)]:gap-2.5 short:mt-0 short:pt-8">
            <div className="rounded-2xl border border-neon-cyan/25 bg-[#081127]/80 p-3">
              <label htmlFor="pwa-blocked-url" className="text-[11px] font-semibold uppercase tracking-wider text-neon-cyan/80">
                {t('pwaBlock.linkLabel')}
              </label>
              <input
                id="pwa-blocked-url"
                ref={field}
                readOnly
                value={policy.url}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-1 w-full truncate bg-transparent text-base font-semibold text-neon-cyan outline-none"
              />
              <p className="mt-2 text-xs leading-snug text-white/60">{t('pwaBlock.howTo')}</p>
            </div>
            <button
              type="button"
              onClick={() => void copy()}
              className="w-full rounded-2xl bg-[linear-gradient(135deg,#fff1b8_0%,#f2c14e_45%,#d29a2c_100%)] px-4 py-3.5 text-base font-bold [@media(max-height:740px)]:py-3 text-[#1d1405] shadow-[0_10px_24px_-10px_rgba(242,193,78,0.7)] transition-transform duration-150 hover:brightness-105 active:scale-[0.97] motion-reduce:transition-none"
            >
              {t('pwaBlock.copy')}
            </button>
            <p role="status" aria-live="polite" className={`min-h-[1.25rem] text-center text-sm leading-snug ${status === 'copied' ? 'text-emerald-400' : 'text-gold-100'}`}>
              {status === 'copied' ? t('pwaBlock.copied') : status === 'manual' ? t('pwaBlock.copyManual') : ''}
            </p>
            <p className="text-center text-xs text-gold-100/70">{t('pwaBlock.footer')}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
