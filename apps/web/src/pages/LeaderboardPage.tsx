import { LB_GAMES, LB_GROUPS, WIN_RATE_MIN_ROUNDS, type LbBoardView, type LbEntry, type LbGame, type LbGroup, type LbMetric, type LbPeriod, type LeaderboardEntry } from '@casino/shared';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { PlayerAvatar, PlayerRankBadge, PlayerVipBadge } from '../players/identity';
import { PlayerTrigger } from '../players/PlayerActions';
import { GuildCrest } from '../social/parts';
import { AppShell, PageHeader } from '../ui/AppShell';
import { Medal } from '../ui/Avatar';
import { PlayerName } from '../ui/OfficialAssets';

interface BoardMeta {
  id: string;
  group: LbGroup;
  metric: LbMetric;
  game: LbGame | null;
  subject: 'player' | 'guild';
  reward: string | null;
  active: boolean;
  periods: LbPeriod[];
}
/** The old wealth board (wallet Cxu Bạc) stays available under Overview. */
const WEALTH = 'overview.wealth';
const GAME_METRICS: LbMetric[] = ['wins', 'best_streak', 'current_streak', 'win_rate', 'played'];

/**
 * Leaderboard hub: groups → board → period (and game), a podium for the Top 3, the ranked list
 * with the players' real avatars and frames, and my own position. Only server data is shown.
 */
export function LeaderboardPage() {
  const { t } = useTranslation();
  const [boards, setBoards] = useState<BoardMeta[] | null>(null);
  const [group, setGroup] = useState<LbGroup>('games');
  const [game, setGame] = useState<LbGame>('poker');
  const [metric, setMetric] = useState<LbMetric>('wins');
  const [boardId, setBoardId] = useState<string>('poker.wins');
  const [period, setPeriod] = useState<LbPeriod | null>(null);
  const [tGame, setTGame] = useState<LbGame | null>(null);

  useEffect(() => void api<{ boards: BoardMeta[] }>('/api/leaderboards').then((r) => setBoards(r.boards), () => setBoards([])), []);

  const inGroup = useMemo(() => (boards ?? []).filter((b) => b.group === group), [boards, group]);
  // Pick the board from the group's controls.
  useEffect(() => {
    if (!boards) return;
    if (group === 'games') setBoardId(`${game}.${metric}`);
    else if (!inGroup.some((b) => b.id === boardId) && boardId !== WEALTH) setBoardId(inGroup[0]?.id ?? WEALTH);
  }, [group, game, metric, boards]); // eslint-disable-line react-hooks/exhaustive-deps
  const meta = boards?.find((b) => b.id === boardId);
  const periods = boardId === WEALTH ? (['all'] as LbPeriod[]) : (meta?.periods ?? []);
  const activePeriod = period && periods.includes(period) ? period : (periods[0] ?? 'all');

  return (
    <AppShell>
      <div className="flex flex-col gap-3 p-3 pb-24 lg:p-5 short:gap-2 short:p-2">
        <PageHeader icon="leaderboard" title={t('lb.title')} subtitle={t('lb.subtitle')} />
        <Chips
          items={LB_GROUPS.map((g) => ({ id: g, label: t(`lb.groups.${g}`) }))}
          value={group}
          onChange={(g) => setGroup(g as LbGroup)}
          tone="gold"
          label={t('lb.title')}
        />
        {group === 'games' ? (
          <>
            <Chips items={LB_GAMES.map((g) => ({ id: g, label: t(`lb.gameNames.${g}`) }))} value={game} onChange={(g) => setGame(g as LbGame)} label={t('lb.groups.games')} />
            <Chips items={GAME_METRICS.map((m) => ({ id: m, label: t(`lb.metrics.${m}`) }))} value={metric} onChange={(m) => setMetric(m as LbMetric)} small label={t('lb.groups.games')} />
          </>
        ) : (
          (inGroup.length > 1 || group === 'overview') && (
            <Chips
              items={[...inGroup.map((b) => ({ id: b.id, label: t(`lb.metrics.${b.metric}`) })), ...(group === 'overview' ? [{ id: WEALTH, label: t('lb.metrics.wealth') }] : [])]}
              value={boardId}
              onChange={setBoardId}
              small
              label={t(`lb.groups.${group}`)}
            />
          )
        )}
        {periods.length > 1 && <Chips items={periods.map((p) => ({ id: p, label: t(`lb.periods.${p}`) }))} value={activePeriod} onChange={(p) => setPeriod(p as LbPeriod)} small tone="violet" label={t('lb.periods.all')} />}
        {group === 'tournament' && (
          <Chips items={[{ id: '', label: t('lb.allGames') }, ...LB_GAMES.map((g) => ({ id: g, label: t(`lb.gameNames.${g}`) }))]} value={tGame ?? ''} onChange={(g) => setTGame((g || null) as LbGame | null)} small label={t('lb.groups.tournament')} />
        )}
        {boards === null ? (
          <p className="glass p-6 text-center text-white/50">{t('app.loading')}</p>
        ) : boardId === WEALTH ? (
          <WealthBoard />
        ) : meta ? (
          <Board key={`${boardId}|${activePeriod}|${tGame ?? ''}`} meta={meta} period={activePeriod} game={group === 'tournament' ? tGame : null} />
        ) : null}
      </div>
    </AppShell>
  );
}

