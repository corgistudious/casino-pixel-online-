import type { ProgressView } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../net/api';
import { useSession } from '../store/session';
import { RankEmblem, useRankName } from './RankEmblem';

/** Level bar and current rank for the profile header; links to the Ranked page. */
export function ProgressStrip() {
  const { t } = useTranslation();
  const rankName = useRankName();
  const level = useSession((s) => s.user?.level);
  const [p, setP] = useState<ProgressView | null>(null);
  useEffect(() => {
    void api<ProgressView>('/api/me/progress').then(setP, () => {});
  }, [level]);
  const l = p?.level;
  return (
    <Link to="/rank" className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 transition hover:border-gold-300/40">
      <div className="min-w-[10rem] flex-1">
        <div className="flex justify-between text-xs">
          <span className="font-semibold text-gold-100">{t('level.level', { level: l?.level ?? level ?? 1 })}</span>
          <span className="tabular-nums text-white/45">{l && l.needed ? `${l.intoLevel} / ${l.needed} EXP` : ''}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/50">
          <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-100" style={{ width: `${l ? (l.needed ? (l.intoLevel / l.needed) * 100 : 100) : 0}%` }} />
        </div>
      </div>
      {p?.rank && (
        <div className="flex items-center gap-2">
          <RankEmblem division={p.rank.state.division} top={p.rank.topTitle} size={36} />
          <span className="text-sm font-semibold">{rankName(p.rank.state.division, p.rank.topTitle)}</span>
        </div>
      )}
    </Link>
  );
}
