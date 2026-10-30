import { DEFAULT_FRAME, type CatalogItem, type EquipSlot, type InventoryEntry, type ItemKind, type PublicUser, type Rarity } from '@casino/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { errorText } from '../lib/errors';
import { api } from '../net/api';
import { assetSrc, itemName, useCatalog } from '../store/catalog';
import { useSession } from '../store/session';
import { AppShell, PageHeader } from '../ui/AppShell';
import { Avatar } from '../ui/Avatar';
import { CardBack, ChatBubble, TitleBadge } from '../ui/Cosmetics';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';

const KINDS: ItemKind[] = ['frame', 'avatar', 'title', 'chat_bubble', 'card_back', 'collectible'];

/** The player's equipped item per slot (PublicUser field). */
const equippedIn = (u: PublicUser, kind: ItemKind): string | null =>
  ({ frame: u.frame, avatar: u.avatarItem, title: u.title, chat_bubble: u.chatBubble, card_back: u.cardBack, collectible: null })[kind];

/** Text/border tone per rarity (text tokens on the dark surface, never color alone: the name is shown too). */
export const RARITY_TONE: Record<Rarity, string> = {
  common: 'border-white/20 text-white/70',
  rare: 'border-neon-cyan/50 text-neon-cyan',
  epic: 'border-neon-violet/60 text-neon-violet',
  legendary: 'border-gold-300/70 text-gold-200',
  mythic: 'border-neon-pink/60 text-neon-pink',
};

interface Owned {
  item: CatalogItem | undefined;
  itemId: string;
  entries: InventoryEntry[];
}

