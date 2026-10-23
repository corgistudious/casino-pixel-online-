import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IS_DEMO } from '../../demo';
import { DemoBanner } from '../../ui/AppShell';
import { TopBar } from '../../ui/Chrome';

/** Landscape layout: table canvas on the left, control panel on the right. */
export function GameLayout({ title, canvas, panel }: { title: string; canvas: ReactNode; panel: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col">
      <DemoBanner />
      <TopBar title={title} back />
      <div className="flex min-h-0 flex-1 gap-2 p-2 sm:gap-3 sm:p-3">
        <div className="relative min-w-0 flex-1 animate-rise">
          {canvas}
          {IS_DEMO && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit max-w-[90%] rounded-xl border border-neon-cyan/40 bg-ink-950/85 px-4 py-2 text-center text-xs text-neon-cyan backdrop-blur">
              {t('demo.tableOffline')}
            </div>
          )}
        </div>
        <aside className="glass flex w-52 shrink-0 animate-rise flex-col gap-2 overflow-y-auto p-2.5 [&>*]:shrink-0 md:w-60 md:gap-3 md:p-3 lg:w-72">{panel}</aside>
      </div>
    </div>
  );
}

export function Stat({ label, value, accent = false }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/25 px-3 py-2">
      <div className="text-[11px] uppercase tracking-widest text-white/40">{label}</div>
      <div className={`font-semibold tabular-nums ${accent ? 'text-gold-200' : 'text-white'}`}>{value}</div>
    </div>
  );
}
