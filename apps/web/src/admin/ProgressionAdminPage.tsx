import { DEFAULT_RANK_RULES, LEVEL_MAX, RANK_TIERS, TOP_TITLES, type MailAttachment, type RankLadderEntry, type RankRules } from '@casino/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { adminApi } from '../net/adminApi';
import { Button } from '../ui/Button';
import { RankEmblem, useRankName } from '../ui/RankEmblem';
import { toast } from '../ui/toast';
import { AttachmentEditor, AttachmentPills } from './AttachmentEditor';
import { Panel, Pill, Table } from './parts';
import { useAdminKit } from './useAdmin';

interface Season {
  id: number;
  name: string;
  status: 'scheduled' | 'active' | 'ended';
  startsAt: string;
  endsAt: string;
  endedAt: string | null;
  rules: RankRules;
  rewards: { tiers: Record<string, MailAttachment[]>; top: Record<string, MailAttachment[]> };
}
interface LevelReward {
  level: number;
  attachments: MailAttachment[];
  enabled: boolean;
  updatedAt: string;
}

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** Ranked seasons and level milestone rewards. Changes need progression.manage and a password re-check. */
export function ProgressionAdminPage() {
  const { t, can, date, fail } = useAdminKit();
  const rankName = useRankName();
  const manage = can('progression.manage');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [rewards, setRewards] = useState<LevelReward[]>([]);
  const [ladder, setLadder] = useState<RankLadderEntry[]>([]);

  const load = () => {
    void adminApi<{ seasons: Season[] }>('/api/admin/rank/seasons').then((r) => setSeasons(r.seasons), fail);
    void adminApi<{ rewards: LevelReward[] }>('/api/admin/progression/level-rewards').then((r) => setRewards(r.rewards), fail);
    void adminApi<{ entries: RankLadderEntry[] }>('/api/rank/ladder').then((r) => setLadder(r.entries.slice(0, 20)), () => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const act = async (path: string, body?: object, okText?: string) => {
    try {
      const r = await adminApi<Record<string, unknown>>(path, { method: 'POST', body: body ?? {} });
      toast(okText ?? t('admin.done'), 'success');
      load();
      return r;
    } catch (err) {
      fail(err);
      return null;
    }
  };

  const endSeason = async (s: Season) => {
    if (!window.confirm(t('progressionAdmin.endConfirm', { name: s.name }))) return;
    const reason = window.prompt(t('progressionAdmin.reason'))?.trim();
    if (!reason || reason.length < 5) return;
    const r = (await act(`/api/admin/rank/seasons/${s.id}/end`, { reason })) as { players: number; rewardMails: number } | null;
    if (r) toast(t('progressionAdmin.ended', { players: r.players, mails: r.rewardMails }), 'success');
  };

  const hasActive = seasons.some((s) => s.status === 'active');

  return (
    <>
      <h1 className="font-display text-2xl">{t('admin.nav.progression')}</h1>
      {!manage && <p className="text-sm text-white/55">{t('progressionAdmin.readOnly')}</p>}

      <Panel title={t('progressionAdmin.seasons')}>
        <Table
          head={['#', t('progressionAdmin.name'), t('admin.fields.status'), t('progressionAdmin.startsAt'), t('progressionAdmin.endsAt'), 'RP', t('progressionAdmin.attachments'), '']}
          rows={seasons.map((s) => [
            s.id,
            s.name,
            <Pill key="st" tone={s.status === 'active' ? 'emerald' : s.status === 'scheduled' ? 'cyan' : 'muted'}>
              {t(`progressionAdmin.status.${s.status}`)}
            </Pill>,
            date(s.startsAt),
            date(s.endedAt ?? s.endsAt),
            `+${s.rules.winRp} / −${s.rules.lossRp} · ↓${s.rules.softResetDivisions}`,
            <span key="r" className="flex flex-col gap-1">
              {Object.entries(s.rewards.tiers ?? {}).map(([tier, a]) => (
                <span key={tier} className="flex items-center gap-1 text-[11px]">
                  {t(`rank.tiers.${tier}`)}: <AttachmentPills value={a} />
                </span>
              ))}
              {Object.entries(s.rewards.top ?? {}).map(([top, a]) => (
                <span key={top} className="flex items-center gap-1 text-[11px] text-gold-100">
                  {t(`rank.top.${top}`)}: <AttachmentPills value={a} />
                </span>
              ))}
            </span>,
            manage ? (
              <span key="a" className="flex gap-1">
                {s.status === 'scheduled' && !hasActive && (
                  <Button size="sm" onClick={() => void act(`/api/admin/rank/seasons/${s.id}/start`)}>
                    {t('progressionAdmin.start')}
                  </Button>
                )}
                {s.status === 'active' && (
                  <Button size="sm" variant="ruby" onClick={() => void endSeason(s)}>
                    {t('progressionAdmin.end')}
                  </Button>
                )}
              </span>
            ) : null,
          ])}
        />
      </Panel>

      {manage && <NewSeason onCreated={load} />}

      <Panel title={t('progressionAdmin.levelRewards')}>
        <Table
          head={[t('progressionAdmin.level'), t('progressionAdmin.attachments'), t('progressionAdmin.enabled'), t('admin.fields.time'), '']}
          empty={t('progressionAdmin.noRewards')}
          rows={rewards.map((r) => [
            r.level,
            <AttachmentPills key="a" value={r.attachments} />,
            r.enabled ? '✓' : '—',
            date(r.updatedAt),
            manage ? (
              <Button
                key="d"
                size="sm"
                onClick={async () => {
                  try {
                    await adminApi(`/api/admin/progression/level-rewards/${r.level}`, { method: 'DELETE' });
                    load();
                  } catch (err) {
                    fail(err);
                  }
                }}
              >
                {t('progressionAdmin.delete')}
              </Button>
            ) : null,
          ])}
        />
        {manage && <LevelRewardForm onSaved={load} />}
      </Panel>

      <Panel title={t('progressionAdmin.ladder')}>
        <Table
          head={['#', 'UID', t('admin.fields.name'), 'Rank', 'RP', `${t('rank.wins')}–${t('rank.losses')}`]}
          empty={t('rank.ladderEmpty')}
          rows={ladder.map((e) => [
            e.position,
            e.uid,
            e.displayName,
            <span key="r" className="flex items-center gap-2">
              <RankEmblem division={e.division} top={e.topTitle} size={24} />
              {rankName(e.division, e.topTitle)}
            </span>,
            e.rp,
            `${e.wins}–${e.losses}`,
          ])}
        />
      </Panel>
    </>
  );
}

function NewSeason({ onCreated }: { onCreated: () => void }) {
  const { t, fail } = useAdminKit();
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(new Date(Date.now() + 30 * 86_400_000)));
  const [rules, setRules] = useState<RankRules>(DEFAULT_RANK_RULES);
  const [tiers, setTiers] = useState<Record<string, MailAttachment[]>>({});
  const [top, setTop] = useState<Record<string, MailAttachment[]>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const clean = (r: Record<string, MailAttachment[]>) => Object.fromEntries(Object.entries(r).filter(([, a]) => a.length));
      await adminApi('/api/admin/rank/seasons', {
        method: 'POST',
        body: { name: name.trim(), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), rules, rewards: { tiers: clean(tiers), top: clean(top) } },
      });
      toast(t('admin.done'), 'success');
      setName('');
      setTiers({});
      setTop({});
      onCreated();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const num = (k: keyof RankRules) => (
    <label className="flex flex-col gap-1 text-xs text-white/55">
      {t(`progressionAdmin.${k === 'softResetDivisions' ? 'softReset' : k}`)}
      <input className="field" inputMode="numeric" value={rules[k]} onChange={(e) => setRules({ ...rules, [k]: Number(e.target.value.replace(/\D/g, '') || 0) })} />
    </label>
  );

  return (
    <Panel title={t('progressionAdmin.newSeason')}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('progressionAdmin.name')}
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} required />
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('progressionAdmin.startsAt')}
            <input className="field" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/55">
            {t('progressionAdmin.endsAt')}
            <input className="field" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {num('winRp')}
          {num('lossRp')}
          {num('softResetDivisions')}
        </div>
        <details className="rounded-xl border border-white/10 p-3">
          <summary className="cursor-pointer text-sm">{t('progressionAdmin.tierRewards')}</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {RANK_TIERS.map((tier) => (
              <AttachmentEditor key={tier.id} label={t(`rank.tiers.${tier.id}`)} value={tiers[tier.id] ?? []} onChange={(v) => setTiers({ ...tiers, [tier.id]: v })} />
            ))}
          </div>
        </details>
        <details className="rounded-xl border border-white/10 p-3">
          <summary className="cursor-pointer text-sm">{t('progressionAdmin.topRewards')}</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            {TOP_TITLES.map((tt) => (
              <AttachmentEditor key={tt.id} label={`${t(`rank.top.${tt.id}`)} (${t(`rank.topRange.${tt.id}`)})`} value={top[tt.id] ?? []} onChange={(v) => setTop({ ...top, [tt.id]: v })} />
            ))}
          </div>
        </details>
        <Button type="submit" variant="gold" disabled={busy || name.trim().length < 2}>
          {t('progressionAdmin.newSeason')}
        </Button>
      </form>
    </Panel>
  );
}

