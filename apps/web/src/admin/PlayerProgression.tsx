import type { LevelInfo, ProgressView } from '@casino/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { adminApi, newIdempotencyKey } from '../net/adminApi';
import { Button } from '../ui/Button';
import { RankEmblem, useRankName } from '../ui/RankEmblem';
import { toast } from '../ui/toast';
import { Table } from './parts';
import { useAdminKit } from './useAdmin';

interface Data {
  level: LevelInfo;
  expEvents: { id: number; source: string; amount: number; levelAfter: number; note: string | null; createdAt: string }[];
  rank: ProgressView['rank'];
  rankEvents: { id: number; result: string; rpDelta: number; divisionAfter: number; rpAfter: number; note: string | null; createdAt: string }[];
}

/** A player's level and rank for staff; corrections need progression.manage (Owner / Super Admin). */
export function PlayerProgression({ uid, isPlayer }: { uid: number; isPlayer: boolean }) {
  const { t, can, fmt, date, fail } = useAdminKit();
  const rankName = useRankName();
  const [data, setData] = useState<Data | null>(null);
  const [exp, setExp] = useState('');
  const [rp, setRp] = useState('');
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const load = () => void adminApi<Data>(`/api/admin/users/${uid}/progression`).then(setData, fail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [uid]);

  const n = (v: string) => (/^-?\d+$/.test(v.trim()) ? Number(v) : 0);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await adminApi(`/api/admin/users/${uid}/progression`, {
        method: 'POST',
        body: { expDelta: n(exp) || undefined, rpDelta: n(rp) || undefined, reason: reason.trim(), idempotencyKey: key },
      });
      toast(t('progressionAdmin.adjusted'), 'success');
      setExp('');
      setRp('');
      setReason('');
      setKey(newIdempotencyKey());
      load();
    } catch (err) {
      fail(err);
    }
  };

  if (!data) return <p className="text-white/50">{t('app.loading')}</p>;
  const r = data.rank;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="text-xs text-white/50">{t('level.title')}</div>
          <div className="font-display text-2xl text-gold-100">{t('level.level', { level: data.level.level })}</div>
          <div className="text-xs tabular-nums text-white/55">
            {fmt(data.level.totalExp)} EXP · {fmt(data.level.intoLevel)} / {fmt(data.level.needed)}
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
          {r ? (
            <>
              <RankEmblem division={r.state.division} top={r.topTitle} size={48} />
              <div>
                <div className="font-semibold">{rankName(r.state.division, r.topTitle)}</div>
                <div className="text-xs tabular-nums text-white/55">
                  {r.state.rp} RP · {t('rank.wins')} {r.wins} · {t('rank.losses')} {r.losses}
                  {r.seriesActive ? ` · ${t('rank.series', { n: r.state.streak })}` : ''}
                </div>
                <div className="text-[11px] text-white/40">{r.seasonName}</div>
              </div>
            </>
          ) : (
            <span className="text-sm text-white/50">{t('rank.noSeason')}</span>
          )}
        </div>
      </div>

      {can('progression.manage') && isPlayer && (
        <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border border-white/10 p-3">
          <h3 className="text-sm font-semibold">{t('progressionAdmin.adjust')}</h3>
          <div className="flex flex-wrap gap-2">
            <input className="field w-36" placeholder={t('progressionAdmin.expDelta')} value={exp} onChange={(e) => setExp(e.target.value.replace(/[^\d-]/g, ''))} aria-label={t('progressionAdmin.expDelta')} />
            <input className="field w-36" placeholder={t('progressionAdmin.rpDelta')} value={rp} onChange={(e) => setRp(e.target.value.replace(/[^\d-]/g, ''))} aria-label={t('progressionAdmin.rpDelta')} disabled={!r} />
            <input className="field min-w-48 flex-1" placeholder={t('progressionAdmin.reason')} value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={300} required aria-label={t('progressionAdmin.reason')} />
            <Button type="submit" variant="gold" size="sm" disabled={(!n(exp) && !n(rp)) || reason.trim().length < 5}>
              {t('progressionAdmin.save')}
            </Button>
          </div>
        </form>
      )}

      <Table
        head={[t('admin.fields.time'), 'EXP', t('admin.fields.reason'), t('level.title')]}
        rows={data.expEvents.map((e) => [date(e.createdAt), <span key="a" className={e.amount < 0 ? 'text-ruby-400' : 'text-emerald-400'}>{e.amount > 0 ? `+${e.amount}` : e.amount}</span>, e.note ?? e.source, e.levelAfter])}
      />
      <Table
        head={[t('admin.fields.time'), t('admin.fields.action'), 'RP', 'Rank', t('admin.fields.reason')]}
        rows={data.rankEvents.map((e) => [date(e.createdAt), t(`rank.result.${e.result}`, { defaultValue: e.result }), e.rpDelta > 0 ? `+${e.rpDelta}` : e.rpDelta, `${rankName(e.divisionAfter)} · ${e.rpAfter}`, e.note ?? '—'])}
      />
    </div>
  );
}
