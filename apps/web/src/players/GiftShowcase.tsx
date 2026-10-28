import { GIFT_CATEGORIES, type GiftCategory, type GiftShowcaseView, type GiftTxView, type PlayerProfileView } from '@casino/shared';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { Button } from '../ui/Button';
import { CurrencyIcon } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';
import { GiftIcon, useGiftShop } from './GiftShopDialog';
import { PlayerTrigger } from './PlayerActions';

/** Received gifts on a profile: grouped by gift, the latest ones, sort and category filter. */
export function GiftShowcase({ owner }: { owner: PlayerProfileView }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'vi';
  const fmt = (n: number) => formatChips(n, i18n.language);
  const [sort, setSort] = useState<'recent' | 'value'>('recent');
  const [category, setCategory] = useState<GiftCategory | 'all'>('all');
  const [data, setData] = useState<GiftShowcaseView | null>(owner.gifts);
  const [hidden, setHidden] = useState(owner.gifts === null);

  useEffect(() => {
    setData(owner.gifts);
    setHidden(owner.gifts === null);
  }, [owner.gifts]);
  const reload = useCallback(() => {
    const q = new URLSearchParams({ sort, ...(category !== 'all' ? { category } : {}) });
    void api<{ gifts: GiftShowcaseView | null }>(`/api/players/${owner.uid}/gifts?${q}`).then(
      (r) => {
        setData(r.gifts);
        setHidden(r.gifts === null);
      },
      (err) => toast(errorText(t, err, i18n.language), 'error'),
    );
  }, [owner.uid, sort, category, t, i18n.language]);
  // Refetch when the filters change (the first render uses the profile's own copy).
  const [touched, setTouched] = useState(false);
  useEffect(() => void (touched && reload()), [touched, reload]);
  const filter = (fn: () => void) => {
    fn();
    setTouched(true);
  };

  return (
    <section className="glass p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg text-gold-100">
          {t('giftShop.showcase.title')}
          {data && <span className="ml-2 text-xs text-white/50">{t('giftShop.showcase.count', { n: fmt(data.receivedCount) })}</span>}
        </h2>
        {owner.relation !== 'self' && !owner.social.blocked && !owner.social.blockedBy && (
          <Button size="sm" variant="gold" onClick={() => useGiftShop.getState().open(owner)}>
            💝 {t('giftShop.open')}
          </Button>
        )}
      </div>
      {hidden ? (
        <p className="text-sm text-white/50">{t('giftShop.showcase.hidden')}</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {(['all', ...GIFT_CATEGORIES] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => filter(() => setCategory(c))}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] ${category === c ? 'border-pink-300/70 bg-pink-500/20 text-white' : 'border-white/10 text-white/60 hover:bg-white/10'}`}
              >
                {t(`giftShop.categories.${c}`)}
              </button>
            ))}
            <select aria-label={t('giftShop.showcase.sort')} className="field ml-auto w-auto py-1 text-xs" value={sort} onChange={(e) => filter(() => setSort(e.target.value as 'recent' | 'value'))}>
              <option value="recent">{t('giftShop.showcase.recent')}</option>
              <option value="value">{t('giftShop.showcase.value')}</option>
            </select>
          </div>
          {!data || data.receivedCount === 0 ? (
            <p className="text-sm text-white/50">{t('giftShop.showcase.empty')}</p>
          ) : (
            <>
              <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {data.byGift.map((g) => (
                  <li key={g.gift.id} className="flex flex-col items-center gap-0.5 rounded-xl border border-pink-300/20 bg-pink-500/[0.06] p-2 text-center" title={g.gift.name[lang]}>
                    <GiftIcon gift={g.gift} size={34} />
                    <span className="w-full truncate text-[11px] text-white/80">{g.gift.name[lang]}</span>
                    <span className="text-[10px] tabular-nums text-white/55">×{fmt(g.count)}</span>
                  </li>
                ))}
              </ul>
              <h3 className="mb-1 text-xs text-white/60">{t('giftShop.showcase.latest')}</h3>
              <ul className="flex flex-col gap-1">
                {data.recent.map((g) => (
                  <GiftRow key={g.id} g={g} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

function GiftRow({ g }: { g: GiftTxView }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'vi';
  const fmt = (n: number) => formatChips(n, i18n.language);
  return (
    <li className={`flex items-center gap-2 rounded-lg bg-black/20 px-2 py-1.5 text-xs ${g.status === 'reversed' ? 'opacity-50' : ''}`}>
      <GiftIcon gift={g.gift} size={22} />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-white/85">
          {g.gift.name[lang]}
          {g.quantity > 1 && ` ×${g.quantity}`}
        </span>{' '}
        <span className="text-white/45">
          {g.direction === 'sent' ? t('giftShop.history.to') : t('giftShop.history.from')}{' '}
        </span>
        {g.other ? (
          <PlayerTrigger uid={g.other.uid} label={g.other.displayName} context="gifts" className="inline">
            <span className="text-cyan-100">{g.other.displayName}</span>
          </PlayerTrigger>
        ) : (
          <span className="italic text-white/55">{t('giftShop.history.anonymous')}</span>
        )}
        {g.message && <span className="text-white/45"> · “{g.message}”</span>}
      </span>
      {g.price && (
        <span className="inline-flex items-center gap-0.5 tabular-nums text-gold-100">
          <CurrencyIcon currency={g.price.currency} size={12} />
          {fmt(g.price.total)}
        </span>
      )}
      <span className="tabular-nums text-pink-200">+{fmt(g.charm)}</span>
      {g.status === 'reversed' && <span className="text-ruby-200">{t('giftShop.history.reversed')}</span>}
      <time className="hidden text-white/35 sm:inline" dateTime={g.createdAt}>
        {new Date(g.createdAt).toLocaleDateString(i18n.language)}
      </time>
    </li>
  );
}

/** My own gift history: sent and received (prices only on what I sent). */
export function GiftHistory() {
  const { t, i18n } = useTranslation();
  const [direction, setDirection] = useState<'received' | 'sent'>('received');
  const [rows, setRows] = useState<GiftTxView[] | null>(null);
  const [more, setMore] = useState(false);
  const page = useCallback(
    (before?: string) =>
      api<{ gifts: GiftTxView[] }>(`/api/gifts/history?direction=${direction}${before ? `&before=${encodeURIComponent(before)}` : ''}`).then(
        (r) => {
          setRows((cur) => [...(before ? (cur ?? []) : []), ...r.gifts]);
          setMore(r.gifts.length === 50);
        },
        (err) => toast(errorText(t, err, i18n.language), 'error'),
      ),
    [direction, t, i18n.language],
  );
  useEffect(() => {
    setRows(null);
    void page();
  }, [page]);
  return (
    <section className="glass p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg text-gold-100">{t('giftShop.history.title')}</h2>
        <div className="flex gap-1" role="tablist">
          {(['received', 'sent'] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={direction === d}
              onClick={() => setDirection(d)}
              className={`rounded-full border px-3 py-1 text-xs ${direction === d ? 'border-gold-300/70 bg-gold-300/15 text-gold-100' : 'border-white/10 text-white/60 hover:bg-white/10'}`}
            >
              {t(`giftShop.history.${d}`)}
            </button>
          ))}
        </div>
      </div>
      {rows === null ? (
        <p className="text-sm text-white/50">{t('app.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-white/50">{t('giftShop.history.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((g) => (
            <GiftRow key={g.id} g={g} />
          ))}
        </ul>
      )}
      {more && rows && (
        <div className="mt-2">
          <Button size="sm" onClick={() => void page(rows[rows.length - 1]!.createdAt)}>
            {t('people.profile.loadMore')}
          </Button>
        </div>
      )}
    </section>
  );
}
