import { DEFAULT_PARTICIPATION, type MailAttachment, type ParticipationRules, type SeasonBracket } from '@casino/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { adminApi } from '../net/adminApi';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';
import { AttachmentPills } from './AttachmentEditor';
import { Panel, Pill, Stat, Table } from './parts';
import { useAdminKit } from './useAdmin';

interface Season {
  id: number;
  name: string;
  status: 'scheduled' | 'active' | 'ended';
  startsAt: string;
  endsAt: string;
  participation: ParticipationRules;
}
interface Projection {
  eligible: number;
  perBracket: { bracket: SeasonBracket; players: number; silver: number; gold: number; attachments: MailAttachment[] }[];
  silver: number;
  gold: number;
}
interface Report {
  records: {
    uid: number;
    displayName: string;
    topPosition: number | null;
    bracket: SeasonBracket;
    attachments: MailAttachment[];
    silver: number;
    gold: number;
    status: 'pending' | 'delivered';
    attempts: number;
    lastError: string | null;
    claimedAt: string | null;
  }[];
  totals: { planned: { silver: number; gold: number }; claimed: { silver: number; gold: number }; participationSilver: number };
}
interface Flag {
  id: number;
  uid: number;
  displayName: string;
  kind: string;
  matchKey: string | null;
  createdAt: string;
}

