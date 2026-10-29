import { SUPPORT_REOPEN_DAYS, type SupportMessageView, type SupportTicketView } from '@casino/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../net/api';
import { socket } from '../net/socket';
import { useFail } from '../social/parts';
import { Button } from '../ui/Button';
import { KeyoLogo } from '../ui/KeyoLogo';

export const STATUS_TONE: Record<string, string> = {
  open: 'bg-amber-400/15 text-amber-200 ring-amber-300/30',
  in_progress: 'bg-sky-400/15 text-sky-200 ring-sky-300/30',
  closed: 'bg-white/10 text-white/55 ring-white/15',
};

export function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-label ring-1 ${STATUS_TONE[status] ?? ''}`}>{t(`supportCenter.status.${status}`)}</span>;
}

/**
 * One ticket's conversation, shared by the player page and the staff queue. Support replies are
 * styled as an official desk (logo, left side); the player's messages are on the right.
 */
export function TicketThread({ id, onChanged }: { id: string; onChanged?: () => void }) {
  const { t, i18n } = useTranslation();
  const fail = useFail();
  const [data, setData] = useState<{ ticket: SupportTicketView; messages: SupportMessageView[]; staff: boolean } | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const load = () => void api<{ ticket: SupportTicketView; messages: SupportMessageView[]; staff: boolean }>(`/api/support/tickets/${id}`).then(setData, fail);
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => socket.listen((ev) => ev.event === 'support' && ev.data.ticketId === id && load()), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [data?.messages.length]);

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    try {
      await api(path, { method: 'POST', body });
      load();
      onChanged?.();
      return true;
    } catch (err) {
      fail(err);
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!data) return <p className="p-4 text-sm text-white/50">{t('app.loading')}</p>;
  const { ticket, messages, staff } = data;
  const closed = ticket.status === 'closed';
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusPill status={ticket.status} />
            <span className="text-[11px] text-white/45">{t(`supportCenter.categories.${ticket.category}`)}</span>
          </div>
          <h2 className="mt-1 truncate font-strong text-white">{ticket.subject}</h2>
        </div>
        {closed ? (
          <Button size="sm" disabled={busy} onClick={() => void act(`/api/support/tickets/${id}/reopen`)}>
            {t('supportCenter.reopen')}
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => window.confirm(t('supportCenter.confirmClose')) && void act(`/api/support/tickets/${id}/close`)}>
            {t('supportCenter.close')}
          </Button>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" role="log">
        {messages.map((m) => {
          const own = staff ? m.fromStaff : !m.fromStaff;
          return (
            <div key={m.id} className={`flex gap-2 ${own ? 'flex-row-reverse' : ''}`}>
              {m.fromStaff && (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-300/40 bg-sky-900/60">
                  <KeyoLogo size={20} />
                </div>
              )}
              <div className={`max-w-[80%] ${own ? 'items-end text-right' : ''} flex flex-col`}>
                <span className={`mb-0.5 text-[11px] font-label ${m.fromStaff ? 'text-sky-200' : 'text-white/60'}`}>{m.fromStaff ? m.author : staff ? m.author : t('supportCenter.you')}</span>
                <div className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-left text-sm ${m.fromStaff ? 'rounded-tl-md border border-sky-300/25 bg-gradient-to-br from-sky-900/70 to-indigo-900/60 text-white' : 'rounded-tr-md bg-white/10 text-white'}`}>{m.body}</div>
                <time className="mt-0.5 text-[10px] text-white/35">{new Date(m.createdAt).toLocaleString(i18n.language)}</time>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {closed ? (
        <p className="border-t border-white/10 px-4 py-3 text-xs text-white/50">{t('supportCenter.closedNote', { days: SUPPORT_REOPEN_DAYS })}</p>
      ) : (
        <form
          className="flex items-end gap-2 border-t border-white/10 bg-black/20 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim()) void act(`/api/support/tickets/${id}/replies`, { message: reply.trim() }).then((ok) => ok && setReply(''));
          }}
        >
          <textarea className="field min-h-[48px] flex-1 resize-y" maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('supportCenter.replyPlaceholder')} aria-label={t('supportCenter.reply')} />
          <Button type="submit" variant="gold" disabled={busy || !reply.trim()}>
            {t('supportCenter.send')}
          </Button>
        </form>
      )}
    </div>
  );
}
