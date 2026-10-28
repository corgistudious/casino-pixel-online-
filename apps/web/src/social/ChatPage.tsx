import { SOCIAL_RULES, type ChatChannel, type ChatMessageView, type ConversationView } from '@casino/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../net/api';
import { socket } from '../net/socket';
import { useSession } from '../store/session';
import { useSocial } from '../store/social';
import { AppShell } from '../ui/AppShell';
import { PlayerAvatar, PlayerRankBadge, useLiveIdentity, type IdentityLike } from '../players/identity';
import { Button } from '../ui/Button';
import { ChatBubble, TitleBadge } from '../ui/Cosmetics';
import { NavIcon } from '../ui/NavIcons';
import { PlayerName } from '../ui/OfficialAssets';
import { PlayerTrigger, useBlockedUids } from '../players/PlayerActions';
import { Empty, PlayerChip, useFail } from './parts';

type Tab = 'server' | 'guild' | 'dm';
const TABS: Tab[] = ['server', 'guild', 'dm'];

/**
 * The one chat window behind 💬: Server, Guild and Private. Messages arrive over the WebSocket;
 * every reconnect refetches the open view so nothing is missed while offline.
 */
export function ChatPage() {
  return (
    <AppShell>
      <ChatContent />
    </AppShell>
  );
}

/** Reusable chat content for both the full chat page and an in-game overlay. */
export function ChatContent() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : params.get('dm') ? 'dm' : 'server';
  const unread = useSocial((s) => s.unreadDm);
  const online = useSession((s) => s.status === 'online');
  return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-3 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 font-display text-2xl font-heading text-white">
            <NavIcon name="chat" size={26} active /> {t('social.chat.title')}
          </h1>
          {!online && <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-200" role="status">{t('social.chat.reconnecting')}</span>}
        </div>
        <div className="flex gap-1 rounded-2xl border border-cyan-300/20 bg-black/35 p-1" role="tablist">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setParams({ tab: id })}
              className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-label text-sm transition ${tab === id ? 'bg-gradient-to-r from-cyan-400 to-sky-500 text-ink-900 shadow-button' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
            >
              {t(`social.chat.tabs.${id}`)}
              {id === 'dm' && unread > 0 && <span className="min-w-[18px] rounded-full bg-ruby-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{unread > 99 ? '99+' : unread}</span>}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {tab === 'server' && <Room key="server" channel="server" />}
          {tab === 'guild' && <Room key="guild" channel="guild" />}
          {tab === 'dm' && <Private initial={Number(params.get('dm')) || null} />}
        </div>
      </div>
  );
}

/** Server or guild room. */
function Room({ channel }: { channel: 'server' | 'guild' }) {
  const { t } = useTranslation();
  const fail = useFail();
  const [messages, setMessages] = useState<ChatMessageView[] | null>(null);
  const [noGuild, setNoGuild] = useState(false);
  const [more, setMore] = useState(true);
  const canModerate = useSession((s) => channel === 'server' && (s.user?.permissions.includes('chat.moderate') ?? false));
  const status = useSession((s) => s.status);

  const load = useCallback(() => {
    void api<{ messages: ChatMessageView[] }>(`/api/chat/${channel}`).then(
      (r) => {
        setNoGuild(false);
        setMessages(r.messages);
        setMore(r.messages.length >= SOCIAL_RULES.chat.history);
      },
      (err) => (err instanceof ApiError && err.code === 'not_in_guild' ? (setNoGuild(true), setMessages([])) : fail(err)),
    );
  }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (status === 'online') load();
  }, [status, load]);
  useEffect(
    () =>
      socket.listen((ev) => {
        if (ev.event === 'chatMessage' && ev.data.channel === channel) setMessages((m) => (m && !m.some((x) => x.id === ev.data.id) ? [...m, ev.data] : m));
        else if (ev.event === 'chatRemoved' && channel === 'server') setMessages((m) => m?.filter((x) => x.id !== ev.data.id) ?? m);
        else if (ev.event === 'social' && channel === 'guild' && ev.data.kind.startsWith('guild')) load();
      }),
    [channel, load],
  );
  const older = () => {
    const first = messages?.[0];
    if (!first) return;
    void api<{ messages: ChatMessageView[] }>(`/api/chat/${channel}?before=${first.id}`).then((r) => {
      setMessages((m) => [...r.messages, ...(m ?? [])]);
      setMore(r.messages.length >= SOCIAL_RULES.chat.history);
    }, fail);
  };
  const remove = async (id: number) => {
    try {
      await api(`/api/admin/chat/${id}`, { method: 'DELETE' });
    } catch (err) {
      fail(err);
    }
  };

  if (noGuild)
    return (
      <Empty icon="🏰">
        {t('social.chat.noGuild')}{' '}
        <Link to="/guild" className="text-gold-100 underline">
          {t('social.chat.findGuild')}
        </Link>
      </Empty>
    );
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#101a33]/90 to-[#0b0f1f]/95">
      <Thread messages={messages} more={more} onOlder={older} onRemove={canModerate ? remove : undefined} context={`chat:${channel}`} />
      <Composer channel={channel} path={`/api/chat/${channel}`} />
    </div>
  );
}

