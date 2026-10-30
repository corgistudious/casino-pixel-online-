import type { Badge, Currency, Permission } from '@casino/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { useSession } from '../store/session';
import { Button } from '../ui/Button';
import { TopBar } from '../ui/Chrome';
import { BadgeIcon } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';
import { SpecialUidForm } from '../admin/MiscPages';

interface Overview {
  users: number;
  testUsers: number;
  dataMode: 'test' | 'production';
  pendingVerification: number;
  activeBans: number;
  online: number;
  rounds24h: number;
  wagered24h: number;
  paid24h: number;
  chipsInCirculation: number;
  goldInCirculation: number;
  mailPending: number;
  deletionPending: number;
}

interface PlayerRow {
  uid: number;
  username: string;
  displayName: string;
  email: string | null;
  status: string;
  accountType: string;
  isTest: boolean;
}

interface BanRow {
  id: string;
  reason: string;
  endsAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface PlayerDetail {
  user: PlayerRow & { emailVerified: boolean; badges: Badge[]; roles: string[]; wallet: { balance: number; gold: number } };
  bans: BanRow[];
}

interface DeletionRow {
  id: string;
  uid: number;
  username: string;
  reason: string | null;
  createdAt: string;
}

interface AuditRow {
  id: number;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

function TestTag() {
  const { t } = useTranslation();
  return <span className="ml-2 rounded border border-neon-cyan/50 px-1 text-[10px] font-bold text-neon-cyan">{t('admin.testTag')}</span>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass flex flex-col gap-3 p-5">
      <h3 className="font-display text-xl">{title}</h3>
      {children}
    </section>
  );
}

/** Staff dashboard. Every section is shown only when the signed-in role holds its permission; the server checks again. */
export function AdminPage() {
  const { t, i18n } = useTranslation();
  const perms = new Set(useSession((s) => s.user)!.permissions as Permission[]);
  const can = (p: Permission) => perms.has(p);
  const [data, setData] = useState<Overview | null>(null);
  const fmt = (n: number) => formatChips(n, i18n.language);
  const date = (s: string) => new Date(s).toLocaleString(i18n.language);
  const fail = (err: unknown) => toast(errorText(t, err, i18n.language), 'error');

  const loadOverview = () => void api<Overview>('/api/admin/overview').then(setData, fail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadOverview, []);

  const edge = data && data.wagered24h > 0 ? (((data.wagered24h - data.paid24h) / data.wagered24h) * 100).toFixed(2) + '%' : '—';

  return (
    <div className="flex h-full flex-col">
      <TopBar title={t('admin.title')} back />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto grid max-w-5xl gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {data &&
              (
                [
                  ['admin.users', String(data.users)],
                  ['admin.testUsers', String(data.testUsers)],
                  ['admin.online', String(data.online)],
                  ['admin.rounds24h', String(data.rounds24h)],
                  ['admin.wagered24h', fmt(data.wagered24h)],
                  ['admin.paid24h', fmt(data.paid24h)],
                  ['admin.edge24h', edge],
                  ['admin.chips', fmt(data.chipsInCirculation)],
                  ['admin.gold', fmt(data.goldInCirculation)],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="glass p-4">
                  <div className="text-xs text-white/50">{t(k)}</div>
                  <div className="font-display text-2xl text-gold-100">{v}</div>
                </div>
              ))}
          </div>
          {can('users.read') ? <Players can={can} fail={fail} date={date} fmt={fmt} onChange={loadOverview} /> : <p className="text-sm text-white/50">{t('admin.noAccess')}</p>}
          {can('uid.assign') && <SpecialUids fail={fail} />}
          {can('deletion.manage') && <Deletions fail={fail} date={date} onChange={loadOverview} />}
          {can('audit.read') && <Audit fail={fail} date={date} />}
        </div>
      </div>
    </div>
  );
}

type Fail = (err: unknown) => void;

function Players({ can, fail, date, fmt, onChange }: { can: (p: Permission) => boolean; fail: Fail; date: (s: string) => string; fmt: (n: number) => string; onChange: () => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<PlayerRow[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('silver');
  const [unit, setUnit] = useState<'day' | 'month' | 'year' | 'permanent'>('day');
  const [banAmount, setBanAmount] = useState('1');
  const [reason, setReason] = useState('');
  const [roleId, setRoleId] = useState('');
  const [roles, setRoles] = useState<string[]>([]);

  const search = (e?: FormEvent) => {
    e?.preventDefault();
    void api<{ users: PlayerRow[] }>(`/api/admin/users?q=${encodeURIComponent(q.trim())}`).then((r) => setRows(r.users), fail);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => search(), []);
  useEffect(() => {
    if (can('staff.manage')) void api<{ roles: { id: string }[] }>('/api/admin/roles').then((r) => setRoles(r.roles.map((x) => x.id)), () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = (uid: number) => void api<PlayerDetail>(`/api/admin/users/${uid}`).then(setDetail, fail);
  useEffect(() => {
    if (selected !== null) load(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const call = async (method: string, path: string, body?: unknown) => {
    try {
      await api(path, { method, body });
      toast(t('admin.done'), 'success');
      if (selected !== null) load(selected);
      onChange();
    } catch (err) {
      fail(err);
    }
  };

  const uid = detail?.user.uid;
  const now = Date.now();
  const banState = (b: BanRow) => (b.revokedAt ? t('admin.revoked') : b.endsAt && new Date(b.endsAt).getTime() <= now ? t('admin.expired') : null);

  return (
    <Section title={t('admin.manage')}>
      <form onSubmit={search} className="flex gap-2">
        <input className="field" placeholder={t('admin.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit">{t('admin.searchSubmit')}</Button>
      </form>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto text-sm">
          {rows?.length === 0 && <li className="text-white/50">{t('admin.noResults')}</li>}
          {rows?.map((r) => (
            <li key={r.uid}>
              <button
                className={`w-full rounded-lg px-3 py-2 text-left transition ${selected === r.uid ? 'bg-gold-300/15 text-gold-100' : 'hover:bg-white/5'}`}
                onClick={() => setSelected(r.uid)}
              >
                <span className="tabular-nums text-white/50">#{r.uid}</span> {r.displayName} <span className="text-white/40">@{r.username}</span>
                {r.isTest && <TestTag />}
              </button>
            </li>
          ))}
        </ul>

        {!detail || uid === undefined ? (
          <p className="text-sm text-white/50">{t('admin.selectPlayer')}</p>
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <div className="font-display text-lg">
                {detail.user.displayName} <span className="text-white/40">@{detail.user.username} · UID {uid}</span>
                {detail.user.isTest && <TestTag />}
              </div>
              <div className="text-white/60">
                {detail.user.email ?? t('account.noEmail')} · {t(`account.statuses.${detail.user.status}`, { defaultValue: detail.user.status })} · {fmt(detail.user.wallet.balance)} {t('currency.silver')} · {fmt(detail.user.wallet.gold)} {t('currency.gold')}
              </div>
            </div>

            {can('economy.grant') && (
              <div className="flex flex-wrap gap-2">
                <select className="field max-w-40" aria-label={t('admin.currency')} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                  <option value="silver">{t('currency.silver')}</option>
                  <option value="gold">{t('currency.gold')}</option>
                </select>
                <input className="field max-w-48" placeholder={t('admin.amount')} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <Button variant="gold" disabled={!amount || !Number.isInteger(Number(amount))} onClick={() => void call('POST', `/api/admin/users/${uid}/grant`, { amount: Number(amount), currency })}>
                  {t('admin.grant')}
                </Button>
              </div>
            )}

            {can('badges.manage') && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-white/60">{t('admin.badges')}:</span>
                {(['verified', 'partner'] as const).map((b) => {
                  const has = detail.user.badges.includes(b);
                  return (
                    <Button key={b} size="sm" onClick={() => void call('POST', `/api/admin/users/${uid}/badges`, { [b]: !has })}>
                      <BadgeIcon badge={b} size={20} /> {has ? '−' : '+'} {t(`badges.${b}`)}
                    </Button>
                  );
                })}
              </div>
            )}

            {can('staff.manage') && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-white/60">{t('admin.roles')}:</span>
                {detail.user.roles.map((r) => (
                  <Button key={r} size="sm" onClick={() => void call('DELETE', `/api/admin/users/${uid}/roles/${r}`)}>
                    {r} ×
                  </Button>
                ))}
                <select className="field max-w-44" value={roleId} onChange={(e) => setRoleId(e.target.value)} aria-label={t('admin.roles')}>
                  <option value="">—</option>
                  {roles.filter((r) => !detail.user.roles.includes(r)).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <Button size="sm" disabled={!roleId} onClick={() => void call('POST', `/api/admin/users/${uid}/roles`, { roleId }).then(() => setRoleId(''))}>
                  +
                </Button>
              </div>
            )}

            {can('users.ban') && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <select className="field max-w-40" aria-label={t('admin.banDuration')} value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
                    {(['day', 'month', 'year', 'permanent'] as const).map((u) => (
                      <option key={u} value={u}>
                        {t(`admin.units.${u}`)}
                      </option>
                    ))}
                  </select>
                  {unit !== 'permanent' && (
                    <input className="field max-w-24" aria-label={t('admin.banAmount')} inputMode="numeric" value={banAmount} onChange={(e) => setBanAmount(e.target.value)} />
                  )}
                  <input className="field min-w-48 flex-1" placeholder={t('admin.banReason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
                  <Button
                    variant="ruby"
                    disabled={reason.trim().length < 3}
                    onClick={() =>
                      void call('POST', `/api/admin/users/${uid}/bans`, {
                        duration: unit === 'permanent' ? 'permanent' : { unit, amount: Number(banAmount) },
                        reason: reason.trim(),
                      }).then(() => setReason(''))
                    }
                  >
                    {t('admin.ban')}
                  </Button>
                </div>
                {detail.bans.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    <li className="text-white/60">{t('admin.activeBans')}</li>
                    {detail.bans.map((b) => {
                      const state = banState(b);
                      return (
                        <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2">
                          <span>
                            {date(b.createdAt)} · {b.endsAt ? t('admin.banEnds', { date: date(b.endsAt) }) : t('admin.banPermanent')} · {b.reason}
                          </span>
                          {state ? (
                            <span className="text-white/40">{state}</span>
                          ) : (
                            <Button
                              size="sm"
                              disabled={reason.trim().length < 3}
                              title={t('admin.revokeReason')}
                              onClick={() => void call('POST', `/api/admin/bans/${b.id}/revoke`, { reason: reason.trim() }).then(() => setReason(''))}
                            >
                              {t('admin.revoke')}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

function SpecialUids({ fail }: { fail: Fail }) {
  const { t } = useTranslation();
  const [list, setList] = useState<{ special: PlayerRow[]; nextPlayerUid: number } | null>(null);
  const load = () => void api<{ special: PlayerRow[]; nextPlayerUid: number }>('/api/admin/uids/special').then(setList, fail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);



  return (
    <Section title={t('admin.special')}>
      {list && <p className="text-sm text-white/60">{t('admin.nextUid', { uid: list.nextPlayerUid })}</p>}
      <ul className="flex flex-col gap-1 text-sm">
        {list?.special.map((r) => (
          <li key={r.uid} className="rounded-lg bg-black/20 px-3 py-2">
            <span className="tabular-nums text-gold-100">#{r.uid}</span> {r.displayName} <span className="text-white/40">@{r.username} · {r.accountType} · {r.status}</span>
            {r.isTest && <TestTag />}
          </li>
        ))}
      </ul>
      <SpecialUidForm onCreated={load} />
    </Section>
  );
}

function Deletions({ fail, date, onChange }: { fail: Fail; date: (s: string) => string; onChange: () => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<DeletionRow[]>([]);
  const [note, setNote] = useState('');
  const load = () => void api<{ requests: DeletionRow[] }>('/api/admin/deletion-requests').then((r) => setRows(r.requests), fail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const decide = async (id: string, approve: boolean) => {
    try {
      await api(`/api/admin/deletion-requests/${id}/decide`, { method: 'POST', body: { approve, note: note.trim() } });
      toast(t('admin.done'), 'success');
      setNote('');
      load();
      onChange();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <Section title={t('admin.deletions')}>
      {rows.length === 0 ? (
        <p className="text-sm text-white/50">—</p>
      ) : (
        <>
          <input className="field" placeholder={t('admin.decisionNote')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <ul className="flex flex-col gap-1 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2">
                <span>
                  #{r.uid} @{r.username} · {date(r.createdAt)} {r.reason && `· ${r.reason}`}
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="ruby" disabled={note.trim().length < 3} onClick={() => void decide(r.id, true)}>
                    {t('admin.approve')}
                  </Button>
                  <Button size="sm" disabled={note.trim().length < 3} onClick={() => void decide(r.id, false)}>
                    {t('admin.reject')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

function Audit({ fail, date }: { fail: Fail; date: (s: string) => string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AuditRow[]>([]);
  useEffect(() => {
    void api<{ entries: AuditRow[] }>('/api/admin/audit?limit=50').then((r) => setRows(r.entries), fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Section title={t('admin.audit')}>
      <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto font-mono text-xs">
        {rows.map((r) => (
          <li key={r.id} className="rounded bg-black/20 px-2 py-1">
            <span className="text-white/40">{date(r.createdAt)}</span> <span className="text-gold-100">{r.action}</span> {r.targetType && `${r.targetType}:${r.targetId}`}
          </li>
        ))}
      </ul>
    </Section>
  );
}
