import { MISSION_LIMITS, MISSION_RULES, type MissionConfig, type MissionDef, type MissionReward } from '@casino/shared';
import { useEffect, useState } from 'react';
import { adminApi } from '../net/adminApi';
import { Button } from '../ui/Button';
import { Panel, Pill } from './parts';
import { useAdminKit } from './useAdmin';

type Row = Required<MissionReward>;
const full = (r: MissionReward): Row => ({ silver: r.silver ?? 0, gold: r.gold ?? 0, vipExp: r.vipExp ?? 0 });

/** Admin → Mission settings. Everyone with progression.read can view; only the Owner can save. */
export function MissionConfigPage() {
  const { t, fmt, me, fail, done } = useAdminKit();
  const [defaults, setDefaults] = useState<MissionDef[] | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [cap, setCap] = useState<number>(MISSION_RULES.vipExpWeeklyCap);
  const owner = me?.roles.includes('owner') ?? false;

  const load = () =>
    void adminApi<{ defaults: MissionDef[]; config: MissionConfig | null }>('/api/admin/missions/config').then((r) => {
      setDefaults(r.defaults);
      setRows(Object.fromEntries(r.defaults.map((m) => [m.id, full(r.config?.rewards[m.id] ?? m.reward)])));
      setCap(r.config?.vipExpWeeklyCap ?? MISSION_RULES.vipExpWeeklyCap);
    }, fail);
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id: string, key: keyof Row, value: string) => setRows((r) => ({ ...r, [id]: { ...r[id]!, [key]: Math.max(0, Math.floor(Number(value.replace(/\D/g, '')) || 0)) } }));
  const save = (body: MissionConfig) =>
    void adminApi('/api/admin/missions/config', { method: 'PUT', body }).then(() => {
      done();
      load();
    }, fail);
  // Only values that differ from the code defaults are stored as overrides.
  const overrides = () =>
    Object.fromEntries(
      (defaults ?? [])
        .filter((m) => {
          const d = full(m.reward);
          const r = rows[m.id]!;
          return r.silver !== d.silver || r.gold !== d.gold || r.vipExp !== d.vipExp;
        })
        .map((m) => [m.id, rows[m.id]!]),
    );

  if (!defaults) return <Panel><p className="text-white/50">{t('app.loading')}</p></Panel>;
  return (
    <>
      <h1 className="font-display text-2xl">{t('admin.missionConfig.title')}</h1>
      <Panel>
        <p className="text-sm text-white/60">{t('admin.missionConfig.hint')}</p>
        {!owner && <p className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{t('admin.missionConfig.readOnly')}</p>}
        {(['daily', 'weekly', 'rank'] as const).map((g) => (
          <section key={g} className="flex flex-col gap-2">
            <h2 className="font-display text-lg">{t(`missions.groups.${g}`)}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-white/45">
                  <tr>
                    <th className="py-1.5 pr-2">{t('admin.missionConfig.mission')}</th>
                    <th className="pr-2">{t('admin.missionConfig.silver')}</th>
                    <th className="pr-2">{t('admin.missionConfig.gold')}</th>
                    <th>{t('admin.missionConfig.vip')}</th>
                  </tr>
                </thead>
                <tbody>
                  {defaults
                    .filter((m) => m.group === g)
                    .map((m) => {
                      const r = rows[m.id]!;
                      const d = full(m.reward);
                      return (
                        <tr key={m.id} className="border-t border-white/5">
                          <td className="py-2 pr-2">
                            <div className="text-white/85">{t(`missions.names.${m.id}`, { target: fmt(m.target) })}</div>
                            <code className="text-[10px] text-white/35">{m.id}</code>
                          </td>
                          {(['silver', 'gold', 'vipExp'] as const).map((k) => (
                            <td key={k} className="pr-2">
                              <input
                                className="field max-w-32"
                                inputMode="numeric"
                                aria-label={`${m.id} ${k}`}
                                value={r[k]}
                                disabled={!owner || (k === 'vipExp' && g !== 'rank')}
                                onChange={(e) => set(m.id, k, e.target.value)}
                              />
                              {r[k] !== d[k] && <div className="text-[10px] text-white/40">{t('admin.missionConfig.default', { value: fmt(d[k]) })}</div>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        <p className="text-xs text-white/50">{t('admin.missionConfig.vipOnlyRank', { max: MISSION_LIMITS.maxVipExpPerMission })}</p>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-white/70">{t('admin.missionConfig.weeklyCap', { max: MISSION_LIMITS.maxVipWeeklyCap })}</span>
          <input className="field max-w-28" inputMode="numeric" value={cap} disabled={!owner} onChange={(e) => setCap(Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, '')) || 0)))} />
          {cap !== MISSION_RULES.vipExpWeeklyCap && <Pill>{t('admin.missionConfig.default', { value: MISSION_RULES.vipExpWeeklyCap })}</Pill>}
        </label>
        {owner && (
          <div className="flex flex-wrap gap-2">
            <Button variant="gold" onClick={() => save({ rewards: overrides(), vipExpWeeklyCap: cap })}>
              {t('admin.missionConfig.save')}
            </Button>
            <Button onClick={() => save({ rewards: {}, vipExpWeeklyCap: MISSION_RULES.vipExpWeeklyCap })}>{t('admin.missionConfig.reset')}</Button>
          </div>
        )}
      </Panel>
    </>
  );
}
