import type { Locale } from '@casino/shared';
import { create } from 'zustand';
import { storage } from '../lib/storage';

interface Settings {
  locale: Locale;
  volume: number;
  reduceMotion: boolean;
}

interface SettingsStore extends Settings {
  set(patch: Partial<Settings>): void;
}

const KEY = 'cpo.settings';

function load(): Settings {
  const fallback: Settings = {
    locale: navigator.language?.toLowerCase().startsWith('vi') ? 'vi' : navigator.language ? 'en' : 'vi',
    volume: 0.6,
    reduceMotion: matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  };
  try {
    return { ...fallback, ...(JSON.parse(storage.get(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return fallback;
  }
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  set(patch) {
    set(patch);
    const { locale, volume, reduceMotion } = get();
    storage.set(KEY, JSON.stringify({ locale, volume, reduceMotion }));
  },
}));
