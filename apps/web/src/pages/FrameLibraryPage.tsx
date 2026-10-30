import { DEFAULT_FRAME, FRAME_LIBRARY, LB_BOARDS, type FrameDef, type InventoryEntry, type PublicUser } from '@casino/shared';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';
import { api } from '../net/api';
import { itemName, useCatalog } from '../store/catalog';
import { useSession } from '../store/session';
import { AppShell, PageHeader } from '../ui/AppShell';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';
import { RARITY_TONE } from './CollectionPage';

const COLLECTIONS = ['podium', 'hall_of_fame', 'seasonal', 'tournament', 'role'] as const;
type Collection = (typeof COLLECTIONS)[number];

/**
 * Frame Library: every built-in frame in one place, grouped by where it comes from. Owned frames
 * (and role frames the player's current role allows) can be previewed large and equipped; the
 * others show how they are obtained. Seasonal frames appear only once released. The server
 * re-checks every equip (ownership, expiry, real role).
 */
export function FrameLibraryPage() {
  const { t, i18n } = useTranslation();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const catalog = useCatalog((c) => c.items);
  const [inv, setInv] = useState<{ items: InventoryEntry[]; roleFrames: string[] } | null>(null);
  const [tab, setTab] = useState<Collection>('podium');
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lang = i18n.language === 'en' ? 'en' : 'vi';

  const load = () => void api<{ items: InventoryEntry[]; roleFrames?: string[] }>('/api/me/inventory').then((r) => setInv({ items: r.items, roleFrames: r.roleFrames ?? [] }), (err) => toast(errorText(t, err, i18n.language), 'error'));
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ownership = useMemo(() => {
    const m = new Map<string, { active: boolean; expiresAt: string | null }>();
    const byItem = new Map<string, InventoryEntry[]>();
    for (const e of inv?.items ?? []) if (e.kind === 'frame') byItem.set(e.itemId, [...(byItem.get(e.itemId) ?? []), e]);
    for (const [id, entries] of byItem) {
      const live = entries.filter((e) => e.active);
      const permanent = live.some((e) => !e.expiresAt);
      const latest = (xs: InventoryEntry[]) => xs.map((e) => e.expiresAt).filter((x): x is string => !!x).sort().at(-1) ?? null;
      m.set(id, { active: live.length > 0, expiresAt: permanent ? null : latest(live.length ? live : entries) });
    }
    for (const id of inv?.roleFrames ?? []) m.set(id, { active: true, expiresAt: null });
    return m;
  }, [inv]);

  const visible = (f: FrameDef) => (f.collection === 'role' ? (inv?.roleFrames ?? []).includes(f.id) || !!catalog[f.id] : !!catalog[f.id] || ownership.has(f.id));
  const list = FRAME_LIBRARY.filter((f) => f.collection === tab && visible(f) && (!onlyOwned || ownership.get(f.id)?.active));
  const unreleased = tab === 'seasonal' ? FRAME_LIBRARY.filter((f) => f.collection === 'seasonal' && !visible(f)).length : 0;
  const current = list.find((f) => f.id === selected) ?? list[0];
  const own = current ? ownership.get(current.id) : undefined;

  const equip = async (itemId: string | null) => {
    setBusy(true);
    try {
      const { user: fresh } = await api<{ user: PublicUser }>('/api/me/equip', { method: 'POST', body: { slot: 'frame', itemId: itemId ?? DEFAULT_FRAME } });
      setUser(fresh);
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    } finally {
      setBusy(false);
    }
  };

  const how = (f: FrameDef) => {
    if (f.collection === 'podium') {
      const family = f.id.split('_')[1]!;
      const tier = f.id.split('_')[2]!;
      const board = LB_BOARDS.find((b) => b.reward === family);
      const place = tier === 'champion' ? 1 : tier === 'elite' ? 2 : 3;
      const boardName = board ? `${board.game ? t(`lb.gameNames.${board.game}`) + ' · ' : ''}${t(`lb.metrics.${board.metric}`)}` : family;
      return t('frameLib.how.podium', { place, board: boardName });
    }
    if (f.collection === 'hall_of_fame') return t('frameLib.how.hall_of_fame', { place: f.id.endsWith('champion') ? 1 : f.id.endsWith('elite') ? 2 : 3 });
    return t(`frameLib.how.${f.collection}`);
  };
  const date = (s: string) => new Date(s).toLocaleDateString(i18n.language);

  return (
    <AppShell>
      <div className="flex flex-col gap-3 p-3 lg:p-5 short:gap-2 short:p-2">
        <PageHeader icon="collection" title={t('frameLib.title')} subtitle={t('frameLib.subtitle')} />
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1" role="tablist" aria-label={t('frameLib.title')}>
          {COLLECTIONS.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={tab === c} onClick={() => { setTab(c); setSelected(null); }} className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${tab === c ? 'border-gold-300/70 bg-gold-300/20 text-gold-100' : 'border-white/10 text-white/60 hover:bg-white/10'}`}>
              {t(`frameLib.collections.${c}`)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input type="checkbox" className="accent-gold-300" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.target.checked)} /> {t('frameLib.onlyOwned')}
        </label>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem] short:grid-cols-[minmax(0,1fr)_16rem]">
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6 short:grid-cols-4">
            {list.map((f) => {
              const o = ownership.get(f.id);
              return (
                <li key={f.id}>
                  <button type="button" onClick={() => setSelected(f.id)} aria-pressed={current?.id === f.id} className={`flex w-full flex-col items-center gap-1 rounded-xl border px-1 pb-2 pt-4 text-center transition ${current?.id === f.id ? 'border-gold-300/70 bg-gold-300/10' : 'border-white/10 bg-black/25 hover:border-white/30'} ${o?.active ? '' : 'opacity-70'}`}>
                    <span className="p-2">
                      <Avatar index={user.avatar} customAvatar={user.customAvatar} avatarItem={user.avatarItem} frame={f.id} size={44} />
                    </span>
                    <span className="line-clamp-2 text-[11px] leading-tight text-white/85">{itemName(catalog[f.id], lang, f.name[lang])}</span>
                    <span className={`text-[10px] ${o?.active ? 'text-emerald-300' : 'text-white/40'}`}>{user.frame === f.id ? t('frameLib.equipped') : o?.active ? t('frameLib.owned') : t('frameLib.locked')}</span>
                  </button>
                </li>
              );
            })}
            {list.length === 0 && <li className="col-span-full p-6 text-center text-sm text-white/50">{t('lb.empty')}</li>}
            {unreleased > 0 && <li className="col-span-full text-center text-[11px] text-white/40">{t('frameLib.unreleased', { n: unreleased })}</li>}
          </ul>
          {current && (
            <aside className="glass flex flex-col items-center gap-3 p-4 text-center lg:sticky lg:top-3 lg:self-start short:p-3">
              <span className="p-6 short:p-4">
                <Avatar index={user.avatar} customAvatar={user.customAvatar} avatarItem={user.avatarItem} frame={current.id} size={112} animated />
              </span>
              <div>
                <h2 className="font-display text-lg font-heading text-white">{itemName(catalog[current.id], lang, current.name[lang])}</h2>
                <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] ${RARITY_TONE[current.rarity]}`}>{t(`rarity.${current.rarity}`)}</span>
              </div>
              <p className="text-xs text-white/65">{current.description[lang]}</p>
              <p className="text-[11px] text-gold-200/80">{how(current)}</p>
              {current.collection === 'role' && <p className="text-[11px] text-white/50">{t('frameLib.roleNote')}</p>}
              {own?.active ? (
                <>
                  <p className="text-[11px] text-white/50">{own.expiresAt ? t('frameLib.until', { date: date(own.expiresAt) }) : t('frameLib.permanent')}</p>
                  {user.frame === current.id ? (
                    <Button size="sm" disabled={busy} onClick={() => void equip(null)}>
                      {t('frameLib.unequip')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="gold" disabled={busy} onClick={() => void equip(current.id)}>
                      {t('frameLib.equip')}
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-white/45">{ownership.has(current.id) ? t('frameLib.expired') : t('frameLib.locked')}</p>
              )}
            </aside>
          )}
        </div>
      </div>
    </AppShell>
  );
}
