import { SUPPORT_CATEGORIES, type SupportCategory, type SupportTicketView } from '@casino/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api } from '../net/api';
import { socket } from '../net/socket';
import { useFail } from '../social/parts';
import { AppShell } from '../ui/AppShell';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';
import { CaptainAvatar, CaptainBadges, CONTACT_TOPICS, FaqList, GuideItem, OfficialContact, openSupportMenu, type GuideTopic } from './SupportMenu';
import { StatusPill, TicketThread } from './TicketThread';

const CATEGORY_ICON: Record<SupportCategory, string> = { account: '🔐', game: '🎮', payment: '🪙', report: '🚩', other: '💬' };
type Tab = 'overview' | 'new' | 'mine' | 'guides';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'supportCenter.tabs.overview' },
  { id: 'new', label: 'supportCenter.tabs.create' },
  { id: 'mine', label: 'supportCenter.tabs.mine' },
  { id: 'guides', label: 'supportCenter.tabs.guides' },
];
const GUIDE_GROUPS: { id: string; topics: GuideTopic[] }[] = [
  { id: 'account', topics: ['createAccount', 'changePassword', 'forgotPassword'] },
  { id: 'security', topics: ['security'] },
  { id: 'email', topics: ['verifyEmail'] },
  { id: 'cxu', topics: ['currency'] },
  { id: 'vip', topics: ['vip', 'rankLevel'] },
  { id: 'games', topics: ['gettingStarted', 'games'] },
  { id: 'friends', topics: ['friends'] },
  { id: 'gifts', topics: ['gifts'] },
  { id: 'reporting', topics: ['reporting'] },
];
const shortId = (id: string) => id.slice(0, 8).toUpperCase();
const newRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/**
 * Support Center: overview (Keyo Captain, quick actions, FAQ, official contact), new request,
 * my requests (list + conversation) and guides. The page grows naturally inside the scrolling
 * <main> — nothing is squeezed to fit the viewport, so short landscape phones simply scroll.
 * Only the conversation view has its own scroll area, sized to the viewport.
 */
