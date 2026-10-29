import { useEffect, useState, type FormEvent } from 'react';
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

export function UidsPage() {
  const { t, fail, done } = useAdminKit();
  const [list, setList] = useState<{ special: SpecialRow[]; nextPlayerUid: number } | null>(null);
  const empty = { uid: '', username: '', displayName: '', email: '', isTest: false };
  const [form, setForm] = useState(empty);
  const load = () => void adminApi<{ special: SpecialRow[]; nextPlayerUid: number }>('/api/admin/uids/special').then(setList, fail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await adminApi('/api/admin/accounts', { method: 'POST', body: { ...form, uid: Number(form.uid) } });
      done();
      setForm(empty);
      load();
    } catch (err) {
      fail(err);
    }
  };
  return (
    <>
      <h1 className="font-display text-2xl">{t('admin.special')}</h1>
      <Panel title={t('admin.createSpecial')}>
        <form onSubmit={submit} className="grid gap-2 sm:grid-cols-2">
          <p className="text-xs text-white/50 sm:col-span-2">{t('admin.createSpecialHint')}</p>
          <input className="field" placeholder="UID" inputMode="numeric" required value={form.uid} onChange={(e) => setForm({ ...form, uid: e.target.value.replace(/\D/g, '') })} />
          <input className="field" placeholder={t('auth.username')} required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="field" placeholder={t('auth.displayName')} required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          <input className="field" type="email" placeholder={t('auth.email')} required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <label className="flex items-center gap-2 text-xs text-white/70 sm:col-span-2">
            <input type="checkbox" className="accent-gold-300" checked={form.isTest} onChange={(e) => setForm({ ...form, isTest: e.target.checked })} />
            {t('admin.markTest')}
          </label>
          <Button type="submit" variant="gold" className="sm:col-span-2">
            {t('admin.createSpecial')}
          </Button>
        </form>
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
