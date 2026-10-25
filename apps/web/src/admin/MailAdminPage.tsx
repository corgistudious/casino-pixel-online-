import { MAIL_KINDS, type MailAttachment, type MailKind } from '@casino/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi, newIdempotencyKey } from '../net/adminApi';
import { itemName, useCatalog } from '../store/catalog';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';
import { AttachmentEditor } from './AttachmentEditor';
import { Panel, Pill, Table } from './parts';
import { useAdminKit } from './useAdmin';

interface Batch {
  id: string;
  kind: MailKind;
  subject: string;
  attachments: MailAttachment[];
  target: { uids?: number[]; all?: boolean };
  recipients: number;
  claimed: string;
  expiresAt: string | null;
  createdAt: string;
  senderUid: number | null;
  senderName: string | null;
}

export function MailAdminPage() {
  const { t, can, fmt, date, fail } = useAdminKit();
  const { i18n } = useTranslation();
  const catalog = useCatalog((c) => c.items);
  const [all, setAll] = useState(false);
  const [uids, setUids] = useState('');
  const [kind, setKind] = useState<MailKind>('reward');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<MailAttachment[]>([]);
  const [expires, setExpires] = useState('30');
  const [busy, setBusy] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  // One key per composed mail: a retry after a network error cannot send it twice.
  const [key, setKey] = useState(newIdempotencyKey);

  const loadBatches = () => {
    if (can('mail.read')) void adminApi<{ batches: Batch[] }>('/api/admin/mail/batches').then((r) => setBatches(r.batches), fail);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadBatches, []);

  const parsedUids = [...new Set(uids.split(/[\s,;]+/).filter(Boolean).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  const valid = subject.trim().length > 0 && (all || parsedUids.length > 0) && attachments.every((a) => a.type === 'item' || a.amount > 0);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (all && !window.confirm(t('admin.mailAdmin.confirmAll'))) return;
    setBusy(true);
    try {
      const r = await adminApi<{ recipients: number }>('/api/admin/mail', {
        method: 'POST',
        body: {
          target: all ? { all: true } : { uids: parsedUids },
          kind,
          subject: subject.trim(),
          body: body.trim(),
          attachments,
          expiresInDays: expires === '' ? null : Number(expires),
          idempotencyKey: key,
        },
      });
      toast(t('admin.mailAdmin.sent', { count: r.recipients }), 'success');
      setSubject('');
      setBody('');
      setAttachments([]);
      setUids('');
      setKey(newIdempotencyKey());
      loadBatches();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };


  return (
    <>
      <h1 className="font-display text-2xl">{t('admin.mailAdmin.title')}</h1>
      <Panel title={t('admin.mailAdmin.compose')}>
        <form onSubmit={send} className="flex flex-col gap-3">
          <fieldset className="flex flex-wrap items-center gap-4 text-sm">
            <legend className="mb-1 text-xs text-white/55">{t('admin.mailAdmin.target')}</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="target" checked={!all} onChange={() => setAll(false)} className="accent-gold-300" />
              {t('admin.mailAdmin.targetUids')}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="target" checked={all} onChange={() => setAll(true)} className="accent-gold-300" />
              {t('admin.mailAdmin.targetAll')}
            </label>
          </fieldset>
          {!all && <input className="field" placeholder={t('admin.mailAdmin.uids')} value={uids} onChange={(e) => setUids(e.target.value)} aria-label={t('admin.mailAdmin.uids')} />}
          <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
            <select className="field" value={kind} onChange={(e) => setKind(e.target.value as MailKind)} aria-label={t('admin.mailAdmin.kind')}>
              {MAIL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`mail.kinds.${k}`)}
                </option>
              ))}
            </select>
            <input className="field" placeholder={t('admin.mailAdmin.subject')} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} required aria-label={t('admin.mailAdmin.subject')} />
          </div>
          <textarea className="field min-h-28" placeholder={t('admin.mailAdmin.body')} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} aria-label={t('admin.mailAdmin.body')} />
          <AttachmentEditor value={attachments} onChange={setAttachments} />
          <label className="flex max-w-xs flex-col gap-1 text-xs text-white/55">
            {t('admin.mailAdmin.expires')}
            <input className="field" inputMode="numeric" value={expires} onChange={(e) => setExpires(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          </label>
          <Button type="submit" variant="gold" disabled={busy || !valid}>
            {t('admin.mailAdmin.send')}
          </Button>
        </form>
      </Panel>
      {can('mail.read') && (
        <Panel title={t('admin.mailAdmin.history')}>
          <Table
            head={[t('admin.fields.time'), t('admin.mailAdmin.subject'), t('admin.mailAdmin.attachments'), t('admin.mailAdmin.recipients'), t('admin.mailAdmin.claimed'), t('admin.fields.actor')]}
            rows={batches.map((b) => [
              date(b.createdAt),
              <span key="s" className="flex flex-col">
                <span>{b.subject}</span>
                <span className="text-[11px] text-white/45">{t(`mail.kinds.${b.kind}`)} · {b.target.all ? t('admin.mailAdmin.targetAll') : b.target.uids?.join(', ')}</span>
              </span>,
              <span key="a" className="flex flex-wrap gap-1">
                {b.attachments.length === 0
                  ? '—'
                  : b.attachments.map((a, i) => <Pill key={i}>{a.type === 'item' ? itemName(catalog[a.itemId], i18n.language, a.itemId) : `${fmt(a.amount)} ${t(`currency.${a.type}`)}`}</Pill>)}
              </span>,
              fmt(b.recipients),
              fmt(Number(b.claimed)),
              b.senderUid ? `#${b.senderUid} ${b.senderName}` : '—',
            ])}
          />
        </Panel>
      )}
    </>
  );
}
