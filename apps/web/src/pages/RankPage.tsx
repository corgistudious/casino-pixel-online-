import {
  DIVISIONS,
  GAMEPLAY_EXP,
  LEVEL_MAX,
  RANK_TIERS,
  RP_PER_DIVISION,
  TOP_TITLES,
  type ProgressView,
  type RankLadderEntry,
  type TopTitleId,
} from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { useSession } from '../store/session';
import { AppShell, PageHeader } from '../ui/AppShell';
import { RankEmblem, useRankName } from '../ui/RankEmblem';

interface LevelEntry {
  position: number;
  uid: number;
  displayName: string;
  level: number;
  exp: number;
}
interface RankEvent {
  id: number;
  result: 'win' | 'loss' | 'adjust';
  rpDelta: number;
  divisionBefore: number;
  divisionAfter: number;
  rpAfter: number;
  streakAfter: number;
  promoted: boolean;
  demoted: boolean;
  createdAt: string;
}
interface SeasonResult {
  seasonId: number;
  name: string;
  division: number;
  rp: number;
  topPosition: number | null;
  topTitle: TopTitleId | null;
  wins: number;
  losses: number;
}

type Tab = 'ladder' | 'level' | 'history' | 'seasons';

function untilText(iso: string, lang: string) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return '—';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  return lang === 'en' ? `${days}d ${hours}h` : `${days} ngày ${hours} giờ`;
}

