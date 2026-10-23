import { ECONOMY } from '@casino/shared';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../lib/format';
import { useSession } from '../store/session';
import { Button } from '../ui/Button';
import { CurrencyIcon } from '../ui/OfficialAssets';

/** Shown once after registration: the welcome pack that was credited. */
export function WelcomeModal() {
  const { t, i18n } = useTranslation();
  const show = useSession((s) => s.justRegistered);
  const dismiss = useSession((s) => s.dismissWelcome);
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="glass relative w-full max-w-md animate-rise overflow-hidden p-6 text-center">
        <span className="sheen" />
        <h2 className="font-display text-2xl font-bold text-gold">{t('welcome.title')}</h2>
        <p className="mt-2 text-sm text-white/70">{t('welcome.body')}</p>
        <div className="my-5 flex items-center justify-center gap-6">
          {(['silver', 'gold'] as const).map((c) => (
            <div key={c} className="flex flex-col items-center gap-1">
              <CurrencyIcon currency={c} size={72} />
              <span className="font-display text-xl font-bold tabular-nums">{formatChips(ECONOMY.welcome[c], i18n.language)}</span>
              <span className="text-xs text-white/60">{t(`currency.${c}`)}</span>
            </div>
          ))}
        </div>
        <Button variant="gold" size="lg" className="w-full" onClick={dismiss}>
          {t('welcome.cta')}
        </Button>
      </div>
    </div>
  );
}
