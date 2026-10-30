import { cosmeticDef, PERSONAL_KINDS, RARITIES, SEASON_THEMES, type CatalogItem, type CollectionView, type InventoryEntry, type ItemKind, type PublicUser, type Rarity } from '@casino/shared';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sfx } from '../audio/sfx';
import { ItemPreviewLarge, ItemThumb } from '../cosmetics/ItemPreview';
import { TableSkinCanvas } from '../cosmetics/TableSkinCanvas';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { storage } from '../lib/storage';
import { api } from '../net/api';
import { itemName, useCatalog } from '../store/catalog';
import { useSession } from '../store/session';
import { AppShell, PageHeader } from '../ui/AppShell';
import { Button } from '../ui/Button';
import { Amount } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';
import { RARITY_TONE } from './CollectionPage';

const TABS = ['collections', 'frames', 'cardBacks', 'titles', 'bubbles', 'tables', 'effects'] as const;
type Tab = (typeof TABS)[number];
const KIND: Record<Exclude<Tab, 'collections'>, ItemKind> = { frames: 'frame', cardBacks: 'card_back', titles: 'title', bubbles: 'chat_bubble', tables: 'table_skin', effects: 'victory_effect' };
const FAV_KEY = 'kshop.favorites';
type Offer = { price: number; currency: 'silver' | 'gold'; collection: CollectionView | null };

const equippedOf = (u: PublicUser, kind: ItemKind) =>
  ({ frame: u.frame, avatar: u.avatarItem, title: u.title, chat_bubble: u.chatBubble, card_back: u.cardBack, table_skin: u.tableSkin, victory_effect: u.victoryEffect, collectible: null })[kind] ?? null;