export function SupportPage() {
  const { t } = useTranslation();
  const fail = useFail();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((x) => x.id === params.get('tab')) ? (params.get('tab') as Tab) : 'overview';
  const openId = params.get('ticket');
  const [tickets, setTickets] = useState<SupportTicketView[] | null>(null);
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
  const go = (next: Tab, extra: Record<string, string> = {}) => setParams({ tab: next, ...extra }, { replace: false });
  const unread = tickets?.filter((x) => x.unread).length ?? 0;

  return (
    <AppShell>
      <div className="flex min-h-full flex-col gap-3 p-3 lg:gap-4 lg:p-5 short:gap-2 short:p-2">
        <section className="relative shrink-0 overflow-hidden rounded-3xl border border-gold-300/35 bg-gradient-to-r from-[#2a1150] via-[#170c2e] to-[#07050d] p-4 shadow-panel lg:p-5 short:rounded-2xl short:p-2.5">
          <div className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-3 short:flex-nowrap">
            <CaptainAvatar size={52} />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-heading text-gold-100 lg:text-3xl short:truncate short:text-lg">{t('supportCenter.title')}</h1>
              <p className="text-sm text-white/65 short:hidden">{t('supportCenter.subtitle')}</p>
            </div>
            <Button variant="gold" size="sm" onClick={() => go('new')}>
              + {t('supportCenter.newTicket')}
            </Button>
          </div>
          <p className="relative mt-3 rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 short:hidden">🛡️ {t('supportCenter.safety')}</p>
        </section>

        <nav className="flex shrink-0 gap-1 overflow-x-auto rounded-2xl border border-gold-300/20 bg-black/40 p-1" role="tablist" aria-label={t('supportCenter.title')}>
          {TABS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              onClick={() => go(x.id)}
              className={`relative flex min-w-max flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-label transition short:py-1.5 ${
                tab === x.id ? 'bg-gradient-to-r from-gold-300 to-gold-500 text-ink-900 shadow-button' : 'text-white/65 hover:bg-white/5 hover:text-white'
              }`}
            >
              {t(x.label)}
              {x.id === 'mine' && unread > 0 && <span className="min-w-[18px] rounded-full bg-ruby-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{unread}</span>}
            </button>
          ))}
        </nav>

        {tab === 'overview' && <Overview onGo={go} tickets={tickets} />}
        {tab === 'new' && (
          <section className="glass">
            <NewTicket
              key={`${params.get('category')}:${params.get('topic')}`}
              initialCategory={SUPPORT_CATEGORIES.includes(params.get('category') as SupportCategory) ? (params.get('category') as SupportCategory) : 'account'}
              topic={CONTACT_TOPICS.some((c) => c.id === params.get('topic') && c.category) ? params.get('topic') : null}
              onCreated={(id) => {
                load();
                go('mine', { ticket: id });
              }}
            />
          </section>
        )}
        {tab === 'mine' && <MyRequests tickets={tickets} openId={openId} onOpen={(id) => go('mine', id ? { ticket: id } : {})} onNew={() => go('new')} onChanged={load} />}
        {tab === 'guides' && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {GUIDE_GROUPS.map((g) => (
              <section key={g.id} className="glass flex flex-col gap-2 p-3">
                <h2 className="font-display text-base font-heading text-gold-100">{t(`supportCenter.guideGroups.${g.id}`)}</h2>
                {g.topics.map((topic) => (
                  <GuideItem key={topic} topic={topic} />
                ))}
              </section>
            ))}
            <section className="glass flex flex-col gap-2 p-3">
              <h2 className="font-display text-base font-heading text-gold-100">{t('supportCenter.quick.faq')}</h2>
              <FaqList />
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Overview({ onGo, tickets }: { onGo: (tab: Tab, extra?: Record<string, string>) => void; tickets: SupportTicketView[] | null }) {
  const { t } = useTranslation();
  const quick: { id: string; icon: string; onClick: () => void }[] = [
    { id: 'guides', icon: '📘', onClick: () => onGo('guides') },
    { id: 'faq', icon: '💡', onClick: () => document.getElementById('support-faq')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
    { id: 'create', icon: '📝', onClick: () => onGo('new') },
    { id: 'mine', icon: '📂', onClick: () => onGo('mine') },
    { id: 'contact', icon: '✉️', onClick: () => document.getElementById('support-contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="flex min-w-0 flex-col gap-3">
        <section className="glass flex flex-col gap-3 p-4 short:p-3">
          <div className="flex items-center gap-3">
            <CaptainAvatar size={56} />
            <div className="min-w-0">
              <div className="font-display text-xl font-heading text-white">{t('captain.name')}</div>
              <CaptainBadges />
            </div>
          </div>
          <p className="rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white/85">{t('captain.greeting')}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 short:grid-cols-5">
            {quick.map((q) => (
              <button key={q.id} type="button" onClick={q.onClick} className="flex flex-col items-center gap-1 rounded-xl border border-gold-300/25 bg-gradient-to-b from-violet-900/40 to-black/40 px-2 py-3 text-center transition hover:border-gold-300/60 short:py-2">
                <span className="text-xl" aria-hidden>
                  {q.icon}
                </span>
                <span className="text-xs font-label text-white/85">{t(`supportCenter.quick.${q.id}`)}</span>
                {q.id === 'mine' && tickets && <span className="text-[10px] text-white/45">{tickets.length}</span>}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => openSupportMenu('beginner')}>
            {t('captain.menu.beginner')}
          </Button>
        </section>
        <section id="support-faq" className="glass flex scroll-mt-3 flex-col gap-2 p-3">
          <h2 className="font-display text-base font-heading text-gold-100">{t('supportCenter.quick.faq')}</h2>
          <FaqList />
        </section>
      </div>
      <section id="support-contact" className="scroll-mt-3">
        <OfficialContact onOpenCenter={() => onGo('new')} />
      </section>
    </div>
  );
}

function MyRequests({ tickets, openId, onOpen, onNew, onChanged }: { tickets: SupportTicketView[] | null; openId: string | null; onOpen: (id: string | null) => void; onNew: () => void; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="grid gap-3 lg:h-[clamp(26rem,calc(100dvh-16rem),48rem)] lg:grid-cols-[20rem_minmax(0,1fr)] short:h-auto short:grid-cols-1">
      <aside className={`glass flex min-h-0 flex-col ${openId ? 'hidden lg:flex short:hidden' : 'flex'}`}>
        <h2 className="border-b border-white/10 px-4 py-3 font-display text-lg font-heading">{t('supportCenter.myTickets')}</h2>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {!tickets && <li className="p-4 text-sm text-white/45">{t('app.loading')}</li>}
          {tickets?.length === 0 && (
            <li className="flex flex-col items-start gap-2 p-4 text-sm text-white/55">
              {t('supportCenter.noTickets')}
              <Button size="sm" variant="gold" onClick={onNew}>
                + {t('supportCenter.newTicket')}
              </Button>
            </li>
          )}
          {tickets?.map((tk) => (
            <li key={tk.id}>
              <button type="button" onClick={() => onOpen(tk.id)} className={`flex w-full flex-col gap-1 border-b border-white/5 px-4 py-3 text-left transition ${openId === tk.id ? 'bg-gold-300/10' : 'hover:bg-white/5'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate ${tk.unread ? 'font-heading text-white' : 'font-label text-white/85'}`}>
                    {CATEGORY_ICON[tk.category]} {tk.subject}
                  </span>
                  {tk.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ruby-500 shadow-[0_0_8px_rgba(212,42,68,0.9)]" aria-label={t('supportCenter.newReply')} />}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <StatusPill status={tk.status} />
                    <span className="font-mono text-[10px] text-white/40">#{shortId(tk.id)}</span>
                  </span>
                  <span className="text-[10px] text-white/40">
                    {t('supportCenter.created_at')} {new Date(tk.createdAt).toLocaleDateString(i18n.language)} · {t('supportCenter.updated_at')} {new Date(tk.updatedAt).toLocaleString(i18n.language)}
                  </span>
                </div>
                {tk.lastMessage && <p className="truncate text-xs text-white/45">{tk.lastMessage}</p>}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section
        className={`glass min-h-0 overflow-hidden ${openId ? 'flex h-[min(78dvh,40rem)] min-h-[18rem] flex-col lg:h-auto short:h-[calc(100dvh-4.5rem)] short:min-h-[15rem]' : 'hidden lg:flex lg:flex-col short:hidden'}`}
      >
        {openId && (
          <button type="button" className="shrink-0 border-b border-white/10 px-4 py-2 text-left text-xs text-white/60 lg:hidden short:block" onClick={() => onOpen(null)}>
            ← {t('supportCenter.back')} · #{shortId(openId)}
          </button>
        )}
        {openId ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <TicketThread key={openId} id={openId} onChanged={onChanged} />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-white/45">{t('supportCenter.myTickets')}</div>
        )}
      </section>
    </div>
  );
}

function NewTicket({ initialCategory, topic, onCreated }: { initialCategory: SupportCategory; topic: string | null; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const fail = useFail();
  const [category, setCategory] = useState<SupportCategory>(initialCategory);
  const [subject, setSubject] = useState(() => (topic ? `${t(`captain.contact.${topic}.title`)}: ` : ''));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  // One key per form: a retry (double tap, flaky network) returns the same ticket, never a copy.
  // The form unmounts after success, so the next request gets a new key.
  const requestId = useRef(newRequestId());
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const r = await api<{ id: string }>('/api/support/tickets', { method: 'POST', body: { category, subject: subject.trim(), message: message.trim(), requestId: requestId.current } });
      toast(t('supportCenter.createdWithId', { id: shortId(r.id) }), 'success');
      onCreated(r.id);
    } catch (err) {
      fail(err);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-4 lg:p-5 short:gap-3 short:p-3">
      <h2 className="font-display text-xl font-heading">{t('supportCenter.newTicket')}</h2>
      <fieldset>
        <legend className="mb-2 text-xs text-white/55">{t('supportCenter.category')}</legend>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 short:grid-cols-5">
          {SUPPORT_CATEGORIES.map((c) => (
            <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c} className={`rounded-xl border px-3 py-2.5 text-left text-sm transition short:px-2 short:py-1.5 short:text-xs ${category === c ? 'border-gold-300/70 bg-gold-300/15 text-white' : 'border-white/10 bg-black/20 text-white/65 hover:text-white'}`}>
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
        <textarea className="field min-h-32 short:min-h-24" required minLength={10} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('supportCenter.messageHint')} />
      </label>
      <Button type="submit" variant="gold" disabled={busy || subject.trim().length < 4 || message.trim().length < 10}>
        {t('supportCenter.submit')}
      </Button>
    </form>
  );
}