/** Season rewards for Owner / Super Admin: projected and actual issuance, recipients, delivery and farming alerts. */
export function SeasonRewardsPage() {
  const { t, can, fmt, date, fail } = useAdminKit();
  const manage = can('progression.manage');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);

  const load = () => {
    void adminApi<{ seasons: Season[] }>('/api/admin/rank/seasons').then((r) => {
      setSeasons(r.seasons);
      setSelected((cur) => cur ?? r.seasons.find((s) => s.status === 'active')?.id ?? r.seasons[0]?.id ?? null);
    }, fail);
    void adminApi<{ flags: Flag[] }>('/api/admin/rank/flags').then((r) => setFlags(r.flags), fail);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const season = seasons.find((s) => s.id === selected);
  useEffect(() => {
    setProjection(null);
    setReport(null);
    if (!season) return;
    if (season.status === 'ended') void adminApi<Report>(`/api/admin/rank/seasons/${season.id}/rewards`).then(setReport, fail);
    else void adminApi<Projection>(`/api/admin/rank/seasons/${season.id}/projection`).then(setProjection, fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season?.id, season?.status]);

  const vgExpiry = report?.records.flatMap((r) => r.attachments).find((a) => a.type === 'item' && a.expiresAt);

  return (
    <>
      <h1 className="font-display text-2xl font-extrabold">{t('admin.nav.seasonRewards')}</h1>
      <div className="flex flex-wrap gap-2" role="tablist">
        {seasons.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={s.id === selected}
            onClick={() => setSelected(s.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${s.id === selected ? 'bg-gold-300/15 text-gold-100' : 'text-white/60 hover:bg-white/5'}`}
          >
            {s.name} <span className="text-[11px] text-white/45">· {t(`progressionAdmin.status.${s.status}`)}</span>
          </button>
        ))}
      </div>

      {projection && season && (
        <Panel title={t('seasonRewards.projection')}>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={t('seasonRewards.eligible')} value={fmt(projection.eligible)} />
            <Stat label={t('currency.silver')} value={fmt(projection.silver)} />
            <Stat label={t('currency.gold')} value={fmt(projection.gold)} />
            <Stat label={t('progressionAdmin.endsAt')} value={date(season.endsAt)} />
          </div>
          <Table
            head={[t('seasonRewards.title'), t('seasonRewards.players'), t('progressionAdmin.attachments'), t('currency.silver'), t('currency.gold')]}
            rows={projection.perBracket.map((b) => [t(`seasonRewards.bracket.${b.bracket}`), fmt(b.players), <AttachmentPills key="a" value={b.attachments} />, fmt(b.silver), fmt(b.gold)])}
          />
        </Panel>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={t('seasonRewards.planned')} value={`${fmt(report.totals.planned.silver)} / ${fmt(report.totals.planned.gold)}`} hint={`${t('currency.silver')} / ${t('currency.gold')}`} />
            <Stat label={t('seasonRewards.claimedTotal')} value={`${fmt(report.totals.claimed.silver)} / ${fmt(report.totals.claimed.gold)}`} />
            <Stat label={t('seasonRewards.participationTotal')} value={fmt(report.totals.participationSilver)} />
            <Stat label={t('seasonRewards.vuongGiaExpiry')} value={vgExpiry && vgExpiry.type === 'item' ? date(vgExpiry.expiresAt) : '—'} />
          </div>
          <Panel
            title={t('seasonRewards.records')}
            actions={
              manage && report.records.some((r) => r.status === 'pending') ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await adminApi('/api/admin/rank/rewards/retry', { method: 'POST', body: {} });
                      toast(t('admin.done'), 'success');
                      load();
                    } catch (err) {
                      fail(err);
                    }
                  }}
                >
                  {t('seasonRewards.retry')}
                </Button>
              ) : undefined
            }
          >
            <Table
              head={['#', 'UID', t('admin.fields.name'), t('seasonRewards.title'), t('progressionAdmin.attachments'), t('admin.fields.status'), t('seasonRewards.claimed')]}
              rows={report.records.map((r) => [
                r.topPosition ?? '—',
                r.uid,
                r.displayName,
                t(`seasonRewards.bracket.${r.bracket}`),
                <AttachmentPills key="a" value={r.attachments} />,
                <span key="s" className="flex flex-col">
                  <Pill tone={r.status === 'delivered' ? 'emerald' : 'ruby'}>{t(`seasonRewards.status.${r.status}`)}</Pill>
                  {r.lastError && <span className="text-[10px] text-ruby-400">{r.lastError}</span>}
                </span>,
                date(r.claimedAt),
              ])}
            />
          </Panel>
        </>
      )}

      {season && season.status !== 'ended' && <ParticipationForm season={season} canEdit={manage} onSaved={load} />}

      <Panel title={t('seasonRewards.flags')}>
        <Table
          head={[t('admin.fields.time'), 'UID', t('admin.fields.name'), t('admin.fields.action'), 'Match']}
          empty={t('seasonRewards.noFlags')}
          rows={flags.map((f) => [date(f.createdAt), f.uid, f.displayName, t(`seasonRewards.flagKind.${f.kind}`, { defaultValue: f.kind }), <code key="m" className="text-xs">{f.matchKey ?? '—'}</code>])}
        />
        {manage && season && season.status === 'active' && <Disqualify seasonId={season.id} />}
      </Panel>
    </>
  );
}

function ParticipationForm({ season, canEdit, onSaved }: { season: Season; canEdit: boolean; onSaved: () => void }) {
  const { t, fail } = useAdminKit();
  const [p, setP] = useState<ParticipationRules>({ ...DEFAULT_PARTICIPATION, ...season.participation });
  useEffect(() => setP({ ...DEFAULT_PARTICIPATION, ...season.participation }), [season]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await adminApi(`/api/admin/rank/seasons/${season.id}`, { method: 'PATCH', body: { participation: p } });
      toast(t('admin.done'), 'success');
      onSaved();
    } catch (err) {
      fail(err);
    }
  };
  const field = (k: keyof ParticipationRules) => (
    <label className="flex flex-col gap-1 text-xs font-semibold text-white/60">
      {t(`seasonRewards.${k}`)}
      <input className="field" inputMode="numeric" disabled={!canEdit} value={p[k]} onChange={(e) => setP({ ...p, [k]: Number(e.target.value.replace(/\D/g, '') || 0) })} />
    </label>
  );
  return (
    <Panel title={t('seasonRewards.participationConfig')}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {field('playSilver')}
          {field('winSilver')}
          {field('dailyMatchCap')}
          {field('samePairDailyCap')}
        </div>
        <p className="rounded-lg bg-amber-900/30 px-3 py-2 text-xs text-amber-100">{t('seasonRewards.approveNote')}</p>
        {canEdit && (
          <Button type="submit" variant="gold">
            {t('progressionAdmin.save')}
          </Button>
        )}
      </form>
    </Panel>
  );
}

function Disqualify({ seasonId }: { seasonId: number }) {
  const { t, fail } = useAdminKit();
  const [uid, setUid] = useState('');
  const [reason, setReason] = useState('');
  return (
    <form
      className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await adminApi(`/api/admin/rank/seasons/${seasonId}/disqualify`, { method: 'POST', body: { uid: Number(uid), disqualified: true, reason: reason.trim() } });
          toast(t('admin.done'), 'success');
          setUid('');
          setReason('');
        } catch (err) {
          fail(err);
        }
      }}
    >
      <span className="w-full text-xs font-semibold text-white/60">{t('seasonRewards.disqualify')}</span>
      <input className="field w-32" inputMode="numeric" placeholder="UID" value={uid} onChange={(e) => setUid(e.target.value.replace(/\D/g, ''))} />
      <input className="field min-w-48 flex-1" placeholder={t('progressionAdmin.reason')} value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} />
      <Button type="submit" variant="ruby" disabled={!uid || reason.trim().length < 5}>
        {t('seasonRewards.disqualify')}
      </Button>
    </form>
  );
}
