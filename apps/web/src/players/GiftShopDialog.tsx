import { GIFT_CATEGORIES, GIFT_RULES, type GiftCategory, type GiftItemView, type GiftRarity, type GiftShopView } from '@casino/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { ApiError, api } from '../net/api';
import { newIdempotencyKey } from '../net/adminApi';
import { formatChips } from '../lib/format';
import { errorText } from '../lib/errors';
import { Modal } from '../social/parts';
import { assetSrc } from '../store/catalog';
import { Button } from '../ui/Button';
import { CurrencyIcon } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';
import { PlayerIdentity, type IdentityLike } from './identity';

/**
 * The Gift Shop: buy a gift for another player, who gains Charm Points (Điểm Hấp Dẫn). Opened from
 * the quick profile, the profile page or the friends gift dialog with the recipient preselected.
 * Two steps — pick, then confirm — and nothing is charged before "Send" on the confirm step.
 */
interface GiftShopStore {
  to: IdentityLike | null;
  open(to: IdentityLike): void;
  close(): void;
}
export const useGiftShop = create<GiftShopStore>((set) => ({ to: null, open: (to) => set({ to }), close: () => set({ to: null }) }));

/** Mount once inside the router. */
export function GiftShopHost() {
  const to = useGiftShop((s) => s.to);
  const close = useGiftShop((s) => s.close);
  return to ? <GiftShopDialog key={to.uid} to={to} onClose={close} /> : null;
}

const RARITY_RING: Record<GiftRarity, string> = {
  common: 'border-white/15',
  rare: 'border-sky-300/50',
  epic: 'border-fuchsia-300/60',
  legendary: 'border-gold-300/70',
  mythic: 'border-rose-300/80 shadow-[0_0_18px_-4px_rgba(255,120,160,0.8)]',
};

export function GiftIcon({ gift, size = 40 }: { gift: Pick<GiftItemView, 'icon' | 'iconUrl'>; size?: number }) {
  return gift.iconUrl ? (
    <img src={assetSrc(gift.iconUrl)} alt="" className="object-contain" style={{ width: size, height: size }} draggable={false} />
  ) : (
    <span aria-hidden className="leading-none" style={{ fontSize: size * 0.8 }}>
      {gift.icon}
    </span>
  );
}

