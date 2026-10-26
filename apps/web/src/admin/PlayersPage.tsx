import type { Badge, Currency } from '@casino/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminApi, newIdempotencyKey } from '../net/adminApi';
import { Button } from '../ui/Button';
import { BadgeIcon } from '../ui/OfficialAssets';
import { PlayerProgression } from './PlayerProgression';
import { Empty, Panel, Pill, Table } from './parts';
import { useAdminKit } from './useAdmin';

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
  evidence: string | null;
  endsAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
  issuedByUid: number | null;
  issuedByName: string | null;
  revokedByUid: number | null;
  revokedByName: string | null;
}

interface Detail {
  user: PlayerRow & { emailMasked: string | null; hasEmail: boolean; emailVerified: boolean; protected: boolean; badges: Badge[]; roles: string[]; createdAt: string; wallet: { balance: number; gold: number } };
  bans: BanRow[];
}

interface Activity {
  items: { itemId: string; acquiredAt: string }[];
  rounds: { id: string; game: string; bet: number; payout: number; status: string; createdAt: string }[];
  stats: { rounds: number; wagered: number; won: number };
  security: { id: number; action: string; ip: string | null; createdAt: string }[] | null;
}

type Tab = 'overview' | 'inventory' | 'rounds' | 'ledger' | 'progression' | 'security' | 'bans';

