import { type CatalogItem, type InventoryEntry, type PublicUser } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sfx } from '../audio/sfx';
import { formatChips } from '../lib/format';
import { api, ApiError } from '../net/api';
import { itemName, useCatalog } from '../store/catalog';
import { useSession } from '../store/session';
import { AppShell, PageHeader } from '../ui/AppShell';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { CardBack, ChatBubble, TitleBadge } from '../ui/Cosmetics';
import { NavIcon } from '../ui/NavIcons';
import { Amount } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';

const TABS = ['frames', 'cardBacks', 'titles', 'bubbles', 'tables', 'effects'] as const;
const LIVE: Tab[] = ['frames', 'cardBacks', 'titles', 'bubbles'];
const KIND_OF: Partial<Record<Tab, 'card_back' | 'title' | 'chat_bubble'>> = { cardBacks: 'card_back', titles: 'title', bubbles: 'chat_bubble' };
type Tab = (typeof TABS)[number];

function FramesGrid() {
  const { t, i18n } = useTranslation();
  const user = useSession((s) => s.user)!;
  const balance = useSession((s) => s.balance);
  const setUser = useSession((s) => s.setUser);
  const [busy, setBusy] = useState<string | null>(null);
  const catalog = useCatalog((c) => c.items);
  // Frames currently sold in the shop (released, priced), in catalog order.
  const frames = Object.values(catalog).filter((i): i is CatalogItem & { priceSilver: number } => i.kind === 'frame' && i.status === 'released' && i.priceSilver !== null);

  const call = async (path: string, itemId: string, success?: string) => {
    setBusy(itemId);
    try {
      const { user: fresh } = await api<{ user: PublicUser }>(path, { method: 'POST', body: { itemId } });
      setUser(fresh);
      if (success) {
        sfx.win();
        toast(success, 'success');
      }
    } catch (err) {
      toast(t(`errors.${err instanceof ApiError ? err.code : 'internal'}`), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">
      {frames.map((frame, i) => {
        const owned = user.ownedFrames.includes(frame.id);
        const equipped = user.frame === frame.id;
        return (
          <div
            key={frame.id}
            className={`glass group relative flex animate-rise flex-col items-center gap-2 overflow-hidden p-3 transition hover:-translate-y-0.5 ${
              equipped ? 'border-gold-300/60 shadow-glow' : 'hover:border-gold-300/30'
            }`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="relative flex h-24 w-full items-center justify-center lg:h-36 xl:h-44">
              <div className="absolute bottom-1 h-4 w-28 rounded-[50%] bg-gold-300/25 blur-md xl:w-40" />
              <div className="absolute h-20 w-20 rounded-full bg-gradient-to-b from-white/10 to-transparent lg:h-32 lg:w-32" />
              <div className="lg:hidden">
                <Avatar index={user.avatar} avatarItem={user.avatarItem} frame={frame.id} size={76} />
              </div>
              <div className="hidden lg:block xl:hidden">
                <Avatar index={user.avatar} avatarItem={user.avatarItem} frame={frame.id} size={104} />
              </div>
              <div className="hidden xl:block">
                <Avatar index={user.avatar} avatarItem={user.avatarItem} frame={frame.id} size={132} />
              </div>
            </div>
            <div className="text-center">
              <div className="font-display text-base leading-tight xl:text-xl">{itemName(frame, i18n.language, frame.id)}</div>
              <div className="mt-1 flex justify-center text-sm">
                {frame.priceSilver === 0 ? (
                  <span className="text-white/50">{t('shop.free')}</span>
                ) : (
                  <Amount currency="silver" value={formatChips(frame.priceSilver, i18n.language)} size={20} className="font-semibold" />
                )}
              </div>
            </div>
            {equipped ? (
              <span className="rounded-full bg-gold-300/15 px-3 py-1 text-xs font-semibold text-gold-200">{t('shop.equipped')}</span>
            ) : owned ? (
              <Button size="sm" onClick={() => void call('/api/me/frame', frame.id)} disabled={busy !== null}>
                {t('shop.equip')}
              </Button>
            ) : (
              <Button variant="gold" size="sm" onClick={() => void call('/api/shop/buy', frame.id, t('shop.bought'))} disabled={busy !== null || balance < frame.priceSilver}>
                {t('shop.buy')}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Shop grid for titles, chat bubbles and card backs: buy with Cxu Bạc (server debits via the ledger), then equip. */
function CosmeticGrid({ kind }: { kind: 'card_back' | 'title' | 'chat_bubble' }) {
  const { t, i18n } = useTranslation();
  const user = useSession((s) => s.user)!;
  const balance = useSession((s) => s.balance);
  const setUser = useSession((s) => s.setUser);
  const catalog = useCatalog((c) => c.items);
  const [owned, setOwned] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const items = Object.values(catalog).filter((i): i is CatalogItem & { priceSilver: number } => i.kind === kind && i.status === 'released' && i.priceSilver !== null);
  const equipped = kind === 'card_back' ? user.cardBack : kind === 'title' ? user.title : user.chatBubble;

  const loadOwned = () =>
    void api<{ items: InventoryEntry[] }>('/api/me/inventory').then((r) => setOwned(new Set(r.items.filter((e) => e.active).map((e) => e.itemId))), () => setOwned(new Set()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadOwned, []);

  const act = async (itemId: string, buy: boolean) => {
    setBusy(itemId);
    try {
      if (buy) {
        await api('/api/shop/buy', { method: 'POST', body: { itemId } });
        sfx.win();
        toast(t('shop.bought'), 'success');
      }
      const { user: fresh } = await api<{ user: PublicUser }>('/api/me/equip', { method: 'POST', body: { slot: kind, itemId } });
      setUser(fresh);
      loadOwned();
    } catch (err) {
      toast(t(`errors.${err instanceof ApiError ? err.code : 'internal'}`), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">
      {items.map((item) => {
        const has = owned?.has(item.id) ?? false;
        return (
          <div key={item.id} className={`glass flex flex-col items-center gap-2 p-3 ${equipped === item.id ? 'border-gold-300/60 shadow-glow' : ''}`}>
            <div className="flex h-28 w-full items-center justify-center">
              {kind === 'card_back' ? <CardBack itemId={item.id} width={64} /> : kind === 'title' ? <TitleBadge itemId={item.id} /> : <ChatBubble itemId={item.id}>{t('collection.bubbleSample')}</ChatBubble>}
            </div>
            <div className="text-center font-display text-base font-bold leading-tight">{itemName(item, i18n.language, item.id)}</div>
            {item.priceSilver === 0 ? <span className="text-sm text-white/50">{t('shop.free')}</span> : <Amount currency="silver" value={formatChips(item.priceSilver, i18n.language)} size={20} className="font-bold" />}
            {equipped === item.id ? (
              <span className="rounded-full bg-gold-300/15 px-3 py-1 text-xs font-bold text-gold-200">{t('shop.equipped')}</span>
            ) : has ? (
              <Button size="sm" disabled={busy !== null} onClick={() => void act(item.id, false)}>
                {t('shop.equip')}
              </Button>
            ) : (
              <Button variant="gold" size="sm" disabled={busy !== null || owned === null || balance < item.priceSilver} onClick={() => void act(item.id, true)}>
                {t('shop.buy')}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SoonPanel({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <div className="glass relative flex flex-col items-center gap-3 overflow-hidden px-6 py-10 text-center">
      <div className="pointer-events-none absolute -top-16 h-40 w-80 rounded-full bg-gold-300/10 blur-3xl" />
      <div className="gold-border flex h-16 w-16 items-center justify-center rounded-2xl">
        <NavIcon name="collection" size={32} active />
      </div>
      <h3 className="font-display text-xl text-gold">{t('soon.title')}</h3>
      <p className="max-w-md text-sm text-white/60">{text}</p>
    </div>
  );
}

export function MarketPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('frames');
  const user = useSession(s => s.user)!;
  const setUser = useSession(s => s.setUser);
  const [renameBusy,setRenameBusy]=useState(false);
  const buyRenameCard=async()=>{
    setRenameBusy(true);
    try {const r=await api<{user:PublicUser}>('/api/shop/rename-card',{method:'POST'});setUser(r.user);toast('Đã mua Thẻ Đổi Tên / Rename Card purchased','success');}
    catch(e){toast(t(`errors.${e instanceof ApiError ? e.code : 'internal'}`),'error');}
    finally{setRenameBusy(false);}
  };
  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <PageHeader icon="market" title={t('market.title')} subtitle={t('market.subtitle')} />
        <section className="glass flex items-center gap-4 p-4">
          <img src="/assets/official/rename-card.png" alt="Thẻ Đổi Tên / Rename Card" className="h-24 w-28 object-contain" />
          <div className="flex-1 space-y-2">
            <h3 className="font-display font-semibold text-gold">Thẻ Đổi Tên / Rename Card</h3>
            <p className="text-xs text-white/60">Bỏ qua 60 ngày chờ đổi tên / Skip 60-day rename cooldown · Đã có / Owned: {user.renameCards}</p>
            <Button variant="gold" size="sm" disabled={renameBusy||user.gold<300} onClick={()=>void buyRenameCard()}>Mua / Buy · 300 Cxu Vàng</Button>
          </div>
        </section>
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-1">
          {TABS.map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === key ? 'bg-gold-sheen text-ink-900 shadow-button' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              {t(`market.tabs.${key}`)}
              {LIVE.includes(key) ? (
                <span className={`rounded px-1 text-[9px] font-bold uppercase ${tab === key ? 'bg-ink-900/20' : 'bg-emerald-500/20 text-emerald-400'}`}>{t('market.live')}</span>
              ) : (
                <span className={`rounded px-1 text-[9px] font-bold uppercase ${tab === key ? 'bg-ink-900/20' : 'bg-white/10 text-white/50'}`}>{t('hub.comingSoon')}</span>
              )}
            </button>
          ))}
        </div>
        {tab === 'frames' ? <FramesGrid /> : KIND_OF[tab] ? <CosmeticGrid key={tab} kind={KIND_OF[tab]!} /> : <SoonPanel text={t('market.tabSoon')} />}
        <p className="text-[11px] text-white/35">{t('app.disclaimer')}</p>
      </div>
    </AppShell>
  );
}