function LevelRewardForm({ onSaved }: { onSaved: () => void }) {
  const { t, fail } = useAdminKit();
  const [level, setLevel] = useState('10');
  const [enabled, setEnabled] = useState(true);
  const [attachments, setAttachments] = useState<MailAttachment[]>([]);
  const lv = Number(level);
  const valid = Number.isInteger(lv) && lv >= 2 && lv <= LEVEL_MAX && attachments.length > 0 && attachments.every((a) => a.type === 'item' || a.amount > 0);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await adminApi(`/api/admin/progression/level-rewards/${lv}`, { method: 'PUT', body: { attachments, enabled } });
      toast(t('admin.done'), 'success');
      setAttachments([]);
      onSaved();
    } catch (err) {
      fail(err);
    }
  };
  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4">
      <h3 className="text-sm font-semibold">{t('progressionAdmin.addLevelReward')}</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-white/55">
          {t('progressionAdmin.level')} (2–{LEVEL_MAX})
          <input className="field w-28" inputMode="numeric" value={level} onChange={(e) => setLevel(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-gold-300" />
          {t('progressionAdmin.enabled')}
        </label>
      </div>
      <AttachmentEditor value={attachments} onChange={setAttachments} />
      <Button type="submit" variant="gold" disabled={!valid}>
        {t('progressionAdmin.save')}
      </Button>
    </form>
  );
}