export function PlayersPage() {
  const { t, fail } = useAdminKit();
  const { uid } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<PlayerRow[] | null>(null);

  const search = (e?: FormEvent) => {
    e?.preventDefault();
    void adminApi<{ users: PlayerRow[] }>(`/api/admin/users?q=${encodeURIComponent(q.trim())}&limit=50`).then((r) => setRows(r.users), fail);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => search(), []);

  return (
    <>
      <h1 className="font-display text-2xl">{t('admin.nav.players')}</h1>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel>
          <form onSubmit={search} className="flex gap-2">
            <input className="field" placeholder={t('admin.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('admin.search')} />
            <Button type="submit">{t('admin.searchSubmit')}</Button>
          </form>
          <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto text-sm">
            {rows?.length === 0 && <Empty>{t('admin.noResults')}</Empty>}
            {rows?.map((r) => (
              <li key={r.uid}>
                <button
                  type="button"
                  className={`flex w-full flex-wrap items-center gap-x-2 rounded-lg px-3 py-2 text-left transition ${String(r.uid) === uid ? 'bg-gold-300/15 text-gold-100' : 'hover:bg-white/5'}`}
                  onClick={() => navigate(`/admin/players/${r.uid}`)}
                >
                  <span className="tabular-nums text-white/50">#{r.uid}</span>
                  <span>{r.displayName}</span>
                  <span className="text-white/40">@{r.username}</span>
                  {r.isTest && <Pill tone="cyan">{t('admin.testTag')}</Pill>}
                  {r.status !== 'active' && <Pill>{t(`account.statuses.${r.status}`, { defaultValue: r.status })}</Pill>}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        {uid ? <PlayerDetail key={uid} uid={Number(uid)} /> : <Panel><Empty>{t('admin.selectPlayerHint')}</Empty></Panel>}
      </div>
    </>
  );
}

function PlayerDetail({ uid }: { uid: number }) {
  const { t, can, fmt, date, fail, done, me } = useAdminKit();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  const load = () => {
    void adminApi<Detail>(`/api/admin/users/${uid}`).then(setDetail, fail);
    void adminApi<Activity>(`/api/admin/users/${uid}/activity`).then(setActivity, fail);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [uid]);

  const call = async (method: string, path: string, body?: unknown) => {
    try {
      await adminApi(path, { method, body });
      done();
      load();
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  };

  if (!detail) return <Panel><p className="text-white/50">{t('app.loading')}</p></Panel>;
  const u = detail.user;
  const tabs: { id: Tab; show: boolean }[] = [
    { id: 'overview', show: true },
    { id: 'inventory', show: true },
    { id: 'rounds', show: true },
    { id: 'ledger', show: can('economy.read') },
    { id: 'progression', show: can('progression.read') },
    { id: 'security', show: can('users.pii') },
    { id: 'bans', show: true },
  ];

  return (
    <Panel>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl">{u.displayName}</h2>
            {u.badges.map((b) => (
              <BadgeIcon key={b} badge={b} size={20} />
            ))}
            {u.protected && <Pill tone="gold">{t('admin.protectedTag')}</Pill>}
            {u.isTest && <Pill tone="cyan">{t('admin.testTag')}</Pill>}
            {u.roles.map((r) => (
              <Pill key={r} tone="emerald">
                {t(`admin.roleNames.${r}`, { defaultValue: r })}
              </Pill>
            ))}
          </div>
          <p className="text-sm text-white/55">
            @{u.username} · UID {u.uid} · {t(`account.statuses.${u.status}`, { defaultValue: u.status })}
            {u.uid === me?.uid && ` · ${t('admin.fields.you')}`}
          </p>
        </div>
        <div className="text-right text-sm tabular-nums">
          <div className="text-gold-100">
            {fmt(u.wallet.balance)} {t('currency.silver')}
          </div>
          <div className="text-white/60">
            {fmt(u.wallet.gold)} {t('currency.gold')}
          </div>
        </div>
      </header>
      {u.protected && <p className="rounded-lg border border-gold-300/30 bg-gold-300/10 px-3 py-2 text-xs text-gold-100">{t('admin.protectedNote')}</p>}

      <div className="flex gap-1 overflow-x-auto border-b border-white/10" role="tablist">
        {tabs
          .filter((x) => x.show)
          .map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              onClick={() => setTab(x.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${tab === x.id ? 'border-gold-300 text-gold-100' : 'border-transparent text-white/55 hover:text-white'}`}
            >
              {t(`admin.tabs.${x.id}`)}
            </button>
          ))}
      </div>

      {tab === 'overview' && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-3">
            <Field label={t('admin.fields.email')} value={u.email ? `${u.email}${u.emailVerified ? ' ✓' : ''}` : u.emailMasked ? `${u.emailMasked}${u.emailVerified ? ' ✓' : ''}` : t('account.noEmail')} />
            <Field label={t('admin.fields.created')} value={date(u.createdAt)} />
            <Field label={t('admin.fields.status')} value={t(`account.statuses.${u.status}`, { defaultValue: u.status })} />
            {activity && (
              <>
                <Field label={t('admin.dash.rounds')} value={fmt(activity.stats.rounds)} />
                <Field label={t('admin.fields.wagered')} value={fmt(activity.stats.wagered)} />
                <Field label={t('admin.fields.won')} value={fmt(activity.stats.won)} />
              </>
            )}
          </dl>
          <Actions detail={detail} call={call} />
          <Recovery detail={detail} call={call} />
        </div>
      )}

      {tab === 'inventory' && (
        <Table
          head={[t('admin.fields.item'), t('admin.fields.acquired')]}
          rows={(activity?.items ?? []).map((i) => [t(`shop.names.${i.itemId}`, { defaultValue: i.itemId }), date(i.acquiredAt)])}
        />
      )}

      {tab === 'rounds' && (
        <Table
          head={[t('admin.fields.time'), t('admin.fields.game'), t('admin.fields.bet'), t('admin.fields.payout'), t('admin.fields.status')]}
          rows={(activity?.rounds ?? []).map((r) => [date(r.createdAt), t(`games.${r.game}.name`, { defaultValue: r.game }), fmt(r.bet), fmt(r.payout), t(`admin.roundStatus.${r.status}`, { defaultValue: r.status })])}
        />
      )}

      {tab === 'ledger' && <Ledger uid={uid} />}

      {tab === 'progression' && <PlayerProgression uid={uid} isPlayer={u.accountType === 'player' && u.status !== 'deleted'} />}

      {tab === 'security' && (
        <Table
          head={[t('admin.fields.time'), t('admin.fields.action'), t('admin.fields.ip')]}
          rows={(activity?.security ?? []).map((s) => [date(s.createdAt), <code key="a" className="text-xs">{s.action}</code>, s.ip ?? '—'])}
        />
      )}

      {tab === 'bans' && (
        <>
          <BanStatus bans={detail.bans} canChange={can('users.ban') && !u.protected} call={call} />
          <BanHistory bans={detail.bans} canLift={can('users.ban') && !u.protected} call={call} />
        </>
      )}
    </Panel>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-white/45">{label}</dt>
      <dd className="break-all text-white/85">{value}</dd>
    </div>
  );
}

function Actions({ detail, call }: { detail: Detail; call: (m: string, p: string, b?: unknown) => Promise<boolean> }) {
  const { t, can, me } = useAdminKit();
  const u = detail.user;
  const [currency, setCurrency] = useState<Currency>('silver');
  const [amount, setAmount] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [unit, setUnit] = useState<'day' | 'month' | 'year' | 'permanent'>('day');
  const [banAmount, setBanAmount] = useState('1');
  const [banReason, setBanReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [roleId, setRoleId] = useState('');
  const self = u.uid === me?.uid;
  const restrictable = !u.protected && !self && u.accountType === 'player';

  return (
    <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
      {can('economy.grant') && u.accountType === 'player' && u.status !== 'deleted' && (
        <div className="flex flex-wrap gap-2">
          <select className="field max-w-36" aria-label={t('admin.currency')} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option value="silver">{t('currency.silver')}</option>
            <option value="gold">{t('currency.gold')}</option>
          </select>
          <input className="field max-w-40" placeholder={t('admin.amount')} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="field min-w-48 flex-1" placeholder={t('admin.grantReason')} value={grantReason} onChange={(e) => setGrantReason(e.target.value)} maxLength={500} />
          <Button
            variant="gold"
            disabled={!amount || !Number.isInteger(Number(amount)) || Number(amount) === 0 || grantReason.trim().length < 3}
            onClick={() =>
              void call('POST', `/api/admin/users/${u.uid}/grant`, { amount: Number(amount), currency, reason: grantReason.trim(), idempotencyKey: newIdempotencyKey() }).then(
                (ok) => ok && (setAmount(''), setGrantReason('')),
              )
            }
          >
            {t('admin.grant')}
          </Button>
        </div>
      )}

      {can('badges.manage') && u.accountType === 'player' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-white/60">{t('admin.badges')}:</span>
          {(['verified', 'partner'] as const).map((b) => {
            const has = u.badges.includes(b);
            return (
              <Button key={b} size="sm" onClick={() => void call('POST', `/api/admin/users/${u.uid}/badges`, { [b]: !has })}>
                <BadgeIcon badge={b} size={18} /> {has ? '−' : '+'} {t(`badges.${b}`)}
              </Button>
            );
          })}
        </div>
      )}

      {can('staff.manage') && restrictable && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-white/60">{t('admin.roles')}:</span>
          {u.roles.map((r) => (
            <Button key={r} size="sm" disabled={!me?.grantableRoles.includes(r)} onClick={() => void call('DELETE', `/api/admin/users/${u.uid}/roles/${r}`)}>
              {t(`admin.roleNames.${r}`, { defaultValue: r })} ×
            </Button>
          ))}
          <select className="field max-w-44" value={roleId} onChange={(e) => setRoleId(e.target.value)} aria-label={t('admin.roles')}>
            <option value="">—</option>
            {(me?.grantableRoles ?? [])
              .filter((r) => !u.roles.includes(r))
              .map((r) => (
                <option key={r} value={r}>
                  {t(`admin.roleNames.${r}`, { defaultValue: r })}
                </option>
              ))}
          </select>
          <Button size="sm" disabled={!roleId} onClick={() => void call('POST', `/api/admin/users/${u.uid}/roles`, { roleId }).then((ok) => ok && setRoleId(''))}>
            +
          </Button>
        </div>
      )}

      {can('users.ban') && restrictable && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <select className="field max-w-36" aria-label={t('admin.banDuration')} value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
              {(['day', 'month', 'year', 'permanent'] as const).map((x) => (
                <option key={x} value={x}>
                  {t(`admin.units.${x}`)}
                </option>
              ))}
            </select>
            {unit !== 'permanent' && (
              <input className="field max-w-20" aria-label={t('admin.banAmount')} inputMode="numeric" value={banAmount} onChange={(e) => setBanAmount(e.target.value)} />
            )}
            <input className="field min-w-48 flex-1" placeholder={t('admin.banReason')} value={banReason} onChange={(e) => setBanReason(e.target.value)} maxLength={500} />
          </div>
          <div className="flex flex-wrap gap-2">
            <input className="field min-w-48 flex-1" placeholder={t('admin.fields.evidence')} value={evidence} onChange={(e) => setEvidence(e.target.value)} maxLength={2000} />
            <Button
              variant="ruby"
              disabled={banReason.trim().length < 3 || (unit !== 'permanent' && !(Number(banAmount) >= 1))}
              onClick={() =>
                void call('POST', `/api/admin/users/${u.uid}/bans`, {
                  duration: unit === 'permanent' ? 'permanent' : { unit, amount: Number(banAmount) },
                  reason: banReason.trim(),
                  ...(evidence.trim() ? { evidence: evidence.trim() } : {}),
                }).then((ok) => ok && (setBanReason(''), setEvidence('')))
              }
            >
              {t('admin.ban')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const HIGH_TRUST = ['owner', 'super_admin'];
const strongPassword = (p: string) => p.length >= 8 && p.length <= 128 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);

/** Password reset and email unlink. The server re-checks role, rank, protected accounts and re-auth. */
function Recovery({ detail, call }: { detail: Detail; call: (m: string, p: string, b?: unknown) => Promise<boolean> }) {
  const { t, can, me } = useAdminKit();
  const u = detail.user;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState(false);
  const highTrust = me?.roles.some((r) => HIGH_TRUST.includes(r)) ?? false;
  const eligible = highTrust && !u.protected && u.uid !== me?.uid && u.accountType === 'player' && u.status !== 'deleted';
  if (!eligible || !(can('users.password_reset') || can('users.email_unlink'))) return null;
  const reasonOk = reason.trim().length >= 3;
  const pwError = password && !strongPassword(password) ? t('admin.recovery.weak') : confirm && confirm !== password ? t('admin.recovery.mismatch') : '';
  const reset = () => {
    if (!window.confirm(t('admin.recovery.confirmReset', { name: u.displayName }))) return;
    void call('POST', `/api/admin/users/${u.uid}/password`, { password, reason: reason.trim() }).then((ok) => ok && (setPassword(''), setConfirm(''), setReason(''), setChecked(false)));
  };
  const unlink = () => {
    if (!window.confirm(t('admin.recovery.confirmUnlink', { name: u.displayName }))) return;
    void call('POST', `/api/admin/users/${u.uid}/email/unlink`, { reason: reason.trim() }).then((ok) => ok && (setReason(''), setChecked(false)));
  };
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-ruby-400/25 bg-ruby-500/5 p-4" aria-labelledby="recovery-title">
      <div>
        <h3 id="recovery-title" className="font-display text-base text-white">{t('admin.recovery.title')}</h3>
        <p className="text-xs text-white/55">{t('admin.recovery.hint')}</p>
      </div>
      <input className="field" placeholder={t('admin.recovery.reason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      <label className="flex items-center gap-2 text-xs text-white/70">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> {t('admin.recovery.understood')}
      </label>
      {can('users.password_reset') && (
        <div className="flex flex-wrap items-start gap-2">
          <input className="field max-w-56" type="password" autoComplete="new-password" placeholder={t('admin.recovery.newPassword')} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
          <input className="field max-w-56" type="password" autoComplete="new-password" placeholder={t('admin.recovery.confirmPassword')} value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={128} />
          <Button variant="ruby" disabled={!checked || !reasonOk || !strongPassword(password) || password !== confirm} onClick={reset}>
            {t('admin.recovery.resetPassword')}
          </Button>
          {pwError && <p className="w-full text-xs text-ruby-400" role="alert">{pwError}</p>}
        </div>
      )}
      {can('users.email_unlink') && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-white/60">{t('admin.recovery.email')}:</span>
          <code className="text-white/85">{u.emailMasked ?? t('admin.recovery.noEmail')}</code>
          <Button size="sm" variant="ruby" disabled={!u.hasEmail || !checked || !reasonOk} onClick={unlink}>
            {t('admin.recovery.unlink')}
          </Button>
        </div>
      )}
    </section>
  );
}

/** Current ban, if any, with a control to extend, shorten or make it permanent. */
function BanStatus({ bans, canChange, call }: { bans: BanRow[]; canChange: boolean; call: (m: string, p: string, b?: unknown) => Promise<boolean> }) {
  const { t, date } = useAdminKit();
  const now = Date.now();
  const active = bans.find((b) => !b.revokedAt && (!b.endsAt || new Date(b.endsAt).getTime() > now));
  const [end, setEnd] = useState('');
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${active ? 'border-ruby-400/40 bg-ruby-500/10' : 'border-emerald-400/30 bg-emerald-500/10'}`}>
      <span className="text-xs uppercase tracking-wide text-white/50">{t('admin.banStatus.title')}</span>
      <strong className={active ? 'text-ruby-300' : 'text-emerald-300'}>
        {!active ? t('admin.banStatus.clean') : active.endsAt ? t('admin.banStatus.bannedUntil', { date: date(active.endsAt) }) : t('admin.banStatus.bannedForever')}
      </strong>
      {active && canChange && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="text-xs text-white/55" htmlFor="ban-end">{t('admin.banStatus.newEnd')}</label>
          <input id="ban-end" className="field max-w-56" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          <Button size="sm" disabled={!end || new Date(end).getTime() <= Date.now()} onClick={() => void call('PATCH', `/api/admin/bans/${active.id}`, { endsAt: new Date(end).toISOString() }).then((ok) => ok && setEnd(''))}>
            {t('admin.banStatus.save')}
          </Button>
          {active.endsAt && (
            <Button size="sm" variant="ruby" onClick={() => void call('PATCH', `/api/admin/bans/${active.id}`, { endsAt: null })}>
              {t('admin.banStatus.makePermanent')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function BanHistory({ bans, canLift, call }: { bans: BanRow[]; canLift: boolean; call: (m: string, p: string, b?: unknown) => Promise<boolean> }) {
  const { t, date } = useAdminKit();
  const [reason, setReason] = useState('');
  const now = Date.now();
  if (!bans.length) return <Empty />;
  return (
    <div className="flex flex-col gap-2">
      {canLift && <input className="field" placeholder={t('admin.revokeReason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
      <ul className="flex flex-col gap-2 text-sm">
        {bans.map((b) => {
          const active = !b.revokedAt && (!b.endsAt || new Date(b.endsAt).getTime() > now);
          return (
            <li key={b.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-black/20 px-3 py-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-white/85">{b.reason}</span>
                <span className="text-xs text-white/50">
                  {date(b.createdAt)} · {b.endsAt ? t('admin.banEnds', { date: date(b.endsAt) }) : t('admin.banPermanent')} · {t('admin.fields.issuedBy')}: {b.issuedByUid ? `#${b.issuedByUid} ${b.issuedByName}` : '—'}
                </span>
                {b.evidence && <span className="text-xs text-white/45">{t('admin.fields.evidence')}: {b.evidence}</span>}
                {b.revokedAt && (
                  <span className="text-xs text-emerald-400">
                    {t('admin.revoked')} {date(b.revokedAt)} · {t('admin.fields.liftedBy')}: {b.revokedByUid ? `#${b.revokedByUid} ${b.revokedByName}` : '—'} · {b.revokeReason}
                  </span>
                )}
              </div>
              {active ? (
                canLift && (
                  <Button size="sm" disabled={reason.trim().length < 3} onClick={() => void call('POST', `/api/admin/bans/${b.id}/revoke`, { reason: reason.trim() }).then((ok) => ok && setReason(''))}>
                    {t('admin.revoke')}
                  </Button>
                )
              ) : (
                !b.revokedAt && <Pill>{t('admin.expired')}</Pill>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Ledger({ uid }: { uid: number }) {
  const { t, fmt, date, fail } = useAdminKit();
  const [rows, setRows] = useState<{ id: number; currency: string; delta: number; balanceAfter: number; reason: string; createdAt: string }[]>([]);
  const [more, setMore] = useState(true);
  const load = (offset: number) =>
    void adminApi<{ entries: typeof rows }>(`/api/admin/users/${uid}/ledger?limit=50&offset=${offset}`).then((r) => {
      setRows((prev) => (offset ? [...prev, ...r.entries] : r.entries));
      setMore(r.entries.length === 50);
    }, fail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(0), [uid]);
  return (
    <>
      <Table
        head={[t('admin.fields.time'), t('admin.fields.reason'), t('admin.fields.delta'), t('admin.fields.balanceAfter')]}
        rows={rows.map((r) => [
          date(r.createdAt),
          r.reason,
          <span key="d" className={r.delta < 0 ? 'text-ruby-400' : 'text-emerald-400'}>
            {r.delta > 0 ? '+' : ''}
            {fmt(r.delta)} {t(`currency.${r.currency}`)}
          </span>,
          fmt(r.balanceAfter),
        ])}
      />
      {more && rows.length > 0 && (
        <Button size="sm" onClick={() => load(rows.length)}>
          {t('admin.loadMore')}
        </Button>
      )}
    </>
  );
}