/** Account level and ranked season: everything shown comes from the server. */
export function RankPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const fmt = (n: number) => formatChips(n, lang);
  const rankName = useRankName();
  const me = useSession((s) => s.user);
  const [progress, setProgress] = useState<ProgressView | null>(null);
  const [tab, setTab] = useState<Tab>('ladder');
  const [ladder, setLadder] = useState<RankLadderEntry[] | null>(null);
  const [levels, setLevels] = useState<LevelEntry[] | null>(null);
  const [history, setHistory] = useState<RankEvent[] | null>(null);
  const [seasons, setSeasons] = useState<SeasonResult[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void api<ProgressView>('/api/me/progress').then(setProgress, () => setFailed(true));
  }, [me?.level]);

  useEffect(() => {
    if (tab === 'ladder' && !ladder) void api<{ entries: RankLadderEntry[] }>('/api/rank/ladder').then((r) => setLadder(r.entries), () => setLadder([]));
    if (tab === 'level' && !levels) void api<{ entries: LevelEntry[] }>('/api/leaderboard/level').then((r) => setLevels(r.entries), () => setLevels([]));
    if (tab === 'history' && !history) void api<{ events: RankEvent[] }>('/api/me/rank/history').then((r) => setHistory(r.events), () => setHistory([]));
    if (tab === 'seasons' && !seasons) void api<{ results: SeasonResult[] }>('/api/me/rank/seasons').then((r) => setSeasons(r.results), () => setSeasons([]));
  }, [tab, ladder, levels, history, seasons]);

  const level = progress?.level;
  const rank = progress?.rank ?? null;
  const st = rank?.state;
  const nextName = st && st.division < DIVISIONS.length - 1 ? rankName(st.division + 1) : '';
  const atTop = st && st.division === DIVISIONS.length - 1;
  const rpRatio = st ? Math.min(1, st.rp / RP_PER_DIVISION) : 0;

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <PageHeader icon="rank" title={t('rank.title')} subtitle={rank ? `${t('rank.season')}: ${rank.seasonName}` : undefined} />
        {failed && <p className="rounded-xl bg-red-950/40 px-3 py-2 text-sm text-red-200">{t('errors.network')}</p>}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Level */}
          <section className="relative overflow-hidden rounded-2xl border border-gold-300/25 bg-gradient-to-br from-ink-800 via-ink-900 to-[#2a1a66] p-5 shadow-panel">
            <div className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-gold-300/10 blur-3xl" />
            <div className="relative flex items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-2 border-gold-300/70 bg-[radial-gradient(circle_at_35%_30%,#4a3590,#140d33)] shadow-[0_0_24px_rgba(242,193,78,0.35)]">
                <span className="text-[10px] uppercase tracking-widest text-gold-100/70">{t('level.title')}</span>
                <span className="font-display text-3xl font-bold tabular-nums text-gold-100">{level?.level ?? '—'}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-2xl font-bold text-gold">{level ? t('level.level', { level: level.level }) : t('app.loading')}</div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={level?.needed || 1} aria-valuenow={level?.intoLevel ?? 0}>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold-500 via-gold-300 to-gold-100 shadow-[0_0_12px_rgba(242,193,78,0.6)] transition-[width] duration-700"
                    style={{ width: `${level ? (level.needed ? (level.intoLevel / level.needed) * 100 : 100) : 0}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between gap-2 text-xs tabular-nums text-white/55">
                  <span>
                    {t('level.exp')} {level ? `${fmt(level.intoLevel)} / ${fmt(level.needed)}` : '—'}
                  </span>
                  <span>{level && (level.level >= LEVEL_MAX ? t('level.max') : t('level.toNext', { exp: fmt(level.needed - level.intoLevel), level: level.level + 1 }))}</span>
                </div>
              </div>
            </div>
            <details className="relative mt-4 text-xs text-white/55">
              <summary className="cursor-pointer text-white/70">{t('level.howTitle')}</summary>
              <p className="mt-1 leading-relaxed">
                {t('level.how', { base: GAMEPLAY_EXP.perRound, bonus: GAMEPLAY_EXP.bonus, min: fmt(GAMEPLAY_EXP.bonusMinBet), cap: fmt(GAMEPLAY_EXP.dailyCap) })} {t('level.rewardHint')}
              </p>
            </details>
          </section>

          {/* Rank */}
          <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-ink-800 via-ink-900 to-[#3a0f2a] p-5 shadow-panel">
            {!progress && !failed && <p className="text-white/50">{t('app.loading')}</p>}
            {progress && !rank && <p className="text-white/60">{t('rank.noSeason')}</p>}
            {rank && st && (
              <div className="relative flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <RankEmblem division={st.division} top={rank.topTitle} size={96} />
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-2xl font-bold text-white">{rankName(st.division, rank.topTitle)}</div>
                    {rank.topTitle && <div className="text-xs text-gold-100">{rankName(st.division)}</div>}
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={RP_PER_DIVISION} aria-valuenow={Math.min(st.rp, RP_PER_DIVISION)}>
                      <div className="h-full rounded-full bg-gradient-to-r from-[#ff6f9f] via-[#ffb35c] to-[#ffe08a] transition-[width] duration-700" style={{ width: `${rpRatio * 100}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-xs tabular-nums text-white/55">
                      <span>{atTop ? `${t('rank.topScore')}: ${fmt(st.rp)} RP` : t('rank.rpOf', { rp: st.rp })}</span>
                      <span>
                        {t('rank.wins')} {rank.wins} · {t('rank.losses')} {rank.losses}
                      </span>
                    </div>
                  </div>
                </div>
                {rank.seriesActive && (
                  <div className="rounded-xl border border-gold-300/40 bg-gold-300/10 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gold-100">{t('rank.series', { n: st.streak })}</span>
                      <span className="flex gap-1.5" aria-hidden>
                        {[0, 1, 2].map((i) => (
                          <span key={i} className={`h-3 w-3 rounded-full ring-1 ring-gold-300/70 ${i < st.streak ? 'bg-gold-300 shadow-[0_0_8px_rgba(242,193,78,0.8)]' : 'bg-black/40'}`} />
                        ))}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-white/60">{t('rank.seriesHint', { next: nextName })}</p>
                  </div>
                )}
                {rank.demotionRisk ? (
                  <p className="rounded-xl bg-red-950/50 px-3 py-2 text-xs font-semibold text-red-200">⚠ {t('rank.risk')}</p>
                ) : (
                  <p className={`rounded-xl px-3 py-2 text-xs ${rank.protected ? 'bg-emerald-950/40 text-emerald-200' : 'bg-white/5 text-white/60'}`}>
                    {rank.protected ? `🛡 ${t('rank.protected')}` : t('rank.unprotected', { rp: rank.rules.lossRp })}
                  </p>
                )}
                <div className="flex flex-wrap justify-between gap-2 text-xs text-white/50">
                  <span>
                    {t('rank.peak')}: {rankName(rank.peakDivision)}
                  </span>
                  {rank.topPosition && <span className="text-gold-100">{t('rank.position', { n: rank.topPosition })}</span>}
                  {rank.endsAt && <span>{t('rank.seasonEnds', { time: untilText(rank.endsAt, lang) })}</span>}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Tier ladder */}
        <section className="glass p-4">
          <h2 className="mb-3 font-display text-lg text-gold-100">{t('rank.tiersTitle')}</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {RANK_TIERS.map((tier) => {
              const first = DIVISIONS.find((d) => d.tier === tier.id)!.index;
              const current = st ? DIVISIONS[st.division]!.tier === tier.id && !rank?.topTitle : false;
              return (
                <div key={tier.id} className={`flex w-20 shrink-0 flex-col items-center gap-1 rounded-xl p-2 ${current ? 'bg-gold-300/10 ring-1 ring-gold-300/50' : ''}`}>
                  <RankEmblem division={first + tier.divisions - 1} size={52} dim={!!st && first > st.division} />
                  <span className="text-center text-[11px] font-semibold text-white/80">{t(`rank.tiers.${tier.id}`)}</span>
                  <span className="text-[10px] text-white/40">{['', 'I', 'II', 'III', 'IV', 'V'][tier.divisions]} → I</span>
                </div>
              );
            })}
            {[...TOP_TITLES].reverse().map((top) => (
              <div key={top.id} className={`flex w-20 shrink-0 flex-col items-center gap-1 rounded-xl p-2 ${rank?.topTitle === top.id ? 'bg-gold-300/10 ring-1 ring-gold-300/50' : ''}`}>
                <RankEmblem division={DIVISIONS.length - 1} top={top.id} size={52} dim={rank?.topTitle !== top.id} />
                <span className="text-center text-[11px] font-semibold text-gold-100">{t(`rank.top.${top.id}`)}</span>
                <span className="text-[10px] text-white/40">{t(`rank.topRange.${top.id}`)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-white/55">
            {t('rank.rules', { win: rank?.rules.winRp ?? 25, loss: rank?.rules.lossRp ?? 20, reset: rank?.rules.softResetDivisions ?? 5 })}
          </p>
          <p className="mt-2 rounded-lg border border-neon-cyan/30 bg-neon-cyan/5 px-3 py-2 text-xs text-neon-cyan/90">{t('rank.modeNote')}</p>
        </section>

        {/* Tabs */}
        <section className="glass p-3">
          <div role="tablist" className="mb-3 flex gap-1 overflow-x-auto">
            {(['ladder', 'level', 'history', 'seasons'] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${tab === k ? 'bg-gold-300/15 text-gold-100' : 'text-white/60 hover:bg-white/5'}`}
              >
                {{ ladder: t('rank.ladderTitle'), level: t('level.ladder'), history: t('rank.history'), seasons: t('rank.seasons') }[k]}
              </button>
            ))}
          </div>

          {tab === 'ladder' && (
            <List loading={!ladder} empty={ladder?.length === 0 ? t('rank.ladderEmpty') : null}>
              {ladder?.map((e) => (
                <Row key={e.uid} mine={e.uid === me?.uid} position={e.position}>
                  <RankEmblem division={e.division} top={e.topTitle} size={30} />
                  <span className="min-w-0 flex-1 truncate">{e.displayName}</span>
                  <span className="text-xs text-white/60">{rankName(e.division, e.topTitle)}</span>
                  <span className="w-16 text-right text-xs tabular-nums text-white/70">{fmt(e.rp)} RP</span>
                </Row>
              ))}
            </List>
          )}
          {tab === 'level' && (
            <List loading={!levels} empty={levels?.length === 0 ? '—' : null}>
              {levels?.map((e) => (
                <Row key={e.uid} mine={e.uid === me?.uid} position={e.position}>
                  <span className="min-w-0 flex-1 truncate">{e.displayName}</span>
                  <span className="font-semibold text-gold-100">{t('level.short', { level: e.level })}</span>
                  <span className="w-24 text-right text-xs tabular-nums text-white/55">{fmt(e.exp)} EXP</span>
                </Row>
              ))}
            </List>
          )}
          {tab === 'history' && (
            <List loading={!history} empty={history?.length === 0 ? t('rank.historyEmpty') : null}>
              {history?.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm odd:bg-white/[0.03]">
                  <span className={`w-20 font-semibold ${e.result === 'win' ? 'text-emerald-300' : e.result === 'loss' ? 'text-red-300' : 'text-white/70'}`}>{t(`rank.result.${e.result}`)}</span>
                  <span className="w-16 tabular-nums text-white/80">{e.rpDelta > 0 ? `+${e.rpDelta}` : e.rpDelta} RP</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-white/60">
                    {rankName(e.divisionAfter)} · {e.rpAfter} RP {e.promoted ? `· ${t('rank.promoted')}` : ''} {e.demoted ? `· ${t('rank.demoted')}` : ''}
                  </span>
                  <span className="text-[11px] text-white/40">{new Date(e.createdAt).toLocaleString(lang)}</span>
                </li>
              ))}
            </List>
          )}
          {tab === 'seasons' && (
            <List loading={!seasons} empty={seasons?.length === 0 ? t('rank.seasonsEmpty') : null}>
              {seasons?.map((s) => (
                <li key={s.seasonId} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm odd:bg-white/[0.03]">
                  <RankEmblem division={s.division} top={s.topTitle} size={30} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="text-xs text-white/70">
                    {t('rank.finalRank')}: {rankName(s.division, s.topTitle)}
                    {s.topPosition ? ` (#${s.topPosition})` : ''}
                  </span>
                  <span className="text-xs tabular-nums text-white/45">
                    {s.wins}–{s.losses}
                  </span>
                </li>
              ))}
            </List>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function List({ loading, empty, children }: { loading: boolean; empty: string | null; children: React.ReactNode }) {
  const { t } = useTranslation();
  if (loading) return <p className="p-3 text-center text-sm text-white/50">{t('app.loading')}</p>;
  if (empty) return <p className="p-3 text-center text-sm text-white/50">{empty}</p>;
  return <ul className="flex flex-col">{children}</ul>;
}

function Row({ mine, position, children }: { mine: boolean; position: number; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${mine ? 'bg-gold-300/10 ring-1 ring-gold-300/40' : 'odd:bg-white/[0.03]'}`}>
      <span className={`w-7 text-center font-display font-bold tabular-nums ${position <= 3 ? 'text-gold-100' : 'text-white/50'}`}>{position}</span>
      {children}
    </li>
  );
}
