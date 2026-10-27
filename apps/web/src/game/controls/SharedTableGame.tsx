import {
  rouletteColor,
  type MyTableBet,
  type RouletteOutcome,
  type RoundOutcome,
  type TableRoundView,
  type TaiXiuOutcome,
} from '@casino/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { sfx } from '../../audio/sfx';
import { addChip, toBetList, totalOf } from '../../lib/bets';
import { CHIP_VALUES, formatChips } from '../../lib/format';
import { clockOffset, mergeBets, phaseAt, sumBets } from '../../lib/tables';
import { ApiError } from '../../net/api';
import { socket } from '../../net/socket';
import { useSession } from '../../store/session';
import { Button } from '../../ui/Button';
import { ChipSelector } from '../../ui/Chip';
import { toast } from '../../ui/toast';
import { PhaserView } from '../PhaserView';
import { RouletteTableScene } from '../scenes/RouletteTableScene';
import { TaiXiuScene } from '../scenes/TaiXiuScene';
import { GameLayout, Stat } from './GameLayout';

type View = Omit<TableRoundView, 'myBets'>;
type Scene = TaiXiuScene | RouletteTableScene;
/** Seconds of betting left when the countdown turns into a warning. */
const WARN_S = 5;
/** Bets are not sent in the last moment: the request would arrive after the lock. */
const SEND_GUARD_MS = 300;

/**
 * A shared-round table (Tài Xỉu or Roulette). The server owns the clock, the outcome and every
 * payout; this screen follows its broadcasts, keeps a clock offset to show the same countdown as
 * everyone else, and only sends chips while the server says betting is open.
 */
