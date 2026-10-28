import type { FriendsOverview, FriendView, GiftsOverview, PlayerCard, PlayerSearchResult } from '@casino/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { useCatalog } from '../store/catalog';
import { useSession } from '../store/session';
import { AppShell } from '../ui/AppShell';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { NavIcon } from '../ui/NavIcons';
import { toast } from '../ui/toast';
import { onRelationChange, PlayerTrigger } from '../players/PlayerActions';
import { RankEmblem } from '../ui/RankEmblem';
import { GiftDialog } from './dialogs';
import { Empty, PlayerChip, Tabs, useFail, useSocialEvents } from './parts';

type Tab = 'list' | 'requests' | 'search' | 'gifts';

/** Social-network style friends hub: list with presence, requests, player search and gifts. */
export function FriendsPage() {
  const { t } = useTranslation();
  const fail = useFail();
  const me = useSession((s) => s.user)!;
  const [tab, setTab] = useState<Tab>('list');
  const [data, setData] = useState<FriendsOverview | null>(null);
  const [giftTo, setGiftTo] = useState<PlayerCard | null>(null);

  const load = () => void api<FriendsOverview>('/api/friends').then(setData, fail);
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onRelationChange(load), []); // eslint-disable-line react-hooks/exhaustive-deps
  useSocialEvents((kind) => ['request', 'accepted', 'removed', 'gift'].includes(kind) && load());

  const post = async (path: string, uid: number, success?: string) => {
    try {
      const res = await api<{ status?: string }>(path, { method: 'POST', body: { uid } });
      if (success) toast(res.status === 'friends' ? t('social.friends.nowFriends') : success, 'success');
      load();
    } catch (err) {
      fail(err);
    }
  };
  const online = data?.friends.filter((f) => f.online).length ?? 0;

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <section className="relative overflow-hidden rounded-3xl border border-fuchsia-300/25 bg-gradient-to-br from-[#3b0f4f] via-[#1c1240] to-[#0d2246] p-5 shadow-panel">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-fuchsia-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-24 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-4">
            <Avatar customAvatar={me.customAvatar} index={me.avatar} frame={me.frame} avatarItem={me.avatarItem} size={64} />
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 font-display text-2xl font-heading text-white lg:text-3xl">
                <NavIcon name="friends" size={26} active /> {t('social.friends.title')}
              </h1>
              <p className="text-sm text-white/60">{t('social.friends.subtitle')}</p>
            </div>
            {data && (
              <div className="flex gap-3 text-center">
                <Stat value={data.friends.length} label={t('social.friends.tabs.list')} />
                <Stat value={online} label={t('social.online')} accent />
                <Stat value={data.incoming.length} label={t('social.friends.incoming')} />
              </div>
            )}
          </div>
        </section>

        <Tabs
          tone="pink"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'list', label: t('social.friends.tabs.list') },
            { id: 'requests', label: t('social.friends.tabs.requests'), badge: data?.incoming.length },
            { id: 'search', label: t('social.friends.tabs.search') },
            { id: 'gifts', label: t('social.friends.tabs.gifts') },
          ]}
        />

        {tab === 'list' &&
          (!data ? (
            <p className="text-white/50">{t('app.loading')}</p>
          ) : data.friends.length === 0 ? (
            <Empty icon="👥">{t('social.friends.empty')}</Empty>
          ) : (
            <>
              <p className="text-xs text-white/50">{t('social.friends.count', { count: data.friends.length, online })}</p>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.friends.map((f) => (
                  <FriendCard key={f.uid} f={f} onGift={() => setGiftTo(f)} onRemove={() => window.confirm(t('social.friends.confirmRemove', { name: f.displayName })) && void post('/api/friends/remove', f.uid)} />
                ))}
              </ul>
            </>
          ))}

        {tab === 'requests' && data && (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="glass flex flex-col gap-2 p-4">
              <h2 className="font-display text-lg font-heading">{t('social.friends.incoming')}</h2>
              {data.incoming.length === 0 ? (
                <p className="text-sm text-white/45">{t('social.friends.noRequests')}</p>
              ) : (
                data.incoming.map((r) => (
                  <div key={r.uid} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/25 p-3">
                    <PlayerTrigger uid={r.uid} label={r.displayName} context="friends:incoming">
                      <PlayerChip card={r} />
                    </PlayerTrigger>
                    <div className="flex gap-2">
                      <Button size="sm" variant="gold" onClick={() => void post('/api/friends/accept', r.uid, t('social.friends.nowFriends'))}>{t('social.friends.accept')}</Button>
                      <Button size="sm" onClick={() => void post('/api/friends/decline', r.uid)}>{t('social.friends.decline')}</Button>
                    </div>
                  </div>
                ))
              )}
            </section>
            <section className="glass flex flex-col gap-2 p-4">
              <h2 className="font-display text-lg font-heading">{t('social.friends.outgoing')}</h2>
              {data.outgoing.length === 0 ? (
                <p className="text-sm text-white/45">{t('social.friends.noRequests')}</p>
              ) : (
                data.outgoing.map((r) => (
                  <div key={r.uid} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/25 p-3">
                    <PlayerTrigger uid={r.uid} label={r.displayName} context="friends:outgoing">
                      <PlayerChip card={r} />
                    </PlayerTrigger>
                    <Button size="sm" onClick={() => void post('/api/friends/cancel', r.uid)}>{t('social.friends.cancel')}</Button>
                  </div>
                ))
              )}
            </section>
          </div>
        )}

        {tab === 'search' && <SearchPanel onChanged={load} />}
        {tab === 'gifts' && <GiftHistory />}
      </div>
      {giftTo && <GiftDialog to={giftTo} onClose={() => setGiftTo(null)} />}
    </AppShell>
  );
}

