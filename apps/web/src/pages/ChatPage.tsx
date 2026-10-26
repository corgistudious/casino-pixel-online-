import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../net/api';
import { AppShell, PageHeader } from '../ui/AppShell';
import { toast } from '../ui/toast';
import { useSession } from '../store/session';

type Message = { id: number; uid: number; display_name: string; bubble: string | null; title: string | null; body: string; created_at: string };
export function ChatPage() {
  const { i18n } = useTranslation(); const vi = i18n.language.startsWith('vi');
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => { const r = await api<{messages:Message[]}>('/api/chat'); setMessages(r.messages); };
  useEffect(() => {
    void refresh().catch(() => {});
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh().catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  }, []);
  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try { await api('/api/chat', { method:'POST', body: { body } }); setBody(''); await refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); }
    finally { setBusy(false); }
  };
  const canModerate = useSession(s => s.user?.permissions.includes('chat.moderate') ?? false);
  const remove = async (id:number) => {
    try { await api(`/api/admin/chat/${id}`, { method:'DELETE' }); await refresh(); }
    catch(e) { toast(e instanceof Error ? e.message : 'Error', 'error'); }
  };
  return <AppShell><div className="flex h-full flex-col gap-3 p-4">
    <PageHeader icon="friends" title={vi ? 'Chat cộng đồng' : 'Community Chat'} subtitle={vi ? 'Trò chuyện cùng người chơi Keyo' : 'Chat with Keyo players'} />
    <div className="glass min-h-0 flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite">
      {messages.map(m => <div key={m.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center justify-between gap-2"><div className="text-sm font-bold text-amber-300">{m.display_name} <span className="text-xs font-normal text-white/40">UID {m.uid} {m.title ?? ''}</span></div>
        <time className="text-xs text-white/40">{new Date(m.created_at).toLocaleTimeString()}</time></div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{m.body}</p>
        {canModerate && <button className="mt-2 text-xs text-red-300" onClick={() => void remove(m.id)}>{vi ? 'Xóa tin' : 'Remove'}</button>}
      </div>)}
    </div>
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void send(); }}>
      <input className="field flex-1" maxLength={500} value={body} onChange={e => setBody(e.target.value)} placeholder={vi ? 'Nhập tin nhắn...' : 'Type a message...'} />
      <button className="rounded-xl bg-amber-500 px-5 font-bold text-black disabled:opacity-40" disabled={busy || !body.trim()}>{vi ? 'Gửi' : 'Send'}</button>
    </form>
  </div></AppShell>;
}