export function SharedTableGame({ tableId }: { tableId: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const status = useSession((s) => s.status);
  const scene = useRef<Scene | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [mine, setMine] = useState<{ roundId: string; bets: MyTableBet[] }>({ roundId: '', bets: [] });
  const [pending, setPending] = useState<Record<string, number>>({});
  const [lastBets, setLastBets] = useState<Record<string, number>>({});
  const [lastWin, setLastWin] = useState<number | null>(null);
  const [chip, setChip] = useState<number>(100);
  const [placing, setPlacing] = useState(false);
  const [, setTick] = useState(0);

  // Server clock offset: the largest sample has the least network delay in it.
  const samples = useRef<number[]>([]);
  const offset = useRef(0);
  const now = useCallback(() => Date.now() + offset.current, []);
  const state = useRef({ view, mine, pending, chip, placing });
  state.current = { view, mine, pending, chip, placing };
  const refreshed = useRef('');
  const celebrated = useRef('');
  const warned = useRef(-1);
  /** Past roulette numbers for the wheel's history strip, drawn once the scene is ready. */
  const seedRef = useRef<number[] | null>(null);

  const apply = useCallback(
    (v: View, myBets?: MyTableBet[]) => {
      samples.current = [...samples.current.slice(-7), v.serverNow - Date.now()];
      offset.current = clockOffset(samples.current);
      const prev = state.current.mine;
      if (myBets) setMine({ roundId: v.round.id, bets: myBets });
      else if (prev.roundId !== v.round.id) {
        // A new round started: remember what was bet for "rebet", drop unsent chips.
        if (prev.bets.length) setLastBets(sumBets(prev.bets));
        setMine({ roundId: v.round.id, bets: [] });
        setPending({});
      }
      if (!state.current.view && v.table.game === 'roulette') {
        const past = (v.round.status === 'settled' ? v.history.slice(1) : v.history) as RouletteOutcome[];
        seedRef.current = past.map((o) => o.number).reverse();
      }
      setView(v);
      scene.current?.setRound(v.round, now);
    },
    [now],
  );
  // Join (and re-join after a reconnect: rooms live on the connection).
  useEffect(() => {
    if (status !== 'online') return;
    let alive = true;
    socket.request('table.join', { tableId }).then(
      (v) => alive && apply(v, v.myBets),
      (err) => {
        const code = err instanceof ApiError ? err.code : 'internal';
        toast(t(`errors.${code}`), 'error');
        if (code === 'table_not_found') navigate('/', { replace: true });
      },
    );
    return () => {
      alive = false;
      socket.request('table.leave', { tableId }).catch(() => {});
    };
  }, [status, tableId, apply, navigate, t]);

  useEffect(
    () =>
      socket.listen((ev) => {
        if (ev.event === 'table' && ev.data.table.id === tableId) apply(ev.data, ev.data.myBets);
      }),
    [tableId, apply],
  );

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, []);

  const info = view ? phaseAt(view.round, now()) : null;
  const remainingMs = info ? Math.max(0, info.endsAt - now()) : 0;
  const seconds = Math.ceil(remainingMs / 1000);
  const roundMine = view && mine.roundId === view.round.id ? mine.bets : [];
  const placed = useMemo(() => sumBets(roundMine), [roundMine]);
  const placedTotal = totalOf(placed);
  const pendingTotal = totalOf(pending);
  const canBet = info?.phase === 'betting' && remainingMs > SEND_GUARD_MS && view?.round.status === 'betting' && view.table.status === 'open';

  useEffect(() => {
    if (scene.current) scene.current.interactive = !!canBet && !placing;
  }, [canBet, placing]);

  useEffect(() => {
    scene.current?.setBets(mergeBets(placed, pending));
  }, [placed, pending]);

  // Last seconds of betting: a tick per second.
  useEffect(() => {
    if (info?.phase !== 'betting' || seconds > WARN_S || seconds <= 0 || warned.current === seconds) return;
    warned.current = seconds;
    sfx.tick();
  }, [info?.phase, seconds]);

  // After payout, fetch this player's settled bets once to show the real payout.
  useEffect(() => {
    if (!view || view.round.status === 'betting' || view.round.status === 'locked') return;
    const roundId = view.round.id;
    if (!roundMine.length || refreshed.current === roundId) return;
    if (roundMine.every((b) => b.status !== 'placed')) return;
    refreshed.current = roundId;
    socket.request('table.join', { tableId }).then((v) => apply(v, v.myBets), () => {});
  }, [view, roundMine, tableId, apply]);

  // Celebrate once the result is on screen and the settled bets are known.
  useEffect(() => {
    if (!view || info?.phase !== 'result' || !roundMine.length || celebrated.current === view.round.id) return;
    if (roundMine.some((b) => b.status === 'placed')) return;
    celebrated.current = view.round.id;
    if (roundMine.every((b) => b.status === 'refunded')) {
      setLastWin(0);
      return toast(t('tables.refunded'));
    }
    const win = roundMine.reduce((s, b) => s + (b.payout ?? 0), 0);
    setLastWin(win);
    if (win > 0) {
      const big = win >= placedTotal * 10;
      big ? sfx.bigWin() : sfx.win();
      scene.current?.celebrate(win, 428, 180, big);
    } else sfx.lose();
  }, [view, info?.phase, roundMine, placedTotal, t]);

  const onSpot = (key: string) => {
    const { view: v, pending: p, chip: c, placing: busy } = state.current;
    if (!v || busy) return;
    const placedNow = totalOf(sumBets(state.current.mine.roundId === v.round.id ? state.current.mine.bets : []));
    const next = placedNow + totalOf(p) + c;
    if (next > v.table.maxBet) return toast(t('errors.bet_too_high'), 'error');
    if (totalOf(p) + c > useSession.getState().balance) return toast(t('errors.insufficient_funds'), 'error');
    sfx.chip();
    setPending(addChip(p, key, c));
  };

  const confirm = async () => {
    if (!view || !canBet || pendingTotal === 0 || placing) return;
    if (Object.values(pending).some((a) => a < view.table.minBet)) return toast(t('errors.bet_too_low'), 'error');
    setPlacing(true);
    try {
      const res = await socket.request('table.bet', { tableId, roundId: view.round.id, bets: toBetList(pending) });
      setMine({ roundId: view.round.id, bets: res.myBets });
      setPending({});
      useSession.getState().setBalance(res.balance);
      toast(t('tables.accepted'), 'success');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'internal';
      toast(t(`errors.${code}`), 'error');
    } finally {
      setPlacing(false);
    }
  };

  const game = view?.table.game;
  const lang = i18n.language;
  const warn = info?.phase === 'betting' && seconds <= WARN_S;
  const phaseLabel = !info
    ? t('tables.phase.connecting')
    : info.phase === 'revealing' && game === 'roulette'
      ? t('tables.rouletteRevealing')
      : t(`tables.phase.${info.phase}`);

  return (
    <GameLayout
      title={view ? view.table.name[lang === 'en' ? 'en' : 'vi'] : t('tables.live')}
      canvas={
        <>
          {view && (
            <PhaserView<Scene>
              create={() => (view.table.game === 'roulette' ? new RouletteTableScene() : new TaiXiuScene())}
              onReady={(s) => {
                scene.current = s;
                s.setRound(state.current.view!.round, now);
                if (s instanceof RouletteTableScene && seedRef.current) s.seedHistory(seedRef.current);
                s.events.on('spot', onSpot);
              }}
            />
          )}
          {/* Top-right is empty on both table layouts, so the timer never covers the felt. */}
          <div className="pointer-events-none absolute right-2 top-2 flex justify-end sm:right-3">
            <div
              role="status"
              aria-live="polite"
              className={`flex items-center gap-3 rounded-full border px-4 py-1.5 backdrop-blur ${
                warn ? 'animate-pulse border-red-400/80 bg-red-950/80 text-red-100' : 'border-gold-300/50 bg-ink-950/80 text-gold-100'
              }`}
            >
              <span className="text-sm font-semibold">{warn ? t('tables.closingSoon', { s: seconds }) : phaseLabel}</span>
              {info && seconds > 0 && <span className="font-display text-xl font-bold tabular-nums">{seconds}s</span>}
            </div>
          </div>
        </>
      }
      panel={
        <>
          {view && (
            <div className="flex items-center justify-between text-[11px] text-white/50">
              <span>{t('tables.round', { seq: view.round.seq })}</span>
              <span>{t('tables.players', { n: view.bettors, w: view.watchers })}</span>
            </div>
          )}
          {view && (
            <div className="rounded-xl border border-gold-300/20 bg-black/30 px-3 py-2">
              <div className="mb-2 text-xs font-semibold text-gold-100">
                {i18n.language === 'vi' ? 'Người chơi đã đặt cược' : 'Players betting this round'} ({view.bettors})
              </div>
              {view.players.length ? (
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {view.players.map((player) => (
                    <span key={player.uid} title={`UID ${player.uid}`} className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-xs text-white/85">
                      {player.displayName}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/45">{i18n.language === 'vi' ? 'Chưa có người đặt cược trong vòng này' : 'No bets placed this round'}</p>
              )}
            </div>
          )}
          {view?.table.status === 'paused' && <p className="rounded-lg bg-amber-900/40 px-3 py-2 text-xs text-amber-100">{t('tables.paused')}</p>}
          {view && <Pool view={view} />}
          <ChipSelector values={CHIP_VALUES} value={chip} onChange={setChip} />
          <Stat label={t('tables.pending')} value={formatChips(pendingTotal, lang)} accent />
          <Button variant="gold" size="lg" onClick={() => void confirm()} disabled={!canBet || placing || pendingTotal === 0}>
            {placing ? t('tables.placing') : t('tables.confirm')}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => setPending({})} disabled={placing || pendingTotal === 0}>
              {t('play.clear')}
            </Button>
            <Button
              size="sm"
              onClick={() => totalOf(lastBets) <= useSession.getState().balance && setPending(lastBets)}
              disabled={!canBet || placing || totalOf(lastBets) === 0}
            >
              {t('play.rebet')}
            </Button>
          </div>
          <Stat label={t('tables.placed')} value={formatChips(placedTotal, lang)} />
          {canBet && placedTotal > 0 && <p className="text-[11px] text-white/45">{t('tables.sameRound')}</p>}
          <Stat label={t('play.lastWin')} value={lastWin === null ? '—' : formatChips(lastWin, lang)} accent={!!lastWin} />
          {view && <History game={view.table.game} items={view.history} />}
          {view && <Fairness round={view.round} />}
          <Link to={`/play/${game === 'roulette' ? 'roulette' : 'sicbo'}`} className="text-center text-xs text-white/50 underline hover:text-white/80">
            {t('tables.solo')}
          </Link>
          <p className="mt-auto text-[11px] leading-snug text-white/40">{t('app.disclaimer')}</p>
        </>
      }
    />
  );
}

/** Live pool: Tài vs Xỉu for Tài Xỉu, the total for roulette. Other players' bets are only shown as sums. */
function Pool({ view }: { view: View }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (view.table.game === 'taixiu') {
    const tai = view.totals['big']?.amount ?? 0;
    const xiu = view.totals['small']?.amount ?? 0;
    const share = tai + xiu ? (tai / (tai + xiu)) * 100 : 50;
    return (
      <div className="rounded-xl border border-white/5 bg-black/25 px-3 py-2">
        <div className="text-[11px] uppercase tracking-widest text-white/40">{t('tables.pool')}</div>
        <div className="mt-1 flex justify-between text-sm font-semibold tabular-nums">
          <span className="text-[#ffd27a]">
            {t('tables.tai')} {formatChips(tai, lang)}
          </span>
          <span className="text-[#9fd8ff]">
            {formatChips(xiu, lang)} {t('tables.xiu')}
          </span>
        </div>
        <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-black/50">
          <div className="bg-[#d9a441] transition-[width] duration-500" style={{ width: `${share}%` }} />
          <div className="flex-1 bg-[#4a9bd6]" />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-white/40">
          <span>👤 {view.totals['big']?.players ?? 0}</span>
          <span>{view.totals['small']?.players ?? 0} 👤</span>
        </div>
      </div>
    );
  }
  const total = Object.values(view.totals).reduce((s, x) => s + x.amount, 0);
  return <Stat label={t('tables.pool')} value={formatChips(total, lang)} />;
}

function History({ game, items }: { game: View['table']['game']; items: RoundOutcome[] }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-widest text-white/40">{t('tables.history')}</div>
      <div className="flex flex-wrap gap-1">
        {items.slice(0, 16).map((o, i) => {
          if (game === 'taixiu') {
            const x = o as TaiXiuOutcome;
            const cls = x.side === 'tai' ? 'bg-[#8a5a12] text-[#ffe9b0]' : x.side === 'xiu' ? 'bg-[#123f6b] text-[#cfeaff]' : 'bg-[#4e1a85] text-white';
            const label = x.side === 'triple' ? t('tables.triple') : t(`tables.${x.side}`);
            return (
              <span key={i} title={`${x.dice.join('-')} · ${label}`} className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ${cls}`}>
                {x.total}
              </span>
            );
          }
          const r = o as RouletteOutcome;
          const color = rouletteColor(r.number);
          const cls = color === 'red' ? 'bg-[#b5132c]' : color === 'green' ? 'bg-[#0f7a45]' : 'bg-[#15131f] ring-1 ring-white/20';
          return (
            <span key={i} className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold tabular-nums text-white ${cls}`}>
              {r.number}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Fairness({ round }: { round: View['round'] }) {
  const { t } = useTranslation();
  return (
    <details className="rounded-xl border border-white/5 bg-black/25 px-3 py-2 text-[11px] text-white/60">
      <summary className="cursor-pointer text-white/70">{t('fairness.title')}</summary>
      <div className="mt-2 space-y-1.5 break-all font-mono">
        <div>
          <div className="font-sans text-white/40">{t('tables.seedHash')}</div>
          {round.seedHash}
        </div>
        {round.serverSeed && (
          <div>
            <div className="font-sans text-white/40">{t('tables.seed')}</div>
            {round.serverSeed}
          </div>
        )}
        <div className="font-sans text-white/40">Round ID: {round.id}</div>
        <p className="font-sans leading-snug text-white/45">{t('tables.verifyHint')}</p>
      </div>
    </details>
  );
}
