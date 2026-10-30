import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../net/adminApi';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';
import { Panel, Pill, Table } from './parts';
import { useAdminKit } from './useAdmin';

interface SpecialRow {
  uid: number;
  username: string;
  displayName: string;
  status: string;
  accountType: string;
  isTest: boolean;
}

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((c === 'x' ? Math.random() * 16 : (Math.random() * 4) | 8) | 0).toString(16));

/**
 * Special UID account: exactly four fields. The password lives only in this component's state,
 * is sent once over the API (never in a URL or storage) and is cleared after success.
 */
export function SpecialUidForm({ onCreated }: { onCreated: () => void }) {
  const { t, fail } = useAdminKit();
  const empty = { uid: '', displayName: '', password: '', confirmPassword: '' };
  const [form, setForm] = useState(empty);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ uid: number; displayName: string } | null>(null);
  // One key per filled-in form: a retry after a dropped response returns the same account.
  const key = useRef(newKey());
  const mismatch = !!form.confirmPassword && form.password !== form.confirmPassword;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || mismatch) return;
    setBusy(true);
    try {
      const r = await adminApi<{ uid: number; displayName: string }>('/api/admin/accounts', {
        method: 'POST',
        body: { uid: Number(form.uid), displayName: form.displayName.trim(), password: form.password, confirmPassword: form.confirmPassword, idempotencyKey: key.current },
      });
      setCreated({ uid: r.uid, displayName: r.displayName });
      setForm(empty);
      setShow(false);
      key.current = newKey();
      onCreated();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof typeof empty) => (e: ChangeEvent<HTMLInputElement>) => {
    setCreated(null);
    setForm({ ...form, [k]: k === 'uid' ? e.target.value.replace(/\D/g, '').slice(0, 5) : e.target.value });
  };
  const label = 'flex flex-col gap-1 text-xs text-white/60';
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" autoComplete="off">
      <p className="text-xs text-white/50 sm:col-span-2">{t('admin.createSpecialHint')}</p>
      <label className={label}>
        {t('admin.specialFields.uid')}
        <input className="field tabular-nums" inputMode="numeric" required value={form.uid} onChange={set('uid')} placeholder="1–99999" />
      </label>
      <label className={label}>
        {t('admin.specialFields.displayName')}
        <input className="field" required maxLength={24} value={form.displayName} onChange={set('displayName')} />
      </label>
      <label className={label}>
        {t('admin.specialFields.password')}
        <input className="field" type={show ? 'text' : 'password'} required minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={set('password')} />
      </label>
      <label className={label}>
        {t('admin.specialFields.confirmPassword')}
        <input className="field" type={show ? 'text' : 'password'} required minLength={8} maxLength={128} autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} aria-invalid={mismatch} />
        {mismatch && <span className="text-ruby-300">{t('errors.password_mismatch')}</span>}
      </label>
      <p className="text-[11px] text-white/45 sm:col-span-2">{t('auth.passwordHint')}</p>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button type="button" size="sm" onClick={() => setShow((v) => !v)} aria-pressed={show}>
          {show ? t('admin.hidePassword') : t('admin.showPassword')}
        </Button>
        <Button type="submit" variant="gold" className="flex-1" disabled={busy || mismatch || !form.uid || !form.displayName.trim() || form.password.length < 8 || !form.confirmPassword}>
          {t('admin.createSpecial')}
        </Button>
      </div>
      {created && (
        <div role="status" className="flex flex-col gap-1 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100 sm:col-span-2">
          <p>{t('admin.specialCreated')}</p>
          <p className="font-strong text-white">
            UID <span className="tabular-nums text-gold-100">{created.uid}</span> · {created.displayName}
          </p>
        </div>
      )}
      <p className="text-[11px] text-white/40 sm:col-span-2">{t('admin.specialRecovery')}</p>
    </form>
  );
}

export function UidsPage() {
  const { t, fail } = useAdminKit();
  const [list, setList] = useState<{ special: SpecialRow[]; nextPlayerUid: number } | null>(null);
  const load = () => void adminApi<{ special: SpecialRow[]; nextPlayerUid: number }>('/api/admin/uids/special').then(setList, fail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);
  return (
    <>
      <h1 className="font-display text-2xl">{t('admin.special')}</h1>
      <Panel title={t('admin.createSpecial')}>
        <SpecialUidForm onCreated={load} />
      </Panel>
      <Panel title={list ? t('admin.nextUid', { uid: list.nextPlayerUid }) : undefined}>
        <Table
          head={[t('admin.fields.uid'), t('admin.fields.displayName'), t('admin.fields.status')]}
          rows={(list?.special ?? []).map((r) => [
            <Link key="u" to={`/admin/players/${r.uid}`} className="text-gold-100 hover:underline">
              #{r.uid}
            </Link>,
            <span key="n" className="flex flex-wrap items-center gap-2">
              {r.displayName} <span className="text-white/40">@{r.username}</span>
              {r.isTest && <Pill tone="cyan">{t('admin.testTag')}</Pill>}
              {r.accountType !== 'player' && <Pill tone="gold">{r.accountType}</Pill>}
            </span>,
            t(`account.statuses.${r.status}`, { defaultValue: r.status }),
          ])}
        />
      </Panel>
    </>
  );
}

