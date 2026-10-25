import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../net/api';
import { AppShell, PageHeader } from '../ui/AppShell';
import { toast } from '../ui/toast';

type Ticket = { id: string; category: string; subject: string; status: string; created_at: string };
type Message = { id: string; author_id: string; body: string; created_at: string };
const CATEGORIES = ['account', 'game', 'payment', 'report', 'other'] as const;

export function SupportPage() {
  const { i18n } = useTranslation();
  const vi = i18n.language.startsWith('vi');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('game');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const data = await api<{ tickets: Ticket[] }>('/api/support/tickets');
    setTickets(data.tickets);
  };
  useEffect(() => { void load().catch(() => {}); }, []);
  const open = async (ticket: Ticket) => {
    setSelected(ticket);
    try { const data = await api<{ messages: Message[] }>(`/api/support/tickets/${ticket.id}`); setMessages(data.messages); }
    catch (err) { toast(err instanceof Error ? err.message : 'Error', 'error'); }
  };
  const create = async () => {
    setBusy(true);
    try {
      await api('/api/support/tickets', { method: 'POST', body: { category, subject, message: body } });
      setSubject(''); setBody(''); await load();
      toast(vi ? 'Đã gửi yêu cầu' : 'Ticket submitted', 'success');
    } catch (err) { toast(err instanceof Error ? err.message : 'Error', 'error'); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/api/support/tickets/${selected.id}/replies`, { method: 'POST', body: { message: reply } });
      setReply(''); await open(selected);
    } catch (err) { toast(err instanceof Error ? err.message : 'Error', 'error'); }
    finally { setBusy(false); }
  };
  return <AppShell><div className="flex flex-col gap-4 p-4">
    <PageHeader icon="settings" title={vi ? 'Trung tâm hỗ trợ' : 'Support Hub'} subtitle={vi ? 'Gửi yêu cầu đến Keyo Support (UID 1000)' : 'Contact Keyo Support (UID 1000)'} />
    <section className="glass flex max-w-2xl flex-col gap-3 p-4">
      <h2 className="font-bold">{vi ? 'Tạo yêu cầu mới' : 'New ticket'}</h2>
      <select className="field" value={category} onChange={e => setCategory(e.target.value as typeof category)}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
      <input className="field" maxLength={140} value={subject} onChange={e => setSubject(e.target.value)} placeholder={vi ? 'Tiêu đề' : 'Subject'} />
      <textarea className="field min-h-24" maxLength={4000} value={body} onChange={e => setBody(e.target.value)} placeholder={vi ? 'Mô tả vấn đề' : 'Describe your issue'} />
      <button className="rounded-xl bg-amber-500 p-3 font-bold text-black disabled:opacity-40" disabled={busy || subject.trim().length < 4 || !body.trim()} onClick={() => void create()}>{vi ? 'Gửi hỗ trợ' : 'Submit ticket'}</button>
    </section>
    <section className="glass p-4"><h2 className="mb-2 font-bold">{vi ? 'Yêu cầu của tôi' : 'My tickets'}</h2>
      {tickets.map(ticket => <button key={ticket.id} onClick={() => void open(ticket)} className="flex w-full justify-between border-b border-white/10 py-3 text-left text-sm"><span>{ticket.subject}</span><span className="text-white/50">{ticket.status}</span></button>)}
    </section>
    {selected && <section className="glass flex flex-col gap-3 p-4"><h2 className="font-bold">{selected.subject}</h2>
      {messages.map(m => <div key={m.id} className="rounded-lg bg-white/5 p-3 text-sm"><p className="whitespace-pre-wrap">{m.body}</p><time className="text-xs text-white/40">{new Date(m.created_at).toLocaleString()}</time></div>)}
      {selected.status !== 'closed' && <><textarea className="field min-h-20" value={reply} maxLength={4000} onChange={e => setReply(e.target.value)} placeholder={vi ? 'Trả lời' : 'Reply'} /><button className="rounded-xl bg-amber-500 p-3 font-bold text-black disabled:opacity-40" disabled={busy || !reply.trim()} onClick={() => void send()}>{vi ? 'Gửi trả lời' : 'Send reply'}</button></>}
    </section>}
  </div></AppShell>;
}
