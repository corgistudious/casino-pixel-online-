import {
  GUILD_COLORS,
  GUILD_EMBLEMS,
  SOCIAL_RULES,
  type GuildColor,
  type GuildEmblem,
  type GuildInviteView,
  type GuildJoinPolicy,
  type GuildMemberView,
  type GuildSummary,
  type MyGuild,
} from '@casino/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { useSession } from '../store/session';
import { AppShell } from '../ui/AppShell';
import { Button } from '../ui/Button';
import { CurrencyIcon } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';
import { PlayerTrigger } from '../players/PlayerActions';
import { Empty, GUILD_PALETTE, GuildCrest, Modal, PlayerChip, Tabs, TierPill, useFail, useSocialEvents } from './parts';

/** Guild hall: ranking / invites / founding when outside a guild; banner, members, management and log inside. */
export function GuildPage() {
  const { t } = useTranslation();
  const fail = useFail();
  const [state, setState] = useState<{ guild: MyGuild | null; invites: GuildInviteView[] } | null>(null);
  const load = () => void api<{ guild: MyGuild | null; invites: GuildInviteView[] }>('/api/guild').then(setState, fail);
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  useSocialEvents((kind) => kind.startsWith('guild') && load());

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        {!state ? <p className="text-white/50">{t('app.loading')}</p> : state.guild ? <GuildHall guild={state.guild} reload={load} /> : <GuildLobby invites={state.invites} reload={load} />}
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------- outside a guild

function GuildLobby({ invites, reload }: { invites: GuildInviteView[]; reload: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'ranking' | 'invites' | 'create'>(invites.length ? 'invites' : 'ranking');
  return (
    <>
      <section className="relative overflow-hidden rounded-3xl border border-gold-300/30 bg-[radial-gradient(ellipse_at_top,_#5a2d0c_0%,_#1a0f22_55%,_#0b0816_100%)] p-6 shadow-panel">
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(115deg,rgba(242,193,78,0.05)_0_2px,transparent_2px_14px)]" />
        <div className="relative flex flex-wrap items-center gap-5">
          <div className="flex -space-x-4">
            <GuildCrest emblem="dragon" color="ruby" size={54} />
            <GuildCrest emblem="crown" color="gold" size={64} />
            <GuildCrest emblem="phoenix" color="sapphire" size={54} />
          </div>
          <div>
            <h1 className="font-display text-3xl font-heading text-gold">{t('social.guild.title')}</h1>
            <p className="max-w-xl text-sm text-white/60">{t('social.guild.subtitle')}</p>
          </div>
        </div>
      </section>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'ranking', label: t('social.guild.tabs.ranking') },
          { id: 'invites', label: t('social.guild.tabs.invites'), badge: invites.length },
          { id: 'create', label: t('social.guild.tabs.create') },
        ]}
      />
      {tab === 'ranking' && <GuildRanking onJoined={reload} />}
      {tab === 'invites' && <InviteList invites={invites} reload={reload} />}
      {tab === 'create' && <CreateGuild onCreated={reload} />}
    </>
  );
}

