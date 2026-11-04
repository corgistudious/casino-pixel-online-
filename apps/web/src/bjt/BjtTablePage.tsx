import { cardValue, type BjtPlayerView, type BjtSeatView, type BjtTableView, type Card } from '@casino/shared';
import { PlayerAvatar, PlayerRankBadge } from '../players/identity';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { InsurancePrompt } from '../game/controls/InsurancePrompt';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { ApiError } from '../net/api';
import { socket } from '../net/socket';
import { PlayerTrigger } from '../players/PlayerActions';
import { RoomPasswordPrompt } from '../rooms/RoomForm';
import { RoomPanel } from '../rooms/RoomPanel';
import { useSession } from '../store/session';
import { FitStage } from '../ui/game/FitStage';
import { formFactor } from '../lib/device';
import { GameButton } from '../ui/game/GameButton';
import { GameCard, GameStat, GameTimer } from '../ui/game/GameParts';
import { GameTableLayout, type GameTool } from '../ui/game/GameTableLayout';
import { toast } from '../ui/toast';
import { CardDefs, CardSvg } from './CardSvg';
import { TableSkinCanvas } from '../cosmetics/TableSkinCanvas';
import { skinColors } from '../cosmetics/tableArt';
import { celebrateWin } from '../cosmetics/VictoryEffect';

/** Seat positions on the felt (percent of width/height), left to right along the rail. */
const SEAT_POS = [
  { left: 10, top: 56 },
  { left: 29, top: 70 },
  { left: 50, top: 75 },
  { left: 71, top: 70 },
  { left: 90, top: 56 },
];
/** Portrait felt (phones, V7.1): three seats across the middle, two below (left to right = seat order). */
const SEAT_POS_PORTRAIT = [
  { left: 17, top: 50 },
  { left: 33, top: 81 },
  { left: 50, top: 50 },
  { left: 67, top: 81 },
  { left: 83, top: 50 },
];
const CHIPS = [100, 500, 1_000, 5_000, 10_000, 50_000];