function GiftShopDialog({ to, onClose }: { to: IdentityLike; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'vi';
  const fmt = (n: number) => formatChips(n, i18n.language);
  const [shop, setShop] = useState<GiftShopView | null>(null);
  const [category, setCategory] = useState<GiftCategory | 'all'>('all');
  const [picked, setPicked] = useState<GiftItemView | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [busy, setBusy] = useState(false);
  // One key per confirmation: a double tap or a retried request can never send twice.
  const [key, setKey] = useState(newIdempotencyKey);

  const load = useCallback(() => {
    void api<GiftShopView>('/api/gifts/shop').then(
      (s) => {
        setShop(s);
        setPicked((p) => (p ? (s.gifts.find((g) => g.id === p.id) ?? null) : null));
      },
      (err) => toast(errorText(t, err, i18n.language), 'error'),
    );
  }, [t, i18n.language]);
  useEffect(load, [load]);

  const categories = useMemo(() => GIFT_CATEGORIES.filter((c) => shop?.gifts.some((g) => g.category === c)), [shop]);
  const list = (shop?.gifts ?? []).filter((g) => category === 'all' || g.category === category);
  const maxQty = Math.min(GIFT_RULES.maxQuantity, picked?.dailyLimit ?? GIFT_RULES.maxQuantity);
  const total = picked ? picked.price * quantity : 0;
  const charm = picked ? picked.charm * quantity : 0;

  const review = () => {
    setKey(newIdempotencyKey());
    setStep('confirm');
  };
  const send = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await api('/api/gifts/send', { method: 'POST', body: { id: key, uid: to.uid, giftId: picked.id, quantity, anonymous, message: message.trim(), expectedPrice: picked.price } });
      toast(t('giftShop.sent', { gift: picked.name[lang], name: to.displayName }), 'success');
      onClose();
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
      // The price or availability changed: show the current shop before anything else is sent.
      if (err instanceof ApiError && (err.code === 'gift_price_changed' || err.code === 'gift_unavailable')) {
        load();
        setStep('pick');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={step === 'pick' ? t('giftShop.title', { name: to.displayName }) : t('giftShop.confirmTitle')} onClose={onClose} width="max-w-2xl">
      {step === 'pick' ? (
        <>
          {shop?.blocked && <p className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100">{t(`giftShop.blocked.${shop.blocked}`, { hours: GIFT_RULES.minAccountHours })}</p>}
          {shop === null && <p className="text-sm text-white/50">{t('app.loading')}</p>}
          {shop && shop.gifts.length === 0 && <p className="rounded-xl bg-black/25 p-4 text-center text-sm text-white/55">{t('giftShop.empty')}</p>}
          {shop && shop.gifts.length > 0 && (
            <>
              <div className="flex gap-1 overflow-x-auto" role="tablist">
                {(['all', ...categories] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={category === c}
                    onClick={() => setCategory(c)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs ${category === c ? 'border-pink-300/70 bg-pink-500/20 text-white' : 'border-white/10 text-white/65 hover:bg-white/10'}`}
                  >
                    {t(`giftShop.categories.${c}`)}
                  </button>
                ))}
              </div>
              <ul className="grid max-h-[42vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                {list.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      aria-pressed={picked?.id === g.id}
                      onClick={() => {
                        setPicked(g);
                        setQuantity(1);
                      }}
                      className={`flex w-full flex-col items-center gap-1 rounded-xl border bg-black/25 p-2 text-center transition hover:bg-white/5 ${RARITY_RING[g.rarity]} ${picked?.id === g.id ? 'ring-2 ring-pink-300' : ''}`}
                    >
                      <GiftIcon gift={g} size={38} />
                      <span className="line-clamp-1 text-xs font-strong text-white">{g.name[lang]}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-gold-100">
                        <CurrencyIcon currency={g.currency} size={14} />
                        {fmt(g.price)}
                      </span>
                      <span className="text-[10px] text-pink-200">+{fmt(g.charm)} ♥</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {picked && (
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="flex items-center gap-3">
                <GiftIcon gift={picked} size={44} />
                <div className="min-w-0">
                  <div className="font-strong text-white">{picked.name[lang]}</div>
                  <div className="text-xs text-white/55">{picked.description[lang]}</div>
                  <div className="text-[11px] text-white/45">
                    {t(`rarity.${picked.rarity}`)}
                    {picked.dailyLimit !== null && ` · ${t('giftShop.dailyLimit', { n: picked.dailyLimit })}`}
                    {picked.endsAt && ` · ${t('giftShop.until', { date: new Date(picked.endsAt).toLocaleDateString(i18n.language) })}`}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-white/60">{t('giftShop.quantity')}</span>
                <div className="flex items-center rounded-lg border border-white/15">
                  <button type="button" className="px-3 py-1 text-white/80 disabled:opacity-40" disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="−">
                    −
                  </button>
                  <input
                    className="w-12 bg-transparent text-center text-sm tabular-nums text-white outline-none"
                    inputMode="numeric"
                    aria-label={t('giftShop.quantity')}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.min(maxQty, Math.max(1, Math.floor(Number(e.target.value.replace(/\D/g, '')) || 1))))}
                  />
                  <button type="button" className="px-3 py-1 text-white/80 disabled:opacity-40" disabled={quantity >= maxQty} onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} aria-label="+">
                    +
                  </button>
                </div>
                <label className="ml-auto flex items-center gap-2 text-xs text-white/70">
                  <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                  {t('giftShop.anonymous')}
                </label>
              </div>
              <input className="field" maxLength={GIFT_RULES.messageMax} placeholder={t('giftShop.message')} value={message} onChange={(e) => setMessage(e.target.value)} />
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1 tabular-nums text-gold-100">
                  {t('giftShop.total')}: <CurrencyIcon currency={picked.currency} size={16} /> {fmt(total)}
                </span>
                <span className="text-pink-200">{t('giftShop.charmGain', { n: fmt(charm) })}</span>
              </div>
            </div>
          )}
          {shop && (
            <p className="text-[11px] leading-snug text-white/45">
              {t('giftShop.rules', { silver: fmt(GIFT_RULES.dailySilver), gold: fmt(GIFT_RULES.dailyGold), count: GIFT_RULES.dailyCount, pair: fmt(GIFT_RULES.pairDailyCharm) })}{' '}
              {t('giftShop.today', { silver: fmt(shop.today.silver), gold: fmt(shop.today.gold), count: shop.today.count })}
            </p>
          )}
          <Button variant="gold" disabled={!picked || !!shop?.blocked} onClick={review}>
            {t('giftShop.review')}
          </Button>
        </>
      ) : (
        picked && (
          <>
            <PlayerIdentity player={to} size={52} showUid />
            <div className="flex items-center gap-3 rounded-xl border border-pink-300/30 bg-pink-500/10 p-3">
              <GiftIcon gift={picked} size={48} />
              <div className="text-sm text-white/85">
                <p>{t('giftShop.confirmBody', { qty: quantity, gift: picked.name[lang], name: to.displayName, uid: to.uid })}</p>
                <p className="mt-1 inline-flex items-center gap-1 tabular-nums text-gold-100">
                  {t('giftShop.cost')}: <CurrencyIcon currency={picked.currency} size={16} /> {fmt(total)}
                </p>
                <p className="text-pink-200">{t('giftShop.charmGain', { n: fmt(charm) })}</p>
                {anonymous && <p className="text-xs text-white/60">{t('giftShop.anonymousNote')}</p>}
              </div>
            </div>
            {message.trim() && <p className="text-sm italic text-white/60">“{message.trim()}”</p>}
            <p className="text-[11px] text-white/45">{t('giftShop.final')}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setStep('pick')} disabled={busy}>
                {t('nav.back')}
              </Button>
              <Button variant="gold" onClick={() => void send()} disabled={busy}>
                {busy ? t('giftShop.sending') : t('giftShop.send')}
              </Button>
            </div>
          </>
        )
      )}
    </Modal>
  );
}