function GuildRanking({ onJoined, compact = false }: { onJoined?: () => void; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const fail = useFail();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<GuildSummary[] | null>(null);
  const load = (e?: FormEvent) => {
    e?.preventDefault();
    void api<{ guilds: GuildSummary[] }>(`/api/guilds?q=${encodeURIComponent(q.trim())}`).then((r) => setRows(r.guilds), fail);
  };
  useEffect(() => load(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const join = async (id: string) => {
    try {
      await api('/api/guild/join', { method: 'POST', body: { id } });
      onJoined?.();
    } catch (err) {
      fail(err);
    }
  };
  return (
    <section className="glass flex flex-col gap-3 p-4">
      {!compact && (
        <form onSubmit={load} className="flex gap-2">
          <input className="field flex-1" value={q} maxLength={24} onChange={(e) => setQ(e.target.value)} placeholder={t('social.guild.search')} aria-label={t('social.guild.search')} />
          <Button type="submit">🔍</Button>
        </form>
      )}
      {rows?.length === 0 && <Empty icon="🏰">{t('social.guild.noGuilds')}</Empty>}
      <ol className="flex flex-col gap-2">
        {rows?.map((g) => {
          const top = g.rank <= 3;
          return (
            <li key={g.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 ${top ? 'border-gold-300/40 bg-gradient-to-r from-gold-300/10 to-transparent' : 'border-white/10 bg-black/25'}`}>
              <span className={`w-8 text-center font-heading text-lg tabular-nums ${g.rank === 1 ? 'text-gold-100' : g.rank === 2 ? 'text-slate-200' : g.rank === 3 ? 'text-amber-500' : 'text-white/40'}`}>{g.rank}</span>
              <GuildCrest emblem={g.emblem} color={g.color} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-strong text-white">{g.name}</span>
                  <TierPill tier={g.tier} />
                </div>
                <div className="truncate text-xs text-white/50">
                  {t('social.guild.owner')}: {g.owner.displayName} · {g.description || '—'}
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="font-strong tabular-nums text-gold-100">{formatChips(g.points, i18n.language)}</div>
                <div className="text-white/45">
                  {g.members}/{g.maxMembers} · {g.joinPolicy === 'open' ? t('social.guild.open') : t('social.guild.inviteOnly')}
                </div>
              </div>
              {onJoined && (
                <Button size="sm" variant="gold" disabled={g.joinPolicy !== 'open' || g.members >= g.maxMembers} onClick={() => void join(g.id)}>
                  {g.members >= g.maxMembers ? t('social.guild.full') : t('social.guild.join')}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function InviteList({ invites, reload }: { invites: GuildInviteView[]; reload: () => void }) {
  const { t } = useTranslation();
  const fail = useFail();
  const act = async (path: string, body: unknown) => {
    try {
      await api(path, { method: 'POST', body });
      reload();
    } catch (err) {
      fail(err);
    }
  };
  if (!invites.length) return <Empty icon="✉️">{t('social.guild.noInvites')}</Empty>;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {invites.map((i) => (
        <li key={i.guild.id} className="glass flex items-center gap-3 p-4">
          <GuildCrest emblem={i.guild.emblem} color={i.guild.color} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-strong">
              {i.guild.name} <TierPill tier={i.guild.tier} />
            </div>
            <div className="text-xs text-white/50">
              {t('social.guild.invitedBy', { name: i.invitedBy.displayName })} · {i.guild.members}/{i.guild.maxMembers}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Button size="sm" variant="gold" onClick={() => void act('/api/guild/join', { id: i.guild.id })}>{t('social.guild.accept')}</Button>
            <Button size="sm" onClick={() => void act('/api/guild/invites/drop', { guildId: i.guild.id })}>{t('social.guild.decline')}</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function LookPicker({ emblem, color, onEmblem, onColor }: { emblem: GuildEmblem; color: GuildColor; onEmblem: (e: GuildEmblem) => void; onColor: (c: GuildColor) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <fieldset>
        <legend className="mb-1.5 text-xs text-white/55">{t('social.guild.emblem')}</legend>
        <div className="grid grid-cols-4 gap-2">
          {GUILD_EMBLEMS.map((e) => (
            <button key={e} type="button" onClick={() => onEmblem(e)} title={t(`social.guild.emblems.${e}`)} aria-pressed={emblem === e} className={`flex items-center justify-center rounded-xl border p-1.5 ${emblem === e ? 'border-gold-300 bg-gold-300/15' : 'border-white/10 bg-black/25 hover:border-white/30'}`}>
              <GuildCrest emblem={e} color={color} size={30} />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-xs text-white/55">{t('social.guild.color')}</legend>
        <div className="grid grid-cols-3 gap-2">
          {GUILD_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => onColor(c)} aria-pressed={color === c} className={`flex items-center gap-2 rounded-xl border px-2 py-2 text-xs ${color === c ? 'border-gold-300 bg-gold-300/15' : 'border-white/10 bg-black/25 hover:border-white/30'}`}>
              <span className="h-4 w-4 rounded-full ring-1 ring-white/30" style={{ background: `linear-gradient(135deg, ${GUILD_PALETTE[c][0]}, ${GUILD_PALETTE[c][2]})` }} />
              {t(`social.guild.colors.${c}`)}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function CreateGuild({ onCreated }: { onCreated: () => void }) {
  const { t, i18n } = useTranslation();
  const fail = useFail();
  const gold = useSession((s) => s.gold);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emblem, setEmblem] = useState<GuildEmblem>('crown');
  const [color, setColor] = useState<GuildColor>('gold');
  const [joinPolicy, setPolicy] = useState<GuildJoinPolicy>('open');
  const [busy, setBusy] = useState(false);
  const cost = SOCIAL_RULES.guild.createCostGold;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/guild', { method: 'POST', body: { name: name.trim(), description, emblem, color, joinPolicy } });
      toast(t('social.guild.created'), 'success');
      onCreated();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="glass grid gap-5 p-5 lg:grid-cols-[220px_1fr]">
      <div className="flex flex-col items-center gap-3 rounded-2xl p-4" style={{ background: `linear-gradient(160deg, ${GUILD_PALETTE[color][2]}cc, #0b0816)` }}>
        <GuildCrest emblem={emblem} color={color} size={96} />
        <div className="max-w-full truncate text-center font-display text-xl font-heading text-white">{name || t('social.guild.name')}</div>
        <TierPill tier="D" />
      </div>
      <div className="flex flex-col gap-3">
        <input className="field" required minLength={SOCIAL_RULES.guild.nameMin} maxLength={SOCIAL_RULES.guild.nameMax} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('social.guild.name')} aria-label={t('social.guild.name')} />
        <textarea className="field min-h-20" maxLength={SOCIAL_RULES.guild.descriptionMax} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('social.guild.description')} aria-label={t('social.guild.description')} />
        <LookPicker emblem={emblem} color={color} onEmblem={setEmblem} onColor={setColor} />
        <PolicyPicker value={joinPolicy} onChange={setPolicy} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
          <span className="flex items-center gap-1.5 text-sm text-white/70">
            <CurrencyIcon currency="gold" size={22} /> {t('social.guild.cost', { gold: formatChips(cost, i18n.language) })}
          </span>
          <Button type="submit" variant="gold" disabled={busy || name.trim().length < SOCIAL_RULES.guild.nameMin || gold < cost}>
            {t('social.guild.create')}
          </Button>
        </div>
      </div>
    </form>
  );
}

function PolicyPicker({ value, onChange }: { value: GuildJoinPolicy; onChange: (p: GuildJoinPolicy) => void }) {
  const { t } = useTranslation();
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="mb-1.5 w-full text-xs text-white/55">{t('social.guild.policy')}</legend>
      {(['open', 'invite'] as const).map((p) => (
        <button key={p} type="button" onClick={() => onChange(p)} aria-pressed={value === p} className={`rounded-xl border px-3 py-1.5 text-sm ${value === p ? 'border-gold-300 bg-gold-300/15 text-white' : 'border-white/10 bg-black/25 text-white/60'}`}>
          {p === 'open' ? t('social.guild.open') : t('social.guild.inviteOnly')}
        </button>
      ))}
    </fieldset>
  );
}

// ---------------------------------------------------------------- inside a guild

function GuildHall({ guild, reload }: { guild: MyGuild; reload: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'members' | 'manage' | 'log' | 'ranking'>('members');
  const [light, mid, dark] = GUILD_PALETTE[guild.color];
  const leader = guild.myRole !== 'member';
  return (
    <>
      <section className="relative overflow-hidden rounded-3xl border border-white/15 p-6 shadow-panel" style={{ background: `linear-gradient(120deg, ${dark} 0%, ${mid}55 45%, #0b0816 100%)` }}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full blur-3xl" style={{ background: `${light}33` }} />
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.03)_0_2px,transparent_2px_16px)]" />
        <div className="relative flex flex-wrap items-center gap-5">
          <GuildCrest emblem={guild.emblem} color={guild.color} size={96} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-3xl font-heading text-white">{guild.name}</h1>
              <TierPill tier={guild.tier} />
              <span className="rounded-md bg-black/40 px-2 py-0.5 text-xs font-label text-white/80">{t(`social.guild.roles.${guild.myRole}`)}</span>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-white/70">{guild.description || '—'}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Banner label={t('social.guild.rank')} value={`#${guild.rank}`} />
            <Banner label={t('social.guild.points')} value={formatChips(guild.points, i18n.language)} />
            <Banner label={t('social.guild.members')} value={`${guild.members}/${guild.maxMembers}`} />
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          <Button variant="gold" onClick={() => navigate('/chat?tab=guild')}>💬 {t('social.guild.openChat')}</Button>
        </div>
      </section>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'members', label: t('social.guild.tabs.members') },
          ...(leader ? [{ id: 'manage' as const, label: t('social.guild.tabs.manage') }] : guild.myRole === 'member' ? [{ id: 'manage' as const, label: t('social.guild.leave') }] : []),
          { id: 'log', label: t('social.guild.tabs.log') },
          { id: 'ranking', label: t('social.guild.tabs.ranking') },
        ]}
      />
      {tab === 'members' && <MemberList guild={guild} reload={reload} />}
      {tab === 'manage' && <Manage guild={guild} reload={reload} />}
      {tab === 'log' && <GuildLog guild={guild} />}
      {tab === 'ranking' && <GuildRanking compact />}
    </>
  );
}

function Banner({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-20 rounded-2xl border border-white/15 bg-black/35 px-3 py-2 backdrop-blur">
      <div className="font-heading text-lg tabular-nums text-white">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-white/55">{label}</div>
    </div>
  );
}

function MemberList({ guild, reload }: { guild: MyGuild; reload: () => void }) {
  const { t } = useTranslation();
  const fail = useFail();
  const [transferTo, setTransferTo] = useState<GuildMemberView | null>(null);
  const post = async (path: string, body: unknown) => {
    try {
      await api(path, { method: 'POST', body });
      reload();
    } catch (err) {
      fail(err);
    }
  };
  const roleTone = { owner: 'from-gold-200 to-gold-500 text-ink-900', officer: 'from-violet-300 to-violet-600 text-white', member: 'from-white/20 to-white/5 text-white/80' } as const;
  return (
    <section className="glass p-3">
      <ul className="flex flex-col gap-2">
        {guild.memberList.map((m) => {
          const canKick = guild.myRole === 'owner' ? m.role !== 'owner' : guild.myRole === 'officer' && m.role === 'member';
          return (
            <li key={m.uid} className="flex flex-wrap items-center gap-3 rounded-xl bg-black/25 p-3">
              <PlayerTrigger uid={m.uid} label={m.displayName} context="guild" className="flex-1">
                <PlayerChip card={m} online={m.presence ?? m.online} />
              </PlayerTrigger>
              <span className={`rounded-md bg-gradient-to-r px-2 py-0.5 text-xs font-label ${roleTone[m.role]}`}>{t(`social.guild.roles.${m.role}`)}</span>
              {guild.myRole === 'owner' && m.role !== 'owner' && (
                <>
                  <Button size="sm" onClick={() => void post('/api/guild/role', { uid: m.uid, role: m.role === 'officer' ? 'member' : 'officer' })}>
                    {m.role === 'officer' ? t('social.guild.demote') : t('social.guild.promote')}
                  </Button>
                  <Button size="sm" onClick={() => setTransferTo(m)}>{t('social.guild.transfer')}</Button>
                </>
              )}
              {canKick && (
                <Button size="sm" variant="ruby" onClick={() => window.confirm(t('social.guild.confirmKick', { name: m.displayName })) && void post('/api/guild/kick', { uid: m.uid })}>
                  {t('social.guild.kick')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {transferTo && <TransferDialog member={transferTo} onClose={() => setTransferTo(null)} onDone={reload} />}
    </section>
  );
}

function TransferDialog({ member, onClose, onDone }: { member: GuildMemberView; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const fail = useFail();
  const [password, setPassword] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/guild/transfer', { method: 'POST', body: { uid: member.uid, password } });
      onClose();
      onDone();
    } catch (err) {
      fail(err);
    }
  };
  return (
    <Modal title={t('social.guild.transfer')} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <PlayerChip card={member} />
        <p className="text-sm text-white/65">{t('social.guild.transferHint')}</p>
        <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('social.guild.password')} />
        <Button type="submit" variant="gold" disabled={!password}>{t('social.guild.transfer')}</Button>
      </form>
    </Modal>
  );
}

function Manage({ guild, reload }: { guild: MyGuild; reload: () => void }) {
  const { t } = useTranslation();
  const fail = useFail();
  const [description, setDescription] = useState(guild.description);
  const [emblem, setEmblem] = useState(guild.emblem);
  const [color, setColor] = useState(guild.color);
  const [policy, setPolicy] = useState(guild.joinPolicy);
  const [inviteUid, setInviteUid] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [password, setPassword] = useState('');
  const call = async (method: 'POST' | 'PATCH', path: string, body: unknown, success?: string) => {
    try {
      await api(path, { method, body });
      if (success) toast(success, 'success');
      reload();
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  };
  const leader = guild.myRole !== 'member';
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {leader && (
        <section className="glass flex flex-col gap-3 p-4">
          <h2 className="font-display text-lg font-heading">{t('social.guild.tabs.manage')}</h2>
          <textarea className="field min-h-20" maxLength={SOCIAL_RULES.guild.descriptionMax} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('social.guild.description')} />
          <LookPicker emblem={emblem} color={color} onEmblem={setEmblem} onColor={setColor} />
          {guild.myRole === 'owner' && <PolicyPicker value={policy} onChange={setPolicy} />}
          <Button variant="gold" onClick={() => void call('PATCH', '/api/guild', { description, emblem, color, ...(guild.myRole === 'owner' ? { joinPolicy: policy } : {}) }, t('social.guild.saved'))}>
            {t('social.guild.save')}
          </Button>
        </section>
      )}
      {leader && (
        <section className="glass flex flex-col gap-3 p-4">
          <h2 className="font-display text-lg font-heading">{t('social.guild.invite')}</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void call('POST', '/api/guild/invite', { uid: Number(inviteUid) }, t('social.guild.inviteSent')).then((ok) => ok && setInviteUid(''));
            }}
          >
            <input className="field flex-1" inputMode="numeric" value={inviteUid} onChange={(e) => setInviteUid(e.target.value.replace(/\D/g, ''))} placeholder={t('social.guild.inviteUid')} />
            <Button type="submit" disabled={!inviteUid}>{t('social.guild.invite')}</Button>
          </form>
          <h3 className="text-sm text-white/60">{t('social.guild.pendingInvites')}</h3>
          {guild.pendingInvites.length === 0 ? (
            <p className="text-xs text-white/40">—</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {guild.pendingInvites.map((i) => (
                <li key={i.uid} className="flex items-center justify-between rounded-lg bg-black/25 px-3 py-2 text-sm">
                  <span>
                    {i.displayName} <span className="text-white/40">UID {i.uid}</span>
                  </span>
                  <Button size="sm" onClick={() => void call('POST', '/api/guild/invites/drop', { uid: i.uid })}>{t('social.guild.withdraw')}</Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className="flex flex-col gap-3 rounded-2xl border border-ruby-400/30 bg-ruby-500/5 p-4 lg:col-span-2">
        <h2 className="font-display text-lg font-heading text-ruby-300">{t('social.guild.danger')}</h2>
        {guild.myRole !== 'owner' ? (
          <Button variant="ruby" onClick={() => window.confirm(t('social.guild.confirmLeave')) && void call('POST', '/api/guild/leave', {})}>{t('social.guild.leave')}</Button>
        ) : (
          <>
            {guild.members === 1 && <Button variant="ruby" onClick={() => window.confirm(t('social.guild.confirmLeave')) && void call('POST', '/api/guild/leave', {})}>{t('social.guild.leave')}</Button>}
            <p className="text-sm text-white/60">{t('social.guild.disbandHint')}</p>
            <div className="flex flex-wrap gap-2">
              <input className="field min-w-48 flex-1" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={t('social.guild.typeName', { name: guild.name })} />
              <input className="field min-w-48 flex-1" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('social.guild.password')} />
              <Button variant="ruby" disabled={confirmName !== guild.name || !password} onClick={() => void call('POST', '/api/guild/disband', { name: confirmName, password })}>
                {t('social.guild.disband')}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function GuildLog({ guild }: { guild: MyGuild }) {
  const { t, i18n } = useTranslation();
  return (
    <section className="glass p-4">
      <ol className="flex flex-col gap-1.5 text-sm">
        {guild.log.map((l) => (
          <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 py-1.5">
            <span>
              <b className="font-strong text-white">{l.actor?.displayName ?? t('social.guild.system')}</b> <span className="text-white/60">{t(`social.guild.log.${l.action}`, { defaultValue: l.action })}</span>{' '}
              {l.target && <b className="font-strong text-white">{l.target.displayName}</b>}
            </span>
            <time className="text-[11px] text-white/40">{new Date(l.createdAt).toLocaleString(i18n.language)}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}