function Stat({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="min-w-16 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
      <div className={`font-heading text-xl tabular-nums ${accent ? 'text-emerald-300' : 'text-white'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-white/50">{label}</div>
    </div>
  );
}

function FriendCard({ f, onGift, onRemove }: { f: FriendView; onGift: () => void; onRemove: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  return (
    <li className={`group flex flex-col gap-3 rounded-2xl border p-4 transition ${f.online ? 'border-emerald-300/25 bg-gradient-to-br from-emerald-500/10 to-black/30' : 'border-white/10 bg-black/25'} hover:border-fuchsia-300/40`}>
      <div className="flex items-start justify-between gap-2">
        <PlayerTrigger uid={f.uid} label={f.displayName} context="friends">
          <PlayerChip card={f} online={f.presence ?? f.online} />
        </PlayerTrigger>
        <button type="button" onClick={onRemove} className="rounded-lg px-1.5 text-white/30 opacity-0 transition hover:bg-ruby-500/20 hover:text-ruby-300 group-hover:opacity-100 focus:opacity-100" title={t('social.friends.remove')} aria-label={t('social.friends.remove')}>
          ✕
        </button>
      </div>
      <p className="text-[11px] text-white/40">{t('social.friends.since', { date: new Date(f.since).toLocaleDateString(i18n.language) })}</p>
      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" variant="gold" onClick={() => navigate(`/chat?dm=${f.uid}`)}>{t('social.friends.message')}</Button>
        <Button size="sm" onClick={onGift} disabled={!f.giftable} title={f.giftable ? undefined : t('social.gift.tooSoon', { hours: 24 })}>{t('social.friends.gift')}</Button>
        <Button size="sm" onClick={() => navigate(`/player/${f.uid}`)}>{t('social.friends.profile')}</Button>
      </div>
    </li>
  );
}

function SearchPanel({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation();
  const fail = useFail();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<PlayerSearchResult[] | null>(null);
  const search = (e?: FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    void api<{ players: PlayerSearchResult[] }>(`/api/friends/search?q=${encodeURIComponent(q.trim())}`).then((r) => setRows(r.players), fail);
  };
  const add = async (uid: number) => {
    try {
      const res = await api<{ status: string }>('/api/friends/request', { method: 'POST', body: { uid } });
      toast(res.status === 'friends' ? t('social.friends.nowFriends') : t('social.friends.sent'), 'success');
      search();
      onChanged();
    } catch (err) {
      fail(err);
    }
  };
  return (
    <section className="glass flex flex-col gap-3 p-4">
      <form onSubmit={search} className="flex gap-2">
        <input className="field flex-1" maxLength={32} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('social.friends.searchPlaceholder')} aria-label={t('social.friends.searchPlaceholder')} />
        <Button type="submit" variant="gold" disabled={!q.trim()}>🔍</Button>
      </form>
      <p className="text-xs text-white/45">{t('social.friends.searchHint')}</p>
      {rows?.length === 0 && <Empty icon="🔎">{t('social.friends.noResults')}</Empty>}
      <ul className="grid gap-2 md:grid-cols-2">
        {rows?.map((r) => (
          <li key={r.uid} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/25 p-3">
            <PlayerTrigger uid={r.uid} label={r.displayName} context="search">
              <PlayerChip card={r} online={r.online} />
            </PlayerTrigger>
            {r.relation === 'none' && <Button size="sm" variant="gold" onClick={() => void add(r.uid)}>{t('social.friends.add')}</Button>}
            {r.relation === 'incoming' && <Button size="sm" variant="gold" onClick={() => void add(r.uid)}>{t('social.friends.accept')}</Button>}
            {r.relation === 'friend' && <span className="text-xs font-label text-emerald-300">✓ {t('social.friends.isFriend')}</span>}
            {r.relation === 'outgoing' && <span className="text-xs text-white/50">{t('social.friends.pending')}</span>}
            {r.relation === 'self' && <span className="text-xs text-white/50">{t('social.friends.you')}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function GiftHistory() {
  const { t, i18n } = useTranslation();
  const fail = useFail();
  const items = useCatalog((c) => c.items);
  const [data, setData] = useState<GiftsOverview | null>(null);
  useEffect(() => void api<GiftsOverview>('/api/gifts').then(setData, fail), []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <p className="text-white/50">{t('app.loading')}</p>;
  if (data.history.length === 0) return <Empty icon="🎁">{t('social.gift.noHistory')}</Empty>;
  return (
    <section className="glass flex flex-col gap-2 p-4">
      <h2 className="font-display text-lg font-heading">{t('social.gift.history')}</h2>
      <ul className="flex flex-col divide-y divide-white/5">
        {data.history.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <div className="min-w-0">
              <div className={g.direction === 'sent' ? 'text-white/80' : 'text-emerald-200'}>
                {g.direction === 'sent' ? '↗ ' : '↘ '}
                {t(g.direction === 'sent' ? 'social.gift.sentTo' : 'social.gift.receivedFrom', { name: g.other.displayName })}
                <span className="ml-1 text-white/35">UID {g.other.uid}</span>
              </div>
              {g.message && <div className="truncate text-xs italic text-white/45">“{g.message}”</div>}
            </div>
            <div className="text-right">
              <div className="font-strong tabular-nums text-gold-100">{g.kind === 'silver' ? `${formatChips(g.amount, i18n.language)} ${t('social.gift.silver')}` : (items[g.itemId ?? '']?.name[i18n.language === 'en' ? 'en' : 'vi'] ?? g.itemId)}</div>
              <div className="text-[11px] text-white/40">{new Date(g.createdAt).toLocaleString(i18n.language)}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