/** Shared Blackjack table: up to 5 players against the dealer, synchronised over the WebSocket. */
export function BjtTablePage() {
  const { tableId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [view, setView] = useState<BjtTableView | null>(null);
  const tableSkin = useSession((s) => s.user?.tableSkin ?? null);
  const railCss = `#${skinColors(tableSkin).railDark.toString(16).padStart(6, '0')}`;
  const [busy, setBusy] = useState(false);
  const [bet, setBet] = useState(0);
  const [now, setNow] = useState(Date.now());
  const status = useSession((s) => s.status);
  const me = useSession((s) => s.user);
  const balance = useSession((s) => s.balance);
  const fmt = (n: number) => formatChips(n, i18n.language);
  const lastRound = useRef<string | null>(null);
  // Phones are portrait-only (V7.1); a tablet held upright also gets the portrait felt. Fixed per visit.
  const [portrait] = useState(() => formFactor() === 'phone' || window.innerHeight > window.innerWidth);
  const seatPos = portrait ? SEAT_POS_PORTRAIT : SEAT_POS;

  const fail = (err: unknown) => toast(errorText(t, err, i18n.language), 'error');
  const [locked, setLocked] = useState(false);
  const join = () =>
    void socket.request('bjt.join', { tableId }).then(setView, (err) => {
      // A private room asks for its password; removed players and closed rooms go back to the room list.
      if (err instanceof ApiError && err.code === 'room_locked') return setLocked(true);
      fail(err);
      if (err instanceof ApiError && (err.code === 'room_kicked' || err.code === 'room_closed')) navigate('/custom-rooms', { replace: true });
    });
  // Join (and re-join after every reconnect, which also refreshes the state); leave on exit.
  useEffect(() => {
    if (status === 'online') join();
  }, [status, tableId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => void socket.request('bjt.leave', { tableId }).catch(() => {}), [tableId]);
  useEffect(
    () =>
      socket.listen((ev) => {
        if (ev.event === 'bjt' && ev.data.table.id === tableId) setView(ev.data);
      }),
    [tableId],
  );
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // The broadcast view is the same for everyone; find my seat by UID.
  const mySeat = view?.seats.find((s) => s.uid === me?.uid)?.seat ?? null;
  const round = view?.round ?? null;
  const mine = round?.players.find((p) => p.seat === mySeat) ?? null;
  const left = round?.deadline ? Math.max(0, Math.ceil((round.deadline - now) / 1000)) : null;

  // Sound on results.
  useEffect(() => {
    if (round?.phase === 'done' && lastRound.current !== round.id && mine) {
      lastRound.current = round.id;
      const staked = mine.hands.reduce((a, h) => a + h.bet * (h.doubled ? 2 : 1), 0) + (mine.insurance ?? 0);
      if (mine.payout > staked) {
        sfx.win();
        celebrateWin(`bjt:${round.id}`);
      }
      else if (mine.payout === 0) sfx.lose();
    }
  }, [round?.phase, round?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (type: 'bjt.sit' | 'bjt.stand' | 'bjt.bet' | 'bjt.act', payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await socket.request(type as never, { tableId, ...payload } as never);
      if (type === 'bjt.sit') setView(res as unknown as BjtTableView);
      if (type === 'bjt.stand' && (res as { leaving: boolean }).leaving) toast(t('bjt.leavingNote'), 'info');
      return true;
    } catch (err) {
      fail(err);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const act = (action: string, amount?: number) => round && void send('bjt.act', { roundId: round.id, action, ...(amount !== undefined ? { amount } : {}) });

  if (!view) {
    return (
      <>
        <GameTableLayout
          backTo="/bjt"
          title={t('games.blackjack.name')}
          status={<GameTimer label={t('app.loading')} />}
          tools={[]}
          stage={<div className="gstage-canvas" />}
          controls={<p className="gbar-note">{t('app.loading')}</p>}
        />
        {locked && (
          <RoomPasswordPrompt
            roomId={`bj:${tableId}`}
            onClose={() => navigate('/custom-rooms')}
            onJoined={() => {
              setLocked(false);
              join();
            }}
          />
        )}
      </>
    );
  }
  const tb = view.table;
  const hand = mine && round?.phase === 'playing' && round.turnSeat === mySeat ? mine.hands[mine.active] : undefined;
  const canDouble = !!hand && hand.cards.length === 2 && !hand.doubled && balance >= hand.bet;
  const canSplit = !!hand && hand.cards.length === 2 && mine!.hands.length < 4 && cardValue(hand.cards[0] as Card) === cardValue(hand.cards[1] as Card) && balance >= hand.bet;
  const turnSeat = round?.turnSeat ?? null;
  const turnName = view.seats.find((s) => s.seat === turnSeat)?.displayName;

  let banner = '';
  if (!round) banner = t('bjt.nextRound');
  else if (round.phase === 'betting') banner = t('bjt.betting');
  else if (round.phase === 'insurance') banner = t('bjt.insurance');
  else if (round.phase === 'playing') banner = turnSeat === mySeat ? t('bjt.yourTurn', { s: left ?? 0 }).replace(/\s*·.*$/, '') : t('bjt.turnOf', { name: turnName ?? '' });
  else banner = t('bjt.done');
  const myTurn = round?.phase === 'playing' && turnSeat === mySeat;
  const insuranceOpen = round?.phase === 'insurance' && !!mine && mine.insurance === null;
  const lang = i18n.language;

  const roomTool: GameTool = {
    id: 'room',
    label: t('gameUi.room'),
    icon: 'room',
    content: (
      <>
        <GameCard title={tb.name[lang === 'en' ? 'en' : 'vi']}>
          <p className="text-xs text-white/60">{t('bjt.limits', { min: fmt(tb.minBet), max: fmt(tb.maxBet) })}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-gold-100/60">Blackjack pays 3 to 2 · Insurance pays 2 to 1</p>
        </GameCard>
        <RoomPanel engine="bj" tableId={tableId} members={view.seats} />
        <div className="flex flex-wrap gap-2">
          {mySeat !== null && (
            <GameButton size="sm" tone="ghost-danger" disabled={busy} onClick={() => void send('bjt.stand', {})}>
              {t('bjt.stand')}
            </GameButton>
          )}
          <GameButton size="sm" onClick={() => navigate('/bjt')}>
            {t('bjt.leaveTable')}
          </GameButton>
        </div>
        {round && <p className="break-all text-[10px] text-white/35">{t('bjt.fair', { hash: round.seedHash.slice(0, 16) })}…</p>}
      </>
    ),
  };

  let controls: ReactNode;
  if (mySeat === null) controls = <p className="gbar-note">{t('bjt.sitToPlay')}</p>;
  else if (round?.phase === 'betting' && !mine)
    controls = (
      <>
        <div className="gbar-group">
          {CHIPS.filter((c) => c <= tb.maxBet).map((c) => (
            <GameButton key={c} size="sm" onClick={() => setBet((b) => Math.min(tb.maxBet, b + c))}>
              +{fmt(c)}
            </GameButton>
          ))}
        </div>
        <div className="gbar-group">
          <GameStat label={t('play.bet')} value={fmt(bet)} accent />
          <GameButton size="sm" onClick={() => setBet(0)} disabled={!bet}>
            {t('play.clear')}
          </GameButton>
          <GameButton tone="primary" loading={busy} disabled={bet < tb.minBet || bet > balance} onClick={() => void send('bjt.bet', { amount: bet }).then((ok) => ok && sfx.chip())}>
            {t('bjt.placeBet', { amount: fmt(bet) })}
          </GameButton>
        </div>
      </>
    );
  else if (round?.phase === 'betting' && mine) controls = <p className="gbar-note">✓ {t('bjt.betPlaced', { amount: fmt(mine.bet) })} — {t('bjt.waitingBets')}</p>;
  else if (insuranceOpen) controls = <p className="gbar-note">{t('bjt.insurance')}</p>;
  else if (round?.phase === 'insurance') controls = <p className="gbar-note">{t('blackjack.insurance.waiting')}</p>;
  else if (hand)
    controls = (
      <div className="gbar-group">
        <GameButton tone="primary" loading={busy} onClick={() => act('hit')}>
          {t('play.hit')}
        </GameButton>
        <GameButton tone="positive" disabled={busy} onClick={() => act('stand')}>
          {t('play.stand')}
        </GameButton>
        <GameButton tone="danger" disabled={busy || !canDouble} onClick={() => act('double')}>
          {t('play.double')}
        </GameButton>
        <GameButton tone="neutral" disabled={busy || !canSplit} onClick={() => act('split')}>
          {t('play.split')}
        </GameButton>
      </div>
    );
  else if (round && !mine && round.phase !== 'done') controls = <p className="gbar-note">{t('bjt.waitNext')}</p>;
  else controls = <p className="gbar-note">{round?.phase === 'done' ? t('bjt.nextRound') : banner}</p>;

  return (
    <GameTableLayout
      backTo="/bjt"
      title={tb.name[lang === 'en' ? 'en' : 'vi']}
      subtitle={t('bjt.limits', { min: fmt(tb.minBet), max: fmt(tb.maxBet) })}
      status={<GameTimer label={banner} seconds={round && round.phase !== 'done' ? left : null} warn={myTurn && left !== null && left <= 5} />}
      tools={[roomTool]}
      stage={
        <FitStage ratio={portrait ? 3 / 4 : 16 / 9} designWidth={portrait ? 360 : 720}>
          {(scale) => {
            const k = Math.min(1.6, Math.max(0.6, scale));
            return (
              <>
                <CardDefs />
                <section className="relative isolate h-full w-full overflow-hidden rounded-[2.5rem] border-[10px] shadow-[inset_0_0_80px_rgba(0,0,0,0.6),0_20px_40px_-20px_rgba(0,0,0,0.9)]" style={{ borderColor: railCss }}>
                  {/* The viewer's own table skin (personal): other players keep seeing theirs. */}
                  <div className="absolute inset-0 -z-10">
                    <TableSkinCanvas skinId={tableSkin} layout="arc" />
                  </div>
                  <div className="pointer-events-none absolute inset-6 rounded-[50%/40%] border border-gold-300/30" />
                  <div className={`pointer-events-none absolute left-1/2 w-[70%] -translate-x-1/2 ${portrait ? 'top-[33%]' : 'top-[44%]'} text-center text-[10px] uppercase tracking-[0.3em] text-gold-100/50`}>Blackjack pays 3 to 2 · Insurance pays 2 to 1</div>
                  {/* Dealer */}
                  <div className="absolute left-1/2 top-[6%] flex -translate-x-1/2 flex-col items-center gap-1">
                    <span className="rounded-full bg-black/40 px-3 py-0.5 text-xs font-label text-gold-100">
                      {t('bjt.dealer')}
                      {round?.dealerTotal !== null && round?.dealerTotal !== undefined ? ` · ${round.dealerTotal}` : ''}
                    </span>
                    <div className="flex -space-x-6">
                      {(round?.dealer ?? []).map((c, i) => (
                        <CardSvg key={`${round!.id}-d${i}-${c ?? 'x'}`} card={c} width={Math.round(58 * k)} className="animate-[dealIn_.35s_ease-out]" />
                      ))}
                    </div>
                  </div>
                  {/* Seats */}
                  {seatPos.slice(0, tb.seats).map((pos, seat) => {
                    const s = view.seats.find((x) => x.seat === seat);
                    const p = round?.players.find((x) => x.seat === seat);
                    return (
                      <div key={seat} className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 ${portrait ? 'w-[32%]' : 'w-[18%]'}`} style={{ left: `${pos.left}%`, top: `${pos.top}%` }}>
                        {p && <Hands p={p} active={turnSeat === seat} fmt={fmt} t={t} done={round?.phase === 'done'} k={k} />}
                        {s ? (
                          <PlayerTrigger uid={s.uid} label={s.displayName} context={`table:bj:${tableId}`} className="rounded-full">
                            <SeatPlate s={s} turn={turnSeat === seat} me={seat === mySeat} t={t} compact={k < 0.85} />
                          </PlayerTrigger>
                        ) : mySeat === null ? (
                          <button type="button" aria-label={`${t('bjt.sit')} ${seat + 1}`} disabled={busy || tb.status !== 'open'} onClick={() => void send('bjt.sit', { seat })} className="min-h-8 rounded-full border border-dashed border-gold-300/60 bg-black/30 px-3 py-2 text-xs font-label text-gold-100 hover:bg-gold-300/15">
                            {t('bjt.sit')}
                          </button>
                        ) : (
                          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] text-white/35">{t('bjt.emptySeat')}</span>
                        )}
                      </div>
                    );
                  })}
                </section>
                {insuranceOpen && (
                  <div className="gstage-overlay">
                    <div>
                      <InsurancePrompt key={round!.id} max={Math.min(Math.floor(mine!.bet / 2), balance)} deadline={round!.deadline ?? undefined} busy={busy} onDecide={(n) => act('insurance', n)} />
                    </div>
                  </div>
                )}
              </>
            );
          }}
        </FitStage>
      }
      controls={controls}
    />
  );
}

function SeatPlate({ s, turn, me, t, compact = false }: { s: BjtSeatView; turn: boolean; me: boolean; t: (k: string) => string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-full border px-2 py-1 backdrop-blur ${turn ? 'border-cyan-300 bg-cyan-500/20 shadow-[0_0_16px_rgba(90,216,255,0.7)]' : me ? 'border-gold-300/70 bg-black/50' : 'border-white/15 bg-black/45'}`}>
      <div className={s.online ? '' : 'opacity-50 grayscale'}>
        <PlayerAvatar player={s} size={compact ? 24 : 30} />
      </div>
      <div className="min-w-0 leading-tight">
        <div className={`flex items-center gap-1 ${compact ? 'max-w-20' : 'max-w-28'}`}>
          <span className="truncate text-xs font-strong text-white">{s.displayName}</span>
          <PlayerRankBadge rank={s.rank} size={13} />
        </div>
        {(!compact || s.leaving || !s.online) && <div className="text-[9px] text-white/50">{s.leaving ? t('bjt.leaving') : !s.online ? t('bjt.offline') : `UID ${s.uid}`}</div>}
      </div>
    </div>
  );
}

function Hands({ p, active, fmt, t, done, k = 1 }: { p: BjtPlayerView; active: boolean; fmt: (n: number) => string; t: (k: string, o?: Record<string, unknown>) => string; done: boolean; k?: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-2">
        {p.hands.map((h, i) => (
          <div key={i} className={`flex flex-col items-center rounded-xl p-1 ${active && i === p.active && !done ? 'ring-2 ring-cyan-300' : ''}`}>
            <div className="flex -space-x-7">
              {h.cards.map((c, j) => (
                <CardSvg key={`${i}-${j}-${c}`} card={c} width={Math.round((p.hands.length > 2 ? 34 : 44) * k)} className="animate-[dealIn_.35s_ease-out]" />
              ))}
            </div>
            <span className={`mt-0.5 rounded-full px-1.5 text-[10px] font-strong ${h.total > 21 ? 'bg-ruby-500/70 text-white' : 'bg-black/60 text-white'}`}>
              {h.total}
              {h.outcome && done ? ` · ${t(`blackjack.outcomes.${h.outcome}`)}` : ''}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 text-[10px]">
        <span className="rounded-full bg-gold-300/90 px-1.5 font-strong text-ink-900">{fmt(p.bet)}</span>
        {!!p.insurance && <span className="rounded-full bg-cyan-400/80 px-1.5 font-strong text-ink-900">{t('bjt.insured', { amount: fmt(p.insurance) })}</span>}
        {done && p.payout > 0 && <span className="rounded-full bg-emerald-400/90 px-1.5 font-strong text-ink-900">{t('bjt.won', { amount: fmt(p.payout) })}</span>}
      </div>
    </div>
  );
}