function loadFavs(): Set<string> {
  try {
    return new Set(JSON.parse(storage.get(FAV_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Cosmetic shop: every category is live. Prices shown here are informative only — the server
 * charges its own price (shop price, or the price of an approved, running collection) and refuses
 * anything not on sale. Previews never charge or send game events.
 */
export function MarketPage() {
  const { t, i18n } = useTranslation();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const catalog = useCatalog((c) => c.items);
  const [tab, setTab] = useState<Tab>('collections');
  const [collections, setCollections] = useState<CollectionView[] | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [favs, setFavs] = useState<Set<string>>(loadFavs);
  const [selected, setSelected] = useState<{ id: string; kind: ItemKind } | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);

  const loadOwned = () => void api<{ items: InventoryEntry[] }>('/api/me/inventory').then((r) => setOwned(new Set(r.items.filter((e) => e.active).map((e) => e.itemId))), () => {});
  useEffect(() => {
    loadOwned();
    void api<{ collections: CollectionView[] }>('/api/collections').then((r) => setCollections(r.collections), () => setCollections([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Live offers by item: a running collection first, else the shop price. */
  const offers = useMemo(() => {
    const m = new Map<string, Offer>();
    for (const c of collections ?? []) if (c.status === 'active') for (const o of c.items) if (!m.has(o.itemId)) m.set(o.itemId, { price: o.price, currency: o.currency, collection: c });
    for (const item of Object.values(catalog)) {
      if (m.has(item.id) || item.status !== 'released' || item.source === 'role') continue;
      const inAnyCollection = (collections ?? []).some((c) => c.items.some((o) => o.itemId === item.id));
      if (inAnyCollection) continue;
      if (item.priceSilver !== null) m.set(item.id, { price: item.priceSilver, currency: 'silver', collection: null });
      else if (item.priceGold !== null) m.set(item.id, { price: item.priceGold, currency: 'gold', collection: null });
    }
    return m;
  }, [catalog, collections]);
  const collectionOf = (itemId: string) => (collections ?? []).find((c) => c.items.some((o) => o.itemId === itemId)) ?? null;

  const toggleFav = (id: string) =>
    setFavs((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        storage.set(FAV_KEY, JSON.stringify([...next]));
      } catch {
        /* favourites are a convenience only */
      }
      return next;
    });

  const buyRenameCard = async () => {
    setRenameBusy(true);
    try {
      const r = await api<{ user: PublicUser }>('/api/shop/rename-card', { method: 'POST' });
      setUser(r.user);
      toast(t('market.renameBought'), 'success');
    } catch (e) {
      toast(errorText(t, e, i18n.language), 'error');
    } finally {
      setRenameBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-3 p-3 lg:p-5 short:gap-2 short:p-2">
        <PageHeader icon="market" title={t('market.title')} subtitle={t('market.subtitle')} />
        <section className="glass flex items-center gap-4 p-3 short:p-2">
          <img src="/assets/official/rename-card.png" alt={t('market.renameCard')} className="h-16 w-20 object-contain short:h-12 short:w-14" />
          <div className="flex-1 space-y-1">
            <h3 className="font-display font-semibold text-gold">{t('market.renameCard')}</h3>
            <p className="text-xs text-white/60">{t('market.renameBody', { n: user.renameCards })}</p>
          </div>
          <Button variant="gold" size="sm" disabled={renameBusy || user.gold < 300} onClick={() => void buyRenameCard()}>
            {t('market.buyGold', { n: 300 })}
          </Button>
        </section>
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-1" role="tablist">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition short:py-1.5 ${tab === key ? 'bg-gold-sheen text-ink-900 shadow-button' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
            >
              {t(`market.tabs.${key}`)}
            </button>
          ))}
        </div>
        {tab === 'collections' ? (
          <Collections collections={collections} owned={owned} onPick={(id, kind) => setSelected({ id, kind })} onEquipped={(u) => setUser(u)} />
        ) : (
          <ItemGrid kind={KIND[tab]} offers={offers} owned={owned} favs={favs} collectionOf={collectionOf} onToggleFav={toggleFav} onPick={(id) => setSelected({ id, kind: KIND[tab] })} />
        )}
        <p className="text-[11px] text-white/35">{t('app.disclaimer')}</p>
      </div>
      {selected && (
        <PreviewDialog
          itemId={selected.id}
          kind={selected.kind}
          item={catalog[selected.id]}
          offer={offers.get(selected.id) ?? null}
          collection={collectionOf(selected.id)}
          owned={owned.has(selected.id) || selected.id === 'table_classic_green'}
          onClose={() => setSelected(null)}
          onChanged={() => loadOwned()}
        />
      )}
    </AppShell>
  );
}

function Price({ offer }: { offer: Offer }) {
  const { t, i18n } = useTranslation();
  if (offer.price === 0) return <span className="text-sm text-white/55">{t('shop.free')}</span>;
  return <Amount currency={offer.currency} value={formatChips(offer.price, i18n.language)} size={18} className="font-semibold" />;
}

function ItemGrid({
  kind,
  offers,
  owned,
  favs,
  collectionOf,
  onToggleFav,
  onPick,
}: {
  kind: ItemKind;
  offers: Map<string, Offer>;
  owned: Set<string>;
  favs: Set<string>;
  collectionOf: (id: string) => CollectionView | null;
  onToggleFav: (id: string) => void;
  onPick: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const user = useSession((s) => s.user)!;
  const catalog = useCatalog((c) => c.items);
  const [season, setSeason] = useState<string>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [only, setOnly] = useState<'all' | 'onSale' | 'owned' | 'favorites'>('all');
  const items = Object.values(catalog)
    .filter((i) => i.kind === kind && i.status !== 'draft' && i.source !== 'role')
    .filter((i) => offers.has(i.id) || owned.has(i.id) || i.id === 'table_classic_green')
    .filter((i) => {
      const theme = cosmeticDef(i.id)?.theme ?? (i.id.startsWith('ss2026_') ? 'seasonal' : null);
      if (season === 'basic') return !theme;
      if (season !== 'all') return (cosmeticDef(i.id)?.theme ?? collectionOf(i.id)?.theme) === season;
      return true;
    })
    .filter((i) => rarity === 'all' || i.rarity === rarity)
    .filter((i) => (only === 'onSale' ? offers.has(i.id) : only === 'owned' ? owned.has(i.id) || i.id === 'table_classic_green' : only === 'favorites' ? favs.has(i.id) : true));
  const equipped = equippedOf(user, kind);
  const personal = (PERSONAL_KINDS as readonly string[]).includes(kind);
  const lang = i18n.language;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select className="field !w-auto !py-1 text-xs" value={season} onChange={(e) => setSeason(e.target.value)} aria-label={t('market.season')}>
          <option value="all">{t('market.allSeasons')}</option>
          <option value="basic">{t('market.basic')}</option>
          {SEASON_THEMES.map((s) => (
            <option key={s} value={s}>
              {t(`market.themes.${s}`)}
            </option>
          ))}
        </select>
        <select className="field !w-auto !py-1 text-xs" value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | 'all')} aria-label={t('market.rarity')}>
          <option value="all">{t('market.allRarities')}</option>
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {t(`rarity.${r}`)}
            </option>
          ))}
        </select>
        {(['all', 'onSale', 'owned', 'favorites'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setOnly(f)} aria-pressed={only === f} className={`rounded-full border px-3 py-1 ${only === f ? 'border-gold-300/70 bg-gold-300/15 text-gold-100' : 'border-white/10 text-white/60'}`}>
            {t(`market.only.${f}`)}
          </button>
        ))}
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${personal ? 'bg-violet-500/20 text-violet-100' : 'bg-cyan-500/15 text-cyan-100'}`}>{personal ? t('market.personal') : t('market.public')}</span>
      </div>
      {items.length === 0 ? (
        <p className="glass p-6 text-center text-sm text-white/55">{t('market.empty')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 short:grid-cols-4">
          {items.map((item) => {
            const offer = offers.get(item.id);
            const has = owned.has(item.id) || item.id === 'table_classic_green';
            return (
              <li key={item.id} className={`glass relative flex flex-col items-center gap-2 p-3 short:p-2 ${equipped === item.id ? 'border-gold-300/60 shadow-glow' : ''}`}>
                <button type="button" onClick={() => onToggleFav(item.id)} aria-pressed={favs.has(item.id)} aria-label={t('market.favorite')} className={`absolute right-2 top-2 text-sm ${favs.has(item.id) ? 'text-pink-300' : 'text-white/30 hover:text-white/70'}`}>
                  ♥
                </button>
                <button type="button" onClick={() => onPick(item.id)} className="flex w-full flex-col items-center gap-2">
                  <span className="flex h-24 w-full items-center justify-center short:h-20">
                    <ItemThumb itemId={item.id} kind={kind} item={item} size={72} />
                  </span>
                  <span className="text-center font-display text-sm leading-tight">{itemName(item, lang, item.id)}</span>
                  <span className={`rounded border px-1.5 text-[10px] uppercase ${RARITY_TONE[item.rarity]}`}>{t(`rarity.${item.rarity}`)}</span>
                </button>
                {equipped === item.id ? (
                  <span className="text-xs font-semibold text-gold-200">{t('shop.equipped')}</span>
                ) : has ? (
                  <span className="text-xs text-emerald-300">{t('market.owned')}</span>
                ) : offer ? (
                  <Price offer={offer} />
                ) : (
                  <span className="text-xs text-white/40">{t('market.notOnSale')}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PreviewDialog({ itemId, kind, item, offer, collection, owned, onClose, onChanged }: { itemId: string; kind: ItemKind; item?: CatalogItem; offer: Offer | null; collection: CollectionView | null; owned: boolean; onClose: () => void; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const def = cosmeticDef(itemId);
  const lang = i18n.language.startsWith('vi') ? 'vi' : 'en';
  const equipped = equippedOf(user, kind) === itemId;
  const games = def && 'games' in def ? def.games : null;
  const personal = (PERSONAL_KINDS as readonly string[]).includes(kind);
  const canAfford = !offer || (offer.currency === 'gold' ? user.gold >= offer.price : useSession.getState().balance >= offer.price);
  const fmtDate = (s: string) => new Date(s).toLocaleString(i18n.language, { timeZone: collection?.timezone ?? 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });

  const buy = async () => {
    if (!offer) return;
    setBusy(true);
    try {
      const { user: fresh } = await api<{ user: PublicUser }>('/api/shop/buy', { method: 'POST', body: { itemId, expectedPrice: offer.price, expectedCurrency: offer.currency } });
      setUser(fresh);
      sfx.win();
      toast(t('shop.bought'), 'success');
      setConfirming(false);
      onChanged();
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    } finally {
      setBusy(false);
    }
  };
  const equip = async (id: string | null) => {
    setBusy(true);
    try {
      const { user: fresh } = await api<{ user: PublicUser }>('/api/me/equip', { method: 'POST', body: { slot: kind, itemId: id } });
      setUser(fresh);
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-950/70 p-0 sm:items-center sm:p-4 short:items-center short:p-2" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={itemName(item, i18n.language, itemId)} onClick={(e) => e.stopPropagation()} className="flex max-h-[92dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl border border-gold-300/45 bg-gradient-to-b from-[#24103f] to-[#08050f] p-4 sm:max-w-lg sm:rounded-3xl short:max-w-3xl short:flex-row short:rounded-2xl">
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-2xl bg-black/30 p-3">
          <ItemPreviewLarge itemId={itemId} kind={kind} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg font-heading text-gold-100">{itemName(item, i18n.language, itemId)}</h2>
            <button type="button" onClick={onClose} className="rounded-lg px-2 text-white/60 hover:bg-white/10" aria-label={t('market.close')}>
              ✕
            </button>
          </div>
          {item && <span className={`self-start rounded border px-1.5 text-[10px] uppercase ${RARITY_TONE[item.rarity]}`}>{t(`rarity.${item.rarity}`)}</span>}
          {(def?.description ?? item?.description) && <p className="text-white/70">{(def?.description ?? item!.description!)[lang]}</p>}
          <p className="text-[11px] text-white/55">{personal ? t('market.personalNote') : t('market.publicNote')}</p>
          {games && <p className="text-[11px] text-white/55">{t('market.games', { games: games.map((g) => t(`lb.gameNames.${g}`)).join(', ') })}</p>}
          {collection && (
            <p className="text-[11px] text-white/55">
              {t('market.inCollection', { name: collection.name[lang] })} · {t(`market.status.${collection.status}`)} · {fmtDate(collection.startsAt)} – {fmtDate(collection.endsAt)}
            </p>
          )}
          <p className="text-[11px] text-emerald-200/80">{t('market.permanent')}</p>
          <div className="mt-auto flex flex-col gap-2">
            {owned ? (
              equipped ? (
                <Button disabled={busy} onClick={() => void equip(null)}>
                  {t('collection.unequip')}
                </Button>
              ) : (
                <Button variant="gold" disabled={busy} onClick={() => void equip(itemId)}>
                  {t('collection.equip')}
                </Button>
              )
            ) : offer ? (
              confirming ? (
                <div className="flex flex-col gap-2 rounded-xl border border-gold-300/40 bg-black/30 p-2">
                  <p className="text-xs text-white/80">{t('market.confirmBuy', { name: itemName(item, i18n.language, itemId) })}</p>
                  <Price offer={offer} />
                  <div className="flex gap-2">
                    <Button variant="gold" size="sm" disabled={busy || !canAfford} onClick={() => void buy()}>
                      {t('market.confirm')}
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => setConfirming(false)}>
                      {t('market.cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="gold" disabled={busy || !canAfford} onClick={() => setConfirming(true)}>
                  {t('shop.buy')} · <Price offer={offer} />
                </Button>
              )
            ) : (
              <p className="text-center text-xs text-white/45">{collection && collection.status === 'scheduled' ? t('market.opensAt', { date: fmtDate(collection.startsAt) }) : t('market.notOnSale')}</p>
            )}
            {offer && !canAfford && !owned && <p className="text-center text-[11px] text-ruby-200">{t('errors.insufficient_funds')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Collections({ collections, owned, onPick, onEquipped }: { collections: CollectionView[] | null; owned: Set<string>; onPick: (id: string, kind: ItemKind) => void; onEquipped: (u: PublicUser) => void }) {
  const { t, i18n } = useTranslation();
  const catalog = useCatalog((c) => c.items);
  const [busy, setBusy] = useState<string | null>(null);
  const lang = i18n.language.startsWith('vi') ? 'vi' : 'en';
  if (!collections) return <p className="glass p-6 text-center text-white/50">{t('app.loading')}</p>;
  if (!collections.length) return <p className="glass p-6 text-center text-sm text-white/55">{t('market.noCollections')}</p>;
  const equipSet = async (c: CollectionView, replaceRoleFrame = false) => {
    setBusy(c.id);
    try {
      const r = await api<{ user: PublicUser; missing: string[]; keptRoleFrame: boolean }>('/api/me/equip-set', { method: 'POST', body: { collectionId: c.id, replaceRoleFrame } });
      onEquipped(r.user);
      if (r.keptRoleFrame && window.confirm(t('market.replaceRoleFrame'))) return void (await equipSet(c, true));
      toast(r.missing.length ? t('market.setPartial', { names: r.missing.map((id) => itemName(catalog[id], i18n.language, id)).join(', ') }) : t('market.setDone'), r.missing.length ? 'info' : 'success');
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    } finally {
      setBusy(null);
    }
  };
  const fmt = (s: string, tz: string) => new Date(s).toLocaleDateString(i18n.language, { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' });
  return (
    <div className="flex flex-col gap-4">
      {collections.map((c) => {
        const skin = c.items.find((o) => catalog[o.itemId]?.kind === 'table_skin')?.itemId;
        const ownedCount = c.items.filter((o) => owned.has(o.itemId)).length;
        return (
          <section key={c.id} className="glass overflow-hidden">
            <div className="relative h-28 short:h-20">
              <TableSkinCanvas skinId={skin} layout="board" />
              <div className="absolute inset-0 flex items-center justify-between gap-3 bg-gradient-to-r from-black/70 via-black/30 to-transparent px-4">
                <div>
                  <h3 className="font-display text-xl font-heading text-gold-100 drop-shadow">{c.name[lang]}</h3>
                  <p className="text-[11px] text-white/75">
                    {fmt(c.startsAt, c.timezone)} – {fmt(c.endsAt, c.timezone)} · {c.timezone}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-label ${c.status === 'active' ? 'bg-emerald-500/80 text-white' : c.status === 'scheduled' ? 'bg-sky-500/70 text-white' : 'bg-white/20 text-white/80'}`}>{t(`market.status.${c.status}`)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 p-3">
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8 short:grid-cols-8">
                {c.items.map((o) => {
                  const item = catalog[o.itemId];
                  if (!item) return null;
                  return (
                    <li key={o.itemId}>
                      <button type="button" onClick={() => onPick(o.itemId, item.kind)} className={`flex w-full flex-col items-center gap-1 rounded-xl border p-1.5 text-center ${owned.has(o.itemId) ? 'border-emerald-300/40 bg-emerald-500/10' : 'border-white/10 bg-black/25'}`}>
                        <span className="flex h-16 items-center justify-center">
                          <ItemThumb itemId={o.itemId} kind={item.kind} item={item} size={52} />
                        </span>
                        <span className="line-clamp-2 text-[10px] leading-tight text-white/80">{itemName(item, i18n.language, o.itemId)}</span>
                        <span className="text-[10px] text-white/45">{t(`collection.tabs.${item.kind}`, { defaultValue: item.kind })}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-white/55">{t('market.ownedCount', { n: ownedCount, total: c.items.length })}</span>
                <Button size="sm" variant="gold" disabled={busy !== null || ownedCount === 0} onClick={() => void equipSet(c)}>
                  {t('market.equipSet')}
                </Button>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