function Private({ initial }: { initial: number | null }) {
  const { t, i18n } = useTranslation();
  const fail = useFail();
  const [, setParams] = useSearchParams();
  const [list, setList] = useState<ConversationView[] | null>(null);
  const [peer, setPeer] = useState<number | null>(initial);
  const [filter, setFilter] = useState('');
  const [messages, setMessages] = useState<ChatMessageView[] | null>(null);
  const [more, setMore] = useState(true);
  const status = useSession((s) => s.status);
  const setOpenPeer = useSocial((s) => s.setOpenPeer);
  const refreshUnread = useSocial((s) => s.refresh);
  const peerRef = useRef(peer);
  peerRef.current = peer;

  const loadList = useCallback(() => void api<{ conversations: ConversationView[] }>('/api/chat/dm').then((r) => setList(r.conversations), fail), []); // eslint-disable-line react-hooks/exhaustive-deps
  const loadThread = useCallback(
    (uid: number) =>
      void api<{ messages: ChatMessageView[] }>(`/api/chat/dm/${uid}`).then((r) => {
        if (peerRef.current !== uid) return;
        setMessages(r.messages);
        setMore(r.messages.length >= SOCIAL_RULES.chat.history);
        refreshUnread();
        setList((l) => l?.map((c) => (c.peer.uid === uid ? { ...c, unread: 0 } : c)) ?? l);
      }, fail),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (status === 'online') {
      loadList();
      if (peer) loadThread(peer);
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setOpenPeer(peer);
    setMessages(null);
    if (peer) loadThread(peer);
    return () => setOpenPeer(null);
  }, [peer]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () =>
      socket.listen((ev) => {
        if (ev.event === 'chatMessage' && ev.data.channel === 'dm') {
          const other = ev.data.peerUid;
          if (other && other === peerRef.current) {
            setMessages((m) => (m && !m.some((x) => x.id === ev.data.id) ? [...m, ev.data] : m));
            // Seen as it arrives: let the server mark it read.
            if (ev.data.sender.uid === other) loadThread(other);
          }
          loadList();
        } else if (ev.event === 'social' && (ev.data.kind === 'accepted' || ev.data.kind === 'removed')) loadList();
      }),
    [loadList, loadThread],
  );

  const open = (uid: number) => {
    setPeer(uid);
    setParams({ tab: 'dm', dm: String(uid) });
  };
  const older = () => {
    const first = messages?.[0];
    if (!first || !peer) return;
    void api<{ messages: ChatMessageView[] }>(`/api/chat/dm/${peer}?before=${first.id}`).then((r) => {
      setMessages((m) => [...r.messages, ...(m ?? [])]);
      setMore(r.messages.length >= SOCIAL_RULES.chat.history);
    }, fail);
  };

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (list ?? []).filter((c) => !q || c.peer.displayName.toLowerCase().includes(q) || String(c.peer.uid).startsWith(q));
  }, [list, filter]);
  const current = list?.find((c) => c.peer.uid === peer);
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) : '');

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f1f]/95 md:grid-cols-[280px_1fr]">
      <aside className={`flex min-h-0 flex-col border-white/10 md:border-r ${peer ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-2">
          <input className="field" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('social.chat.searchFriends')} aria-label={t('social.chat.searchFriends')} />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {list?.length === 0 && <li className="p-4 text-sm text-white/45">{t('social.chat.noConversations')}</li>}
          {shown.map((c) => (
            <li key={c.peer.uid}>
              <button
                type="button"
                onClick={() => open(c.peer.uid)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${peer === c.peer.uid ? 'bg-cyan-400/15' : 'hover:bg-white/5'}`}
              >
                <PlayerAvatar player={c.peer} size={40} status={c.online} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <PlayerName name={c.peer.displayName} badges={c.peer.badges} size={12} className={`text-sm ${c.unread ? 'font-heading text-white' : 'font-label text-white/85'}`} />
                    <span className="shrink-0 text-[10px] text-white/40">{time(c.lastAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-xs ${c.unread ? 'text-white' : 'text-white/45'}`}>
                      {c.lastBody ? `${c.lastFromMe ? `${t('social.chat.you')}: ` : ''}${c.lastBody}` : '—'}
                    </span>
                    {c.unread > 0 && <span className="min-w-[18px] rounded-full bg-ruby-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{c.unread}</span>}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className={`flex min-h-0 flex-col ${peer ? 'flex' : 'hidden md:flex'}`}>
        {!peer ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-white/45">{t('social.chat.pickConversation')}</div>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b border-white/10 bg-black/20 px-3 py-2">
              <button type="button" className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/10 md:hidden" onClick={() => setPeer(null)} aria-label={t('nav.back')}>
                ←
              </button>
              {current ? (
                <PlayerTrigger uid={current.peer.uid} label={current.peer.displayName} context="chat:dm">
                  <PlayerChip card={current.peer} online={current.online} size={36} />
                </PlayerTrigger>
              ) : (
                <span className="text-white/60">UID {peer}</span>
              )}
            </header>
            <Thread messages={messages} more={more} onOlder={older} context="chat:dm" />
            <Composer channel="dm" path={`/api/chat/dm/${peer}`} locked={!!current && !current.friend} />
          </>
        )}
      </section>
    </div>
  );
}

function Thread({ messages: all, more, onOlder, onRemove, context }: { messages: ChatMessageView[] | null; more: boolean; onOlder: () => void; onRemove?: (id: number) => void; context: string }) {
  const blocked = useBlockedUids();
  const messages = all && blocked.size ? all.filter((m) => !blocked.has(m.sender.uid)) : all;
  const { t, i18n } = useTranslation();
  const me = useSession((s) => s.user?.uid);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const last = messages?.at(-1)?.id;
  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [last, messages?.length]);
  if (!messages) return <div className="flex-1 p-4 text-sm text-white/45">{t('app.loading')}</div>;
  return (
    <div
      ref={box}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
      role="log"
      aria-live="polite"
    >
      {more && messages.length > 0 && (
        <div className="mb-2 flex justify-center">
          <button type="button" onClick={onOlder} className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/60 hover:bg-white/10">
            {t('social.chat.older')}
          </button>
        </div>
      )}
      {messages.length === 0 && <p className="py-10 text-center text-sm text-white/45">{t('social.chat.empty')}</p>}
      <ol className="flex flex-col gap-1">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const mine = m.sender.uid === me;
          const grouped = prev && prev.sender.uid === m.sender.uid && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          return (
            <li key={m.id} className={`group flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''} ${grouped ? '' : 'mt-2'}`}>
              <div className="w-9 shrink-0">
                {!grouped && !mine && (
                  <PlayerTrigger uid={m.sender.uid} label={m.sender.displayName} context={context}>
                    <PlayerAvatar player={m.sender} size={36} />
                  </PlayerTrigger>
                )}
              </div>
              <div className={`flex min-w-0 max-w-[80%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                {!grouped && !mine && (
                  <div className="mb-0.5 flex items-center gap-1.5 px-1 text-[11px]">
                    <PlayerTrigger uid={m.sender.uid} label={m.sender.displayName} context={context}>
                      <LiveName player={m.sender} />
                    </PlayerTrigger>
                    <PlayerRankBadge rank={m.sender.rank} size={14} />
                    {m.sender.title && <TitleBadge itemId={m.sender.title} size="sm" />}
                  </div>
                )}
                <ChatBubble itemId={m.sender.bubble} mine={mine}>
                  <span className="whitespace-pre-wrap break-words">{m.body}</span>
                </ChatBubble>
                <div className="flex items-center gap-2 px-1 text-[10px] text-white/35">
                  <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}</time>
                  {onRemove && !mine && (
                    <button type="button" className="text-ruby-300 opacity-0 transition group-hover:opacity-100 focus:opacity-100" onClick={() => onRemove(m.id)}>
                      {t('social.chat.remove')}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Composer({ channel, path, locked = false }: { channel: ChatChannel; path: string; locked?: boolean }) {
  const { t } = useTranslation();
  const fail = useFail();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const max = SOCIAL_RULES.chat.maxLength;
  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await api(path, { method: 'POST', body: { body: text } });
      setBody('');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };
  if (locked) return <p className="border-t border-white/10 px-4 py-3 text-xs text-white/45">{t('social.chat.notFriendsAnymore')}</p>;
  return (
    <div className="border-t border-white/10 bg-black/25 p-2">
      <div className="flex items-end gap-2">
        <textarea
          className="field max-h-28 min-h-[44px] flex-1 resize-none"
          rows={1}
          maxLength={max}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKey}
          placeholder={t('social.chat.placeholder')}
          aria-label={t('social.chat.placeholder')}
          data-channel={channel}
        />
        <Button variant="gold" onClick={() => void send()} disabled={busy || !body.trim()}>
          {t('social.chat.send')}
        </Button>
      </div>
      <div className="mt-1 flex justify-between px-1 text-[10px] text-white/35">
        <span>{t('social.chat.rules')}</span>
        <span className="tabular-nums">
          {body.length}/{max}
        </span>
      </div>
    </div>
  );
}

/** Sender name with any newer live identity (rename, badges) merged in. */
function LiveName({ player }: { player: IdentityLike }) {
  const p = useLiveIdentity(player);
  return <PlayerName name={p.displayName} badges={p.badges ?? []} size={12} className="font-label text-cyan-100" />;
}