export function CollectionPage() {
  const { t, i18n } = useTranslation();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const catalog = useCatalog((c) => c.items);
  const [kind, setKind] = useState<ItemKind>('frame');
  const [inventory, setInventory] = useState<InventoryEntry[] | null>(null);
  const [roleFrames, setRoleFrames] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ items: InventoryEntry[]; roleFrames?: string[] }>('/api/me/inventory').then(
      (r) => {
        setInventory(r.items);
        setRoleFrames(r.roleFrames ?? []);
      },
      (err) => toast(errorText(t, err, i18n.language), 'error'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const owned = useMemo(() => {
    const groups = new Map<string, Owned>();
    // The default frame is owned by everyone even though it has no inventory row.
    if (kind === 'frame') groups.set(DEFAULT_FRAME, { item: catalog[DEFAULT_FRAME], itemId: DEFAULT_FRAME, entries: [] });
    // Role frames: usable while the player holds the role (no inventory row).
    if (kind === 'frame') for (const id of roleFrames) groups.set(id, { item: catalog[id], itemId: id, entries: [{ instanceId: id, itemId: id, kind: 'frame', source: 'role', acquiredAt: '', expiresAt: null, active: true }] });
    for (const e of inventory ?? []) {
      if (e.kind !== kind) continue;
      const g = groups.get(e.itemId) ?? { item: catalog[e.itemId], itemId: e.itemId, entries: [] };
      g.entries.push(e);
      groups.set(e.itemId, g);
    }
    return [...groups.values()];
  }, [inventory, catalog, kind, roleFrames]);

  const current = owned.find((o) => o.itemId === selected) ?? owned[0];
  const equippedId = equippedIn(user, kind);
  /** Usable now: permanent, or a timed copy that has not expired. */
  const activeOf = (o: Owned | undefined) => !o || o.itemId === DEFAULT_FRAME || o.entries.some((e) => e.active);
  const expiryOf = (o: Owned | undefined) => (o?.entries.some((e) => e.active && !e.expiresAt) ? null : (o?.entries.map((e) => e.expiresAt).filter(Boolean).sort().at(-1) ?? null));

  const equip = async (slot: EquipSlot, itemId: string | null) => {
    setBusy(true);
    try {
      const { user: fresh } = await api<{ user: PublicUser }>('/api/me/equip', { method: 'POST', body: { slot, itemId } });
      setUser(fresh);
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    } finally {
      setBusy(false);
    }
  };

  const preview = (o: Owned | undefined, size: number) => {
    if (!o) return null;
    if (kind === 'frame') return <Avatar customAvatar={user.customAvatar} index={user.avatar} avatarItem={user.avatarItem} frame={o.itemId} size={size} />;
    if (kind === 'avatar') return <Avatar index={user.avatar} avatarItem={o.itemId} frame={user.frame} size={size} />;
    if (kind === 'title') return <TitleBadge itemId={o.itemId} size={size > 100 ? 'md' : 'sm'} />;
    if (kind === 'chat_bubble') return <ChatBubble itemId={o.itemId}>{t('collection.bubbleSample')}</ChatBubble>;
    if (kind === 'card_back') return <CardBack itemId={o.itemId} width={size > 100 ? 96 : 52} />;
    return o.item?.assetUrl ? <img src={assetSrc(o.item.assetUrl)} alt="" className="object-contain" style={{ width: size, height: size }} /> : null;
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <PageHeader
          icon="collection"
          title={t('collection.title')}
          subtitle={t('collection.subtitle')}
          right={
            <Link to="/frames" className="rounded-full border border-gold-300/50 bg-gold-300/10 px-4 py-1.5 text-sm text-gold-100 hover:bg-gold-300/20">
              ✨ {t('frameLib.open')}
            </Link>
          }
        />
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-1" role="tablist">
          {KINDS.map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => {
                setKind(k);
                setSelected(null);
              }}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition ${kind === k ? 'bg-gold-sheen text-ink-900 shadow-button' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
            >
              {t(`collection.tabs.${k}`)}
            </button>
          ))}
        </div>

        {inventory === null ? (
          <p className="text-white/50">{t('app.loading')}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5">
              {kind === 'avatar' && (
                <Tile
                  label={t('collection.defaultAvatar')}
                  active={!current || selected === '__default'}
                  equipped={!user.avatarItem}
                  onClick={() => setSelected('__default')}
                  equippedLabel={t('collection.equipped')}
                >
                  <Avatar index={user.avatar} frame={user.frame} size={72} />
                </Tile>
              )}
              {owned.map((o) => (
                <Tile
                  key={o.itemId}
                  label={itemName(o.item, i18n.language, o.itemId)}
                  active={current?.itemId === o.itemId && selected !== '__default'}
                  equipped={equippedId === o.itemId}
                  equippedLabel={t('collection.equipped')}
                  rarity={o.item?.rarity}
                  count={kind === 'collectible' && o.entries.length > 1 ? t('collection.count', { count: o.entries.length }) : !activeOf(o) ? t('collection.expired') : undefined}
                  onClick={() => setSelected(o.itemId)}
                >
                  {preview(o, 72)}
                </Tile>
              ))}
              {owned.length === 0 && kind !== 'avatar' && <p className="col-span-full py-8 text-center text-sm text-white/50">{t('collection.empty')}</p>}
            </div>

            <aside className="glass flex flex-col items-center gap-3 p-5 text-center">
              {kind === 'avatar' && (selected === '__default' || !current) ? (
                <>
                  <Avatar index={user.avatar} frame={user.frame} size={150} />
                  <h3 className="font-display text-xl">{t('collection.defaultAvatar')}</h3>
                  {user.avatarItem ? (
                    <Button variant="gold" disabled={busy} onClick={() => void equip('avatar', null)}>
                      {t('collection.equip')}
                    </Button>
                  ) : (
                    <span className="text-sm text-gold-200">{t('collection.equipped')}</span>
                  )}
                </>
              ) : current ? (
                <>
                  <div className="flex h-44 items-center justify-center">{preview(current, 150)}</div>
                  <h3 className="font-display text-xl">{itemName(current.item, i18n.language, current.itemId)}</h3>
                  {current.item && (
                    <span className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${RARITY_TONE[current.item.rarity]}`}>{t(`rarity.${current.item.rarity}`)}</span>
                  )}
                  {current.item?.description && <p className="text-sm text-white/65">{i18n.language.startsWith('vi') ? current.item.description.vi : current.item.description.en}</p>}
                  {current.itemId === DEFAULT_FRAME && kind === 'frame' ? (
                    <p className="text-xs text-white/50">{t('collection.defaultFrame')}</p>
                  ) : (
                    current.entries[0] && (
                      <p className="text-xs text-white/50">
                        {t('collection.source', { source: t(`itemSource.${current.entries[0].source}`, { defaultValue: current.entries[0].source }) })} ·{' '}
                        {t('collection.acquired', { date: new Date(current.entries[0].acquiredAt).toLocaleDateString(i18n.language) })}
                      </p>
                    )
                  )}
                  {current.item?.status === 'hidden' && <p className="text-xs text-white/45">{t('collection.retired')}</p>}
                  {expiryOf(current) && (
                    <p className={`rounded-lg px-2 py-1 text-xs font-semibold ${activeOf(current) ? 'bg-gold-300/10 text-gold-100' : 'bg-red-950/50 text-red-200'}`}>
                      {activeOf(current) ? t('collection.expires', { date: new Date(expiryOf(current)!).toLocaleString(i18n.language) }) : t('collection.expiredOn', { date: new Date(expiryOf(current)!).toLocaleString(i18n.language) })}
                    </p>
                  )}
                  {current.item && !current.item.tradable && current.item.source === 'season' && <p className="text-[11px] text-white/45">{t('collection.exclusive')}</p>}
                  {kind !== 'collectible' &&
                    (equippedId === current.itemId ? (
                      <Button disabled={busy} onClick={() => void equip(kind as EquipSlot, null)}>
                        {t('collection.unequip')}
                      </Button>
                    ) : activeOf(current) ? (
                      <Button variant="gold" disabled={busy} onClick={() => void equip(kind as EquipSlot, current.itemId)}>
                        {t('collection.equip')}
                      </Button>
                    ) : (
                      <Button disabled>{t('collection.expired')}</Button>
                    ))}
                  {kind === 'frame' && user.frame === 'none' && <p className="text-xs text-white/45">{t('collection.noFrame')}</p>}
                </>
              ) : (
                <p className="text-sm text-white/50">{t('collection.empty')}</p>
              )}
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Tile({
  label,
  active,
  equipped,
  equippedLabel,
  rarity,
  count,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  equipped: boolean;
  equippedLabel: string;
  rarity?: Rarity;
  count?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`glass relative flex flex-col items-center gap-2 p-3 transition hover:-translate-y-0.5 ${active ? 'border-gold-300/70 shadow-glow' : 'hover:border-gold-300/30'}`}
    >
      <div className="flex h-20 items-center justify-center">{children}</div>
      <span className="line-clamp-2 text-center text-xs leading-tight text-white/85">{label}</span>
      {rarity && <span className={`h-0.5 w-8 rounded-full border-t-2 ${RARITY_TONE[rarity]}`} aria-hidden />}
      {equipped && <span className="absolute left-1.5 top-1.5 rounded bg-gold-300/20 px-1 text-[9px] font-bold uppercase text-gold-100">{equippedLabel}</span>}
      {count && <span className="absolute right-1.5 top-1.5 text-[10px] font-semibold text-white/70">{count}</span>}
    </button>
  );
}