function Chips({ items, value, onChange, small = false, tone = 'cyan', label }: { items: { id: string; label: string }[]; value: string; onChange: (id: string) => void; small?: boolean; tone?: 'gold' | 'cyan' | 'violet'; label: string }) {
  const on = tone === 'gold' ? 'border-gold-300/70 bg-gold-300/20 text-gold-100' : tone === 'violet' ? 'border-violet-300/60 bg-violet-500/20 text-violet-100' : 'border-cyan-300/60 bg-cyan-400/15 text-cyan-100';
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label={label}>
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          role="tab"
          aria-selected={value === i.id}
          onClick={() => onChange(i.id)}
          className={`shrink-0 rounded-full border transition ${small ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'} ${value === i.id ? on : 'border-white/10 text-white/60 hover:bg-white/10 hover:text-white'}`}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

function useValueText(metric: LbMetric) {
  const { t, i18n } = useTranslation();
  return (e: LbEntry): { main: string; sub?: string } => {
    const n = (v: number) => formatChips(v, i18n.language);
    switch (metric) {
      case 'win_rate':
        return { main: `${e.value.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}%`, sub: t('lb.winsOf', { wins: n(e.detail?.wins ?? 0), played: n(e.detail?.played ?? 0) }) };
      case 'wins':
        return { main: n(e.value), sub: e.detail?.played ? t('lb.rounds', { n: n(e.detail.played) }) : undefined };
      case 'vip':
        return { main: `VIP ${e.value}` };
      case 'level':
        return { main: t('level.short', { level: e.value }) };
      case 'featured':
        return { main: n(e.value), sub: t('lb.likesFollows', { likes: n(e.detail?.likes ?? 0), followers: n(e.detail?.followers ?? 0) }) };
      default:
        return { main: n(e.value) };
    }
  };
}

function Board({ meta, period, game }: { meta: BoardMeta; period: LbPeriod; game: LbGame | null }) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<LbBoardView | null>(null);
  const [more, setMore] = useState<LbEntry[]>([]);
  const [failed, setFailed] = useState(false);
  const valueText = useValueText(meta.metric);
  const q = (offset: number) => `/api/leaderboards/${meta.id}?period=${period}&offset=${offset}&limit=50${game ? `&game=${game}` : ''}`;
  useEffect(() => void api<LbBoardView>(q(0)).then(setView, () => setFailed(true)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const all = [...(view?.entries ?? []), ...more];
  const loadMore = () => void api<LbBoardView>(q(all.length)).then((r) => setMore((m) => [...m, ...r.entries]), () => {});
  const date = (s: string | null) => (s ? new Date(s).toLocaleDateString(i18n.language, { timeZone: 'UTC' }) : '');

  if (!meta.active) return <p className="glass p-6 text-center text-sm text-white/60">{t(`lb.inactive.${meta.group}`, { defaultValue: t('lb.empty') })}</p>;
  if (failed) return <p className="glass p-6 text-center text-white/50">{t('lb.empty')}</p>;
  if (!view) return <p className="glass p-6 text-center text-white/50">{t('app.loading')}</p>;
  const podium = all.filter((e) => e.position <= 3).slice(0, 3);
  const rest = all.slice(podium.length);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
        {view.startsAt && (
          <span>
            {date(view.startsAt)} – {date(new Date(new Date(view.endsAt!).getTime() - 1).toISOString())}
          </span>
        )}
        <span>{t('lb.utcNote')}</span>
        {meta.game && <span>{t('lb.streakNote')}</span>}
        {meta.metric === 'win_rate' && <span>{t('lb.minRounds', { n: WIN_RATE_MIN_ROUNDS })}</span>}
        {meta.reward && <span className="text-gold-200/80">🏆 {t('lb.reward')}</span>}
      </div>
      {all.length === 0 ? (
        <p className="glass p-6 text-center text-sm text-white/55">{t('lb.empty')}</p>
      ) : (
        <>
          <Podium entries={podium} valueText={valueText} />
          {rest.length > 0 && (
            <ul className="glass flex flex-col p-1.5">
              {rest.map((e, i) => (
                <Row key={(e.player?.uid ?? e.guild?.id) + ':' + i} e={e} valueText={valueText} striped={i % 2 === 0} />
              ))}
            </ul>
          )}
          {all.length < view.total && (
            <button type="button" onClick={loadMore} className="self-center rounded-full border border-white/15 px-5 py-1.5 text-sm text-white/70 hover:bg-white/10">
              {t('lb.loadMore')}
            </button>
          )}
        </>
      )}
      <div className="sticky bottom-2 z-10 mt-1 rounded-2xl border border-gold-300/40 bg-ink-900/95 p-2 shadow-panel backdrop-blur short:static short:order-first">
        <p className="px-2 pb-1 text-[11px] font-label text-gold-200">{t('lb.myRank')}</p>
        {view.me ? <Row e={view.me} valueText={valueText} mine /> : <p className="px-2 pb-1 text-xs text-white/55">{t('lb.notRanked')}</p>}
      </div>
    </div>
  );
}

function Who({ e, size, animated = false }: { e: LbEntry; size: number; animated?: boolean }) {
  const { t } = useTranslation();
  if (e.guild) {
    return (
      <span className="flex min-w-0 items-center gap-2.5">
        <GuildCrest emblem={e.guild.emblem} color={e.guild.color} size={size} />
        <span className="min-w-0">
          <span className="block truncate font-strong text-white">{e.guild.name}</span>
          <span className="block text-[11px] text-white/50">{t('lb.members', { n: e.guild.members })}</span>
        </span>
      </span>
    );
  }
  const p = e.player!;
  return (
    <PlayerTrigger uid={p.uid} label={p.displayName} context="leaderboard" className="flex min-w-0 items-center gap-2.5">
      <PlayerAvatar player={p} size={size} animated={animated} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1">
          <PlayerName name={p.displayName} badges={p.badges} size={13} className="min-w-0 font-strong text-white" />
          <PlayerRankBadge rank={p.rank} size={15} />
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-white/50">
          <span className="tabular-nums">UID {p.uid}</span>
          <PlayerVipBadge level={p.vipLevel} size={14} />
        </span>
      </span>
    </PlayerTrigger>
  );
}

function Row({ e, valueText, striped = false, mine = false }: { e: LbEntry; valueText: (e: LbEntry) => { main: string; sub?: string }; striped?: boolean; mine?: boolean }) {
  const v = valueText(e);
  return (
    <li className={`flex list-none items-center gap-2.5 rounded-xl px-2 py-1.5 ${mine ? 'bg-gold-300/10' : striped ? 'bg-white/[0.03]' : ''}`}>
      <Medal rank={e.position} size={26} />
      <span className="min-w-0 flex-1">
        <Who e={e} size={36} />
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-strong tabular-nums text-gold-100">{v.main}</span>
        {v.sub && <span className="block text-[10px] text-white/45">{v.sub}</span>}
      </span>
    </li>
  );
}

const PODIUM_STYLE = [
  'order-2 border-gold-300/70 bg-gradient-to-b from-gold-300/25 via-violet-900/30 to-black/40 sm:-mt-3',
  'order-1 border-slate-200/50 bg-gradient-to-b from-slate-200/20 via-violet-900/30 to-black/40',
  'order-3 border-orange-300/50 bg-gradient-to-b from-orange-400/20 via-violet-900/30 to-black/40',
];

function Podium({ entries, valueText }: { entries: LbEntry[]; valueText: (e: LbEntry) => { main: string; sub?: string } }) {
  if (!entries.length) return null;
  return (
    <div className="grid grid-cols-3 items-end gap-2 short:gap-1.5">
      {entries.map((e, i) => {
        const v = valueText(e);
        const size = e.position === 1 ? 64 : 52;
        return (
          <div key={i} className={`flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-1.5 pb-2.5 pt-5 text-center ${PODIUM_STYLE[Math.min(e.position, 3) - 1]}`}>
            <Medal rank={e.position} size={30} />
            {e.guild ? (
              <Who e={e} size={size} />
            ) : (
              <PlayerTrigger uid={e.player!.uid} label={e.player!.displayName} context="leaderboard:podium" className="flex min-w-0 flex-col items-center gap-1.5">
                <span className="p-2">
                  <PlayerAvatar player={e.player!} size={size} animated />
                </span>
                <PlayerName name={e.player!.displayName} badges={e.player!.badges} size={13} className="max-w-full truncate font-strong text-white" />
                <span className="flex items-center gap-1 text-[10px] text-white/50">
                  UID {e.player!.uid} <PlayerVipBadge level={e.player!.vipLevel} size={13} />
                </span>
              </PlayerTrigger>
            )}
            <span className="font-display text-lg font-heading tabular-nums text-gold-100">{v.main}</span>
            {v.sub && <span className="text-[10px] text-white/45">{v.sub}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Unchanged wealth ranking (wallet Cxu Bạc), shown with the same rows. */
function WealthBoard() {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  useEffect(() => void api<{ entries: LeaderboardEntry[] }>('/api/leaderboard').then((r) => setEntries(r.entries), () => setEntries([])), []);
  if (!entries) return <p className="glass p-6 text-center text-white/50">{t('app.loading')}</p>;
  return (
    <ul className="glass flex flex-col p-1.5">
      {entries.map((e, i) => (
        <li key={e.uid} className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 ${i % 2 ? '' : 'bg-white/[0.03]'}`}>
          <Medal rank={e.rank} size={26} />
          <PlayerTrigger uid={e.uid} label={e.displayName} context="leaderboard" className="flex min-w-0 flex-1 items-center gap-2.5">
            <PlayerAvatar player={e} size={36} />
            <PlayerName name={e.displayName} badges={e.badges} size={13} className="min-w-0 font-strong text-white" />
          </PlayerTrigger>
          <span className="inline-flex items-center gap-1 font-strong tabular-nums text-gold-100">{formatChips(e.balance, i18n.language)}</span>
        </li>
      ))}
    </ul>
  );
}
