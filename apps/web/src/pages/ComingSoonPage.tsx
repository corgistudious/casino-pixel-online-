import { useTranslation } from 'react-i18next';
import { AppShell, PageHeader } from '../ui/AppShell';
import { NavIcon, type NavIconName } from '../ui/NavIcons';

/** Navigation target for sections that are designed but not built yet. */
export function ComingSoonPage({ section }: { section: 'rooms' | 'collection' | 'missions' | 'friends' | 'gifts' }) {
  const { t } = useTranslation();
  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <PageHeader icon={section as NavIconName} title={t(`nav.${section}`)} />
        <div className="glass relative flex flex-col items-center gap-4 overflow-hidden px-6 py-12 text-center">
          <div className="pointer-events-none absolute -top-20 h-48 w-96 rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 h-48 w-96 rounded-full bg-gold-300/10 blur-3xl" />
          <div className="gold-border relative flex h-20 w-20 items-center justify-center rounded-3xl shadow-glow">
            <NavIcon name={section as NavIconName} size={40} active />
          </div>
          <span className="rounded-full border border-gold-300/40 bg-black/30 px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.2em] text-gold-200">
            {t('soon.title')}
          </span>
          <p className="max-w-lg text-base text-white/75">{t(`soon.${section}`)}</p>
          <p className="text-xs text-white/40">{t('soon.note')}</p>
        </div>
      </div>
    </AppShell>
  );
}