interface DeletionRow {
  id: string;
  uid: number;
  username: string;
  reason: string | null;
  createdAt: string;
}

export function DeletionsPage() {
  const { t, date, fail, done } = useAdminKit();
  const [rows, setRows] = useState<DeletionRow[]>([]);
  const [note, setNote] = useState('');
  const load = () => void adminApi<{ requests: DeletionRow[] }>('/api/admin/deletion-requests').then((r) => setRows(r.requests), fail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);
  const decide = async (id: string, approve: boolean) => {
    try {
      await adminApi(`/api/admin/deletion-requests/${id}/decide`, { method: 'POST', body: { approve, note: note.trim() } });
      done();
      setNote('');
      load();
    } catch (err) {
      fail(err);
    }
  };
  return (
    <>
      <h1 className="font-display text-2xl">{t('admin.deletions')}</h1>
      <Panel>
        {rows.length > 0 && <input className="field" placeholder={t('admin.decisionNote')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />}
        <Table
          head={[t('admin.fields.uid'), t('admin.fields.time'), t('admin.fields.reason'), '']}
          rows={rows.map((r) => [
            <Link key="u" to={`/admin/players/${r.uid}`} className="text-gold-100 hover:underline">
              #{r.uid} @{r.username}
            </Link>,
            date(r.createdAt),
            r.reason ?? '—',
            <span key="a" className="flex gap-2">
              <Button size="sm" variant="ruby" disabled={note.trim().length < 3} onClick={() => void decide(r.id, true)}>
                {t('admin.approve')}
              </Button>
              <Button size="sm" disabled={note.trim().length < 3} onClick={() => void decide(r.id, false)}>
                {t('admin.reject')}
              </Button>
            </span>,
          ])}
        />
      </Panel>
    </>
  );
}

interface MailRow {
  id: number;
  to: string;
  subject: string;
  template: string;
  status: string;
  attempts: number;
  createdAt: string;
  sentAt: string | null;
}

/**
 * Keyo Captain (UID 1000) sign-in status for Owners. The first password is set through a one-time
 * link (Owner + password re-confirmation, 30 minutes). The link is shown once here, never stored.
 */
function CaptainPanel() {
  const { t, date, fail } = useAdminKit();
  const [status, setStatus] = useState<{ passwordSet: boolean; owner: boolean } | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => void adminApi<{ passwordSet: boolean; owner: boolean }>('/api/admin/captain').then(setStatus, fail);
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async () => {
    setBusy(true);
    try {
      const r = await adminApi<{ token: string; expiresAt: string }>('/api/admin/captain/setup-link', { method: 'POST' });
      const base = `${window.location.origin}${window.location.pathname}`;
      setLink({ url: `${base}#/captain-setup?token=${encodeURIComponent(r.token)}`, expiresAt: r.expiresAt });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast(t('captain.email.copied'), 'success');
    } catch {
      toast(t('captain.email.copyFailed'), 'error');
    }
  };
  return (
    <Panel title={t('captain.admin.title')}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-white/65">{t('captain.admin.body')}</p>
        {status && (
          <div className="flex flex-wrap gap-2">
            <Pill tone={status.passwordSet ? 'emerald' : 'muted'}>{status.passwordSet ? t('captain.admin.passwordSet') : t('captain.admin.passwordMissing')}</Pill>
            {status.owner && <Pill tone="emerald">{t('captain.owner')}</Pill>}
          </div>
        )}
        {status && !status.passwordSet && !link && (
          <Button variant="gold" size="sm" disabled={busy} onClick={() => void create()}>
            {t('captain.admin.createLink')}
          </Button>
        )}
        {link && (
          <div className="flex flex-col gap-2 rounded-xl border border-gold-300/30 bg-black/30 p-3">
            <p className="text-xs text-amber-100">{t('captain.admin.linkReady', { time: date(link.expiresAt) })}</p>
            <code className="select-all break-all rounded bg-black/50 p-2 text-[11px] text-white/80">{link.url}</code>
            <Button size="sm" onClick={() => void copy()}>
              {t('captain.admin.copyLink')}
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

export function SystemPage() {
  const { t, date, fail, can } = useAdminKit();
  const [mail, setMail] = useState<MailRow[]>([]);
  useEffect(() => {
    void adminApi<{ mail: MailRow[] }>('/api/admin/outbox?limit=100').then((r) => setMail(r.mail), fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const tone = (s: string) => (s === 'sent' ? 'emerald' : s === 'failed' ? 'ruby' : 'muted');
  return (
    <>
      <h1 className="font-display text-2xl">{t('admin.nav.system')}</h1>
      {can('system.settings') && <CaptainPanel />}
      <Panel title={t('admin.outbox')}>
        <Table
          head={[t('admin.fields.time'), t('admin.fields.email'), t('admin.fields.details'), t('admin.fields.status')]}
          rows={mail.map((m) => [
            date(m.createdAt),
            m.to,
            `${m.template} · ${m.subject}`,
            <span key="s" className="flex items-center gap-2">
              <Pill tone={tone(m.status)}>{t(`admin.mailStatus.${m.status}`, { defaultValue: m.status })}</Pill>
              {m.attempts > 1 && <span className="text-xs text-white/45">×{m.attempts}</span>}
            </span>,
          ])}
        />
      </Panel>
    </>
  );
}
