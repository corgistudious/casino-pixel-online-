import { LOCALES, type PublicUser } from '@casino/shared';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '../config';
import { api } from '../net/api';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { TopBar } from '../ui/Chrome';

const LOCALE_NAMES = { vi: 'Tiếng Việt', en: 'English' } as const;

export function LanguageSwitch() {
  const locale = useSettings((s) => s.locale);
  const set = useSettings((s) => s.set);
  const user = useSession((s) => s.user);
  return (
    <div className="flex rounded-full border border-white/10 bg-black/30 p-0.5 text-xs">
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => {
            set({ locale: l });
            // Persist on the account too so other devices pick it up.
            if (user) void api<{ user: PublicUser }>('/api/me', { method: 'PATCH', body: { locale: l } }).catch(() => {});
          }}
          className={`rounded-full px-3 py-1 transition ${l === locale ? 'bg-gold-sheen font-semibold text-ink-900' : 'text-white/60 hover:text-white'}`}
        >
          {LOCALE_NAMES[l]}
        </button>
      ))}
    </div>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { volume, reduceMotion, set } = useSettings();
  return (
    <div className="flex h-full flex-col">
      <TopBar title={t('settings.title')} back />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="glass mx-auto flex max-w-xl flex-col gap-5 p-6">
          <div className="flex items-center justify-between gap-4">
            <span>{t('settings.language')}</span>
            <LanguageSwitch />
          </div>
          <label className="flex items-center justify-between gap-4">
            <span>{t('settings.sound')}</span>
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => set({ volume: Number(e.target.value) })} className="w-48 accent-gold-300" />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span>{t('settings.reduceMotion')}</span>
            <button
              onClick={() => set({ reduceMotion: !reduceMotion })}
              className={`relative h-7 w-14 rounded-full transition ${reduceMotion ? 'bg-gold-sheen' : 'bg-white/15'}`}
              aria-pressed={reduceMotion}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${reduceMotion ? 'left-8' : 'left-1'}`} />
              <span className="sr-only">{reduceMotion ? t('settings.on') : t('settings.off')}</span>
            </button>
          </label>
          <div className="border-t border-white/10 pt-4 text-sm text-white/50">
            <p className="font-display text-base text-white/80">{t('settings.about')}</p>
            <p>{t('settings.version', { version: APP_VERSION })}</p>
            <p className="mt-2 text-xs">{t('app.disclaimer')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
