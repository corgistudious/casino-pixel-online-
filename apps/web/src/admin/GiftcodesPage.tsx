import type { MailAttachment } from '@casino/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { adminApi } from '../net/adminApi';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';
import { AttachmentEditor, AttachmentPills } from './AttachmentEditor';
import { Panel, Pill, Stat, Table } from './parts';
import { useAdminKit } from './useAdmin';

interface Giftcode {
  id: string;
  code: string;
  campaign: string;
  attachments: MailAttachment[];
  startsAt: string;
  endsAt: string | null;
  maxUses: number | null;
  perUserLimit: number;
  uses: number;
  enabled: boolean;
  createdAt: string;
}

/** Gift codes (Owner / Super Admin): create manual, random or batches; enable/disable; export a campaign. */
export function GiftcodesPage() {
  const { t, fmt, date, fail } = useAdminKit();
  const [codes, setCodes] = useState<Giftcode[]>([]);
  const [stats, setStats] = useState<{ codes: number; active: number; uses: number } | null>(null);
  const [campaign, setCampaign] = useState('');
  const [mode, setMode] = useState<'manual' | 'random' | 'batch'>('manual');
  const [code, setCode] = useState('');
  const [count, setCount] = useState('10');
  const [attachments, setAttachments] = useState<MailAttachment[]>([]);
  const [endsAt, setEndsAt] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [perUser, setPerUser] = useState('1');
  const [created, setCreated] = useState<string[]>([]);

  const load = () =>
    void adminApi<{ giftcodes: Giftcode[]; stats: typeof stats }>('/api/admin/giftcodes').then((r) => {
      setCodes(r.giftcodes);
      setStats(r.stats);
    }, fail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await adminApi<{ created: number; codes: string[] }>('/api/admin/giftcodes', {
        method: 'POST',
        body: {
          campaign: campaign.trim(),
          attachments,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          maxUses: maxUses ? Number(maxUses) : null,
          perUserLimit: Number(perUser) || 1,
          ...(mode === 'manual' ? { code } : { count: mode === 'random' ? 1 : Number(count) }),
        },
      });
      setCreated(r.codes);
      toast(t('admin.done'), 'success');
      setCode('');
      load();
    } catch (err) {
      fail(err);
    }
  };

  const toggle = async (g: Giftcode) => {
    try {
      await adminApi('/api/admin/giftcodes', { method: 'PATCH', body: { ids: [g.id], enabled: !g.enabled } });
      load();
    } catch (err) {
      fail(err);
    }
  };

  const exportCampaign = async (name: string) => {
    try {
      const r = await adminApi<{ filename: string; csv: string }>(`/api/admin/giftcodes/export?campaign=${encodeURIComponent(name)}`);
      const url = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      fail(err);
    }
  };

  const valid = campaign.trim().length >= 2 && attachments.length > 0 && attachments.every((a) => a.type === 'item' || a.amount > 0) && (mode !== 'manual' || code.trim().length >= 4);
  const campaigns = [...new Set(codes.map((c) => c.campaign))];

  return (
    <>
      <h1 className="font-display text-2xl font-extrabold">{t('admin.nav.giftcodes')}</h1>
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t('admin.giftcodes.codes')} value={fmt(stats.codes)} />
          <Stat label={t('progressionAdmin.status.active')} value={fmt(stats.active)} />
          <Stat label={t('admin.giftcodes.uses')} value={fmt(stats.uses)} />
        </div>
      )}
      <Panel title={t('admin.giftcodes.create')}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-4 text-sm font-semibold">
            {(['manual', 'random', 'batch'] as const).map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} className="accent-gold-300" />
                {t(`admin.giftcodes.mode.${m}`)}
              </label>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="field" placeholder={t('admin.giftcodes.campaign')} value={campaign} onChange={(e) => setCampaign(e.target.value)} maxLength={60} required aria-label={t('admin.giftcodes.campaign')} />
            {mode === 'manual' && <input className="field font-bold uppercase tracking-widest" placeholder="KEYO2026" value={code} onChange={(e) => setCode(e.target.value)} maxLength={32} aria-label="Code" />}
            {mode === 'batch' && <input className="field" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label={t('admin.giftcodes.count')} placeholder={t('admin.giftcodes.count')} />}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-white/60">
              {t('progressionAdmin.endsAt')}
              <input className="field" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-white/60">
              {t('admin.giftcodes.maxUses')}
              <input className="field" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ''))} placeholder="∞" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-white/60">
              {t('admin.giftcodes.perUser')}
              <input className="field" inputMode="numeric" value={perUser} onChange={(e) => setPerUser(e.target.value.replace(/\D/g, '').slice(0, 3))} />
            </label>
          </div>
          <AttachmentEditor value={attachments} onChange={setAttachments} />
          <Button type="submit" variant="gold" disabled={!valid}>
            {t('admin.giftcodes.create')}
          </Button>
          {created.length > 0 && (
            <div className="rounded-xl border border-gold-300/40 bg-black/30 p-3">
              <div className="mb-1 text-xs font-semibold text-white/60">{t('admin.giftcodes.created', { count: created.length })}</div>
              <code className="block max-h-40 overflow-auto whitespace-pre-wrap break-all text-sm font-bold tracking-widest text-gold-100">{created.join('\n')}</code>
            </div>
          )}
        </form>
      </Panel>
      <Panel
        title={t('admin.giftcodes.list')}
        actions={
          <span className="flex flex-wrap gap-1">
            {campaigns.slice(0, 6).map((c) => (
              <Button key={c} size="sm" onClick={() => void exportCampaign(c)}>
                CSV · {c}
              </Button>
            ))}
          </span>
        }
      >
        <Table
          head={['Code', t('admin.giftcodes.campaign'), t('progressionAdmin.attachments'), t('admin.giftcodes.uses'), t('progressionAdmin.endsAt'), t('admin.fields.status'), '']}
          rows={codes.map((g) => [
            <code key="c" className="font-bold tracking-widest text-gold-100">
              {g.code}
            </code>,
            g.campaign,
            <AttachmentPills key="a" value={g.attachments} />,
            `${fmt(g.uses)} / ${g.maxUses === null ? '∞' : fmt(g.maxUses)} · ${g.perUserLimit}/UID`,
            date(g.endsAt),
            <Pill key="s" tone={g.enabled ? 'emerald' : 'muted'}>
              {g.enabled ? t('admin.giftcodes.enabled') : t('admin.giftcodes.disabled')}
            </Pill>,
            <Button key="t" size="sm" onClick={() => void toggle(g)}>
              {g.enabled ? t('admin.giftcodes.disable') : t('admin.giftcodes.enable')}
            </Button>,
          ])}
        />
      </Panel>
    </>
  );
}
