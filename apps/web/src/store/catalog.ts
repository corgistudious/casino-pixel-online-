import type { CatalogItem } from '@casino/shared';
import { create } from 'zustand';
import { API_URL } from '../config';
import { api } from '../net/api';

interface CatalogStore {
  items: Record<string, CatalogItem>;
  loaded: boolean;
  load(): Promise<void>;
}

/** Public item catalog (frames, avatars, collectibles) used to render anything a player owns or shows. */
export const useCatalog = create<CatalogStore>((set) => ({
  items: {},
  loaded: false,
  async load() {
    try {
      const { items } = await api<{ items: CatalogItem[] }>('/api/catalog');
      set({ items: Object.fromEntries(items.map((i) => [i.id, i])), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));

/** Absolute URL for an uploaded asset (the API may live on another origin in the apps). */
export function assetSrc(path: string | null | undefined): string | undefined {
  return path ? (path.startsWith('http') ? path : API_URL + path) : undefined;
}

/** Localised item name with a fallback to the id. */
export function itemName(item: CatalogItem | undefined, lang: string, fallback: string): string {
  if (!item) return fallback;
  return lang.startsWith('vi') ? item.name.vi : item.name.en;
}
