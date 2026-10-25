import { SEASON_BRACKETS, type MailAttachment, type ParticipationRules, type SeasonBracket } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { itemName, useCatalog } from '../store/catalog';
import { CardBack } from './Cosmetics';
import { CurrencyIcon } from './OfficialAssets';
import { RankEmblem } from './RankEmblem';

interface Season {
  id: number;
  status: string;
  rewards: { brackets: Partial<Record<SeasonBracket, MailAttachment[]>> };
  participation: ParticipationRules;
}

const BRACKET_TOP: Record<SeasonBracket, 'vuong_gia' | 'than_tuong' | 'than_vuong' | null> = {
  top1: 'vuong_gia',
  top2: 'vuong_gia',
  top3: 'vuong_gia',
  top4_10: 'than_tuong',
  top11_50: 'than_vuong',
  rest: null,
};

/** The running season's official reward table, as configured on the server. */
export function SeasonRewardsTable() {
  const { t, i18n } = useTranslation();
  const catalog = useCatalog((c) => c.items);
  const [season, setSeason] = useState<Season | null>(null);
  useEffect(() => {
    void api<{ seasons: Season[] }>('/api/rank/seasons').then((r) => setSeason(r.seasons.find((s) => s.status === 'active') ?? null), () => {});
  }, []);
  if (!season) return null;
  const fmt = (n: number) => formatChips(n, i18n.language);
  const p = season.participation;
  return (
    <section className="glass p-4">
      <h2 className="mb-3 font-display text-lg font-bold text-gold-100">{t('seasonRewards.title')}</h2>
      <div className="flex flex-col gap-2">
        {SEASON_BRACKETS.map((b) => {
          const list = season.rewards.brackets[b.id] ?? [];
          const top = BRACKET_TOP[b.id];
          return (
            <div key={b.id} className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 ${top === 'vuong_gia' ? 'border-gold-300/40 bg-gold-300/[0.06]' : 'border-white/10 bg-black/20'}`}>
              <div className="flex w-52 items-center gap-2">
                {top ? <RankEmblem division={39} top={top} size={34} /> : <span className="h-[34px] w-[34px]" />}
                <span className="text-sm font-bold">{t(`seasonRewards.bracket.${b.id}`)}</span>
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {list.map((a, i) =>
                  a.type === 'item' ? (
                    <span key={i} className="flex items-center gap-1.5 rounded-lg bg-black/30 px-2 py-1 text-xs font-semibold">
                      {catalog[a.itemId]?.kind === 'card_back' ? <CardBack itemId={a.itemId} width={18} /> : null}
                      {itemName(catalog[a.itemId], i18n.language, a.itemId)}
                      {a.durationDays && <span className="text-gold-200">· {t('seasonRewards.days', { n: a.durationDays })}</span>}
                    </span>
                  ) : (
                    <span key={i} className="flex items-center gap-1 text-sm font-bold tabular-nums">
                      <CurrencyIcon currency={a.type} size={20} />
                      {fmt(a.amount)}
                    </span>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-white/60">{t('seasonRewards.rules')}</p>
      <p className="mt-2 text-xs font-semibold text-white/75">
        {p.playSilver || p.winSilver ? t('seasonRewards.participation', { play: fmt(p.playSilver), win: fmt(p.winSilver), cap: p.dailyMatchCap }) : t('seasonRewards.participationOff')}
      </p>
    </section>
  );
}
