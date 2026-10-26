import { SUPPORT_CATEGORIES, type SupportCategory, type SupportTicketView } from '@casino/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../net/api';
import { socket } from '../net/socket';
import { useFail } from '../social/parts';
import { AppShell } from '../ui/AppShell';
import { Button } from '../ui/Button';
import { NavIcon } from '../ui/NavIcons';
import { toast } from '../ui/toast';
import { StatusPill, TicketThread } from './TicketThread';

const CATEGORY_ICON: Record<SupportCategory, string> = { account: '🔐', game: '🎮', payment: '🪙', report: '🚩', other: '💬' };

/** Customer-care desk: new request form, ticket list with unread replies, conversation view. */
export function SupportPage() {
  const { t, i18n } = useTranslation();
  const fail = useFail();
  const [tickets, setTickets] = useState<SupportTicketView[] | null>(null);
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const load = () => void api<{ tickets: SupportTicketView[] }>('/api/support/tickets').then((r) => setTickets(r.tickets), fail);
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () =>
      socket.listen((ev) => {
        if (ev.event !== 'support') return;
        load();
        toast(t('supportCenter.newReply'), 'info');
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    if (open === null && tickets && tickets.length === 0) setOpen('new');
  }, [tickets, open]);

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col gap-4 p-3 lg:p-5">
        <section className="relative overflow-hidden rounded-3xl border border-sky-300/25 bg-gradient-to-r from-[#0b2f55] via-[#102341] to-[#151a2e] p-5 shadow-panel">
          <div className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-sky-400/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-300/40 bg-black/30">
              <NavIcon name="support" size={30} active />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-3xl font-heading text-white">{t('supportCenter.title')}</h1>
              <p className="text-sm text-sky-100/70">{t('supportCenter.subtitle')}</p>
            </div>
            <Button variant="gold" onClick={() => setOpen('new')}>
              + {t('supportCenter.newTicket')}
            </Button>
          </div>
          <p className="relative mt-3 rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">🛡️ {t('supportCenter.safety')}</p>
        </section>

        <div className="grid min-h-[480px] flex-1 grid-rows-[minmax(0,1fr)] gap-4 lg:grid-cols-[340px_1fr]">
          <aside className={`glass flex min-h-0 flex-col ${open ? 'hidden lg:flex' : 'flex'}`}>
            <h2 className="border-b border-white/10 px-4 py-3 font-display text-lg font-heading">{t('supportCenter.myTickets')}</h2>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {tickets?.length === 0 && <li className="p-4 text-sm text-white/45">{t('supportCenter.noTickets')}</li>}
              {tickets?.map((tk) => (
                <li key={tk.id}>
                  <button type="button" onClick={() => setOpen(tk.id)} className={`flex w-full flex-col gap-1 border-b border-white/5 px-4 py-3 text-left transition ${open === tk.id ? 'bg-sky-400/10' : 'hover:bg-white/5'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate ${tk.unread ? 'font-heading text-white' : 'font-label text-white/85'}`}>
                        {CATEGORY_ICON[tk.category]} {tk.subject}
                      </span>
                      {tk.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ruby-500 shadow-[0_0_8px_rgba(212,42,68,0.9)]" aria-label={t('supportCenter.newReply')} />}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <StatusPill status={tk.status} />
                      <time className="text-[10px] text-white/40">{new Date(tk.updatedAt).toLocaleString(i18n.language)}</time>
                    </div>
                    {tk.lastMessage && <p className="truncate text-xs text-white/45">{tk.lastMessage}</p>}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <section className={`glass min-h-0 overflow-hidden ${open ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'}`}>
            {open && (
              <button type="button" className="border-b border-white/10 px-4 py-2 text-left text-xs text-white/60 lg:hidden" onClick={() => setOpen(null)}>
                ← {t('supportCenter.back')}
              </button>
            )}
            {open === 'new' ? (
              <NewTicket
                onCreated={(id) => {
                  load();
                  setOpen(id);
                }}
              />
            ) : open ? (
              <TicketThread key={open} id={open} onChanged={load} />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-white/45">{t('supportCenter.myTickets')}</div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function NewTicket({ onCreated }: { onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const fail = useFail();
  const [category, setCategory] = useState<SupportCategory>('account');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ id: string }>('/api/support/tickets', { method: 'POST', body: { category, subject: subject.trim(), message: message.trim() } });
      toast(t('supportCenter.created'), 'success');
      onCreated(r.id);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 [&>*]:shrink-0">
      <h2 className="font-display text-xl font-heading">{t('supportCenter.newTicket')}</h2>
      <fieldset>
        <legend className="mb-2 text-xs text-white/55">{t('supportCenter.category')}</legend>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {SUPPORT_CATEGORIES.map((c) => (
            <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c} className={`rounded-xl border px-3 py-3 text-left text-sm transition ${category === c ? 'border-sky-300/70 bg-sky-500/15 text-white' : 'border-white/10 bg-black/20 text-white/65 hover:text-white'}`}>
              <span className="mr-1.5" aria-hidden>
                {CATEGORY_ICON[c]}
              </span>
              {t(`supportCenter.categories.${c}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5 text-xs text-white/55">
        {t('supportCenter.subject')}
        <input className="field" required minLength={4} maxLength={140} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('supportCenter.subjectHint')} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs text-white/55">
        {t('supportCenter.message')}
        <textarea className="field min-h-36" required minLength={10} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('supportCenter.messageHint')} />
      </label>
      <Button type="submit" variant="gold" disabled={busy || subject.trim().length < 4 || message.trim().length < 10}>
        {t('supportCenter.submit')}
      </Button>
    </form>
  );
}
