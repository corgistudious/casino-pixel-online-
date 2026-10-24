import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../net/adminApi';
import { Button } from '../ui/Button';
import { Panel, Pill, Table } from './parts';
import { useAdminKit } from './useAdmin';

interface StaffRow {
  uid: number;
  username: string;
  displayName: string;
  roles: string[];
  rank: number;
}

export function StaffPage() {
  const { t, can, me, fail, done } = useAdminKit();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [uid, setUid] = useState('');
  const [roleId, setRoleId] = useState('');
  const load = () => void adminApi<{ staff: StaffRow[] }>('/api/admin/staff').then((r) => setStaff(r.staff), fail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const run = async (method: string, path: string, body?: unknown) => {
    try {
      await adminApi(path, { method, body });
      done();
      load();
    } catch (err) {
      fail(err);
    }
  };
  const grant = (e: FormEvent) => {
    e.preventDefault();
    void run('POST', `/api/admin/users/${Number(uid)}/roles`, { roleId }).then(() => setUid(''));
  };
  const manageable = (row: StaffRow) => can('staff.manage') && row.uid !== me?.uid && row.rank < (me?.rank ?? 0);

  return (
    <>
      <h1 className="font-display text-2xl">{t('admin.staffTitle')}</h1>
      {can('staff.manage') && (
        <Panel title={t('admin.grantRoleTo')}>
          <form onSubmit={grant} className="flex flex-wrap gap-2">
            <input className="field max-w-40" placeholder="UID" inputMode="numeric" value={uid} onChange={(e) => setUid(e.target.value.replace(/\D/g, ''))} aria-label="UID" />
            <select className="field max-w-48" value={roleId} onChange={(e) => setRoleId(e.target.value)} aria-label={t('admin.roles')}>
              <option value="">—</option>
              {(me?.grantableRoles ?? []).map((r) => (
                <option key={r} value={r}>
                  {t(`admin.roleNames.${r}`, { defaultValue: r })}
                </option>
              ))}
            </select>
            <Button type="submit" variant="gold" disabled={!uid || !roleId}>
              +
            </Button>
          </form>
          <p className="text-xs text-white/45">{t('admin.rankNote')}</p>
        </Panel>
      )}
      <Panel>
        <Table
          head={[t('admin.fields.uid'), t('admin.fields.displayName'), t('admin.fields.roles')]}
          rows={staff.map((s) => [
            <Link key="u" to={`/admin/players/${s.uid}`} className="text-gold-100 hover:underline">
              #{s.uid}
            </Link>,
            `${s.displayName} (@${s.username})`,
            <span key="r" className="flex flex-wrap gap-1">
              {s.roles.map((r) =>
                manageable(s) && r !== 'owner' && me?.grantableRoles.includes(r) ? (
                  <button key={r} type="button" onClick={() => void run('DELETE', `/api/admin/users/${s.uid}/roles/${r}`)} className="rounded border border-white/20 px-1.5 text-[11px] hover:border-ruby-400 hover:text-ruby-400">
                    {t(`admin.roleNames.${r}`, { defaultValue: r })} ×
                  </button>
                ) : (
                  <Pill key={r} tone={r === 'owner' ? 'gold' : 'emerald'}>
                    {t(`admin.roleNames.${r}`, { defaultValue: r })}
                  </Pill>
                ),
              )}
            </span>,
          ])}
        />
      </Panel>
    </>
  );
}
