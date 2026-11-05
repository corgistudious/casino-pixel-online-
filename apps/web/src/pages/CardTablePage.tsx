import type { CardTableView } from '@casino/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PhaserView } from '../game/PhaserView';
import { CardTableScene, type CardBackLook } from '../game/scenes/CardTableScene';
import { libraryCardBack } from '../cosmetics/cardBackArt';
import { RoomPasswordPrompt } from '../rooms/RoomForm';
import { RoomPanel } from '../rooms/RoomPanel';
import { usePlayerMenu } from '../players/PlayerActions';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { clockOffset } from '../lib/tables';
import { ApiError } from '../net/api';
import { socket } from '../net/socket';
import { useCatalog } from '../store/catalog';
import { useSession } from '../store/session';
import { toast } from '../ui/toast';
import { GameButton } from '../ui/game/GameButton';
import { ActionIcon } from '../ui/game/ActionIcons';
import { GameCard, GameStat, GameTimer } from '../ui/game/GameParts';
import { GameTableLayout, type GameTool } from '../ui/game/GameTableLayout';

const HAND_LABELS = ['high_card', 'pair', 'two_pair', 'trips', 'straight', 'flush', 'full_house', 'quads', 'straight_flush', 'sap', 'lieng', 'anh', 'diem'];

/** A Poker / Liêng / Xì Tố table. The server decides everything; this screen shows its view and sends actions. */
export function CardTablePage() {
  const { tableId = '' } = useParams();
  return <CardTable key={tableId} tableId={tableId} />;
}

function CardTable({ tableId }: { tableId: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const status = useSession((s) => s.status);
  const me = useSession((s) => s.user);
  const catalog = useCatalog((c) => c.items);
  const scene = useRef<CardTableScene | null>(null);
  const [view, setView] = useState<CardTableView | null>(null);
  const [raise, setRaise] = useState(0);
  const [buyIn, setBuyIn] = useState(0);
  const [pickSeat, setPickSeat] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [joinKey, setJoinKey] = useState(0);
  const [, setTick] = useState(0);
  const samples = useRef<number[]>([]);
  const offset = useRef(0);
  const now = useCallback(() => Date.now() + offset.current, []);
  const viewRef = useRef(view);
  viewRef.current = view;
  const fmt = (n: number) => formatChips(n, i18n.language);

  const apply = useCallback(
    (v: CardTableView) => {
      const prev = viewRef.current;
      // A seated player keeps their private view (own cards); the public broadcast for the same table is ignored.
      if (v.mySeat === null && me && v.seats.some((s) => s.uid === me.uid) && prev?.mySeat !== null && prev) return;
      samples.current = [...samples.current.slice(-7), v.serverNow - Date.now()];
      offset.current = clockOffset(samples.current);
      setView(v);
    },
    [me],
  );

  useEffect(() => {
    if (status !== 'online') return;
    let alive = true;
    socket.request('card.join', { tableId }).then(
      (v) => alive && apply(v),
      (err) => {
        // A private room asks for its password; removed players and closed rooms go back to the room list.
        if (err instanceof ApiError && err.code === 'room_locked') return setLocked(true);
        toast(errorText(t, err, i18n.language), 'error');
        if (err instanceof ApiError && err.code === 'table_not_found') navigate('/rooms', { replace: true });
        if (err instanceof ApiError && (err.code === 'room_kicked' || err.code === 'room_closed')) navigate('/custom-rooms', { replace: true });
      },
    );
    return () => {
      alive = false;
      socket.request('card.leave', { tableId }).catch(() => {});
    };
  }, [status, tableId, apply, navigate, t, i18n.language, joinKey]);

  useEffect(() => socket.listen((ev) => ev.event === 'card' && ev.data.table.id === tableId && apply(ev.data)), [tableId, apply]);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  // Each seat's equipped card back (cosmetic), or the classic back.
  const backs = useMemo(() => {
    const out: Record<number, CardBackLook | undefined> = {};
    for (const s of view?.seats ?? []) {
      // The SEAT OWNER's back (public cosmetic): every viewer sees each player's own choice.
      const item = s.cardBack ? catalog[s.cardBack] : undefined;
      const art = libraryCardBack(item?.style?.art ?? s.cardBack);
      if (art) out[s.seat] = { key: `cardback-lib-${s.cardBack}`, colors: [], royal: false, art };
      else if (item?.style) out[s.seat] = { key: `cardback-${item.id}`, colors: item.style.colors, royal: item.style.art === 'vuong_gia' };
    }
    return out;
  }, [view?.seats, catalog]);

  const labels = useMemo(
    () => ({
      fold: t('cards.folded'),
      allIn: t('cards.allIn'),
      leaving: t('cards.leaving'),
      sittingOut: t('cards.sittingOut'),
      pot: t('cards.pot'),
      ...Object.fromEntries(HAND_LABELS.map((k) => [`hand_${k}`, t(`cards.hands.${k}`)])),
    }),
    [t],
  );

  useEffect(() => {
    const s = scene.current;
    if (!s || !view) return;
    s.setLabels(labels);
    s.setStageLight(view.table.game === 'xito');
    s.render(view, backs);
  }, [view, backs, labels]);

  const hand = view?.hand;
  const legal = hand?.phase === 'betting' && hand.toActSeat === view?.mySeat ? hand.legal : null;
  useEffect(() => {
    if (legal) setRaise(legal.minRaiseTo);
  }, [legal?.minRaiseTo, hand?.seq, hand?.street]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin', amount?: number) => {
    if (!hand || busy) return;
    setBusy(true);
    setActing(action);
    try {
      await socket.request('card.act', { tableId, handId: hand.id, action, amount });
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    } finally {
      setBusy(false);
      setActing(null);
    }
  };

  const sit = async () => {
    if (pickSeat === null) return;
    try {
      apply(await socket.request('card.sit', { tableId, seat: pickSeat, buyIn }));
      setPickSeat(null);
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    }
  };

  const stand = async () => {
    try {
      const r = await socket.request('card.stand', { tableId });
      if (r.leaving) toast(t('cards.leaveAfterHand'));
      if (view?.table.mode === 'ranked') navigate('/rooms');
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    }
  };

  const cfg = view?.table.config;
  const mySeat = view?.seats.find((s) => s.seat === view.mySeat);
  const balance = useSession((s) => s.balance);
  const freeSeats = cfg ? Array.from({ length: cfg.seats }, (_, i) => i).filter((i) => !view!.seats.some((s) => s.seat === i)) : [];
  const ranked = view?.table.mode === 'ranked';
  const left = hand?.deadline ? Math.max(0, Math.ceil((hand.deadline - now()) / 1000)) : null;
  const pot = hand?.pot ?? 0;

  const myStack = mySeat ? (hand?.players.find((p) => p.seat === mySeat.seat)?.stack ?? mySeat.stack) : 0;
  const configLine = cfg
    ? `${view.table.game === 'poker' ? t('cards.blinds', { sb: fmt(cfg.smallBlind), bb: fmt(cfg.bigBlind) }) : t('cards.ante', { ante: fmt(cfg.ante) })}${hand ? ` · ${t('cards.hand', { n: hand.seq })}` : ''}${view.match ? ` · ${t('cards.matchHands', { n: view.match.hands, max: view.match.maxHands })}` : ''}`
    : '';
  const passwordPrompt = locked && (
    <RoomPasswordPrompt
      roomId={`card:${tableId}`}
      onClose={() => navigate('/custom-rooms')}
      onJoined={() => {
        setLocked(false);
        setJoinKey((k) => k + 1);
      }}
    />
  );
  const canvas = (
    <>
      <PhaserView<CardTableScene>
        create={() => new CardTableScene()}
        onReady={(s) => {
          scene.current = s;
          s.setClock(now);
          s.setSeatHandler((uid, at) => usePlayerMenu.getState().show({ uid, context: `table:card:${tableId}`, rect: { top: at.y, bottom: at.y, left: at.x, right: at.x } }));
          s.setLabels(labels);
          if (viewRef.current) s.render(viewRef.current, backs);
        }}
      />
      {/* Which back each seat shows (seat owner's cosmetic), for QA; no card data. */}
      <span hidden data-card-backs={JSON.stringify(Object.fromEntries(Object.entries(backs).map(([seat, b]) => [seat, b?.key ?? null])))} />
      {view?.match && view.match.status !== 'active' && (
        <div className="absolute inset-x-0 top-1/3 mx-auto w-fit rounded-2xl border border-gold-300/60 bg-ink-950/90 px-6 py-4 text-center shadow-glow">
          <div className="font-display text-2xl font-extrabold text-gold-100">{view.match.winnerUid === me?.uid ? t('cards.matchWon') : view.match.winnerUid ? t('cards.matchLost') : t('cards.matchVoid')}</div>
          <Link to="/rank" className="mt-2 inline-block text-sm font-semibold text-white/80 underline">
            {t('rank.title')}
          </Link>
        </div>
      )}
    </>
  );

  // Table layout for Poker, Liêng and Xì Tố: HUD · centred table · bottom control bar · floating tools.
  const standButton = mySeat && (
    <GameButton size="sm" onClick={() => void stand()}>
      {ranked ? t('cards.forfeit') : t('cards.stand')}
    </GameButton>
  );
  const tools: GameTool[] = [
    {
      id: 'room',
      label: t('gameUi.room'),
      icon: 'room',
      content: (
        <>
          <RoomPanel engine="card" tableId={tableId} members={view?.seats ?? []} />
          {configLine && <GameCard><p className="text-xs font-semibold text-white/65">{configLine}</p></GameCard>}
          {standButton}
          <Link to="/rooms" className="text-center text-xs text-white/55 underline">
            {t('cards.backToLobby')}
          </Link>
          <p className="text-[11px] leading-snug text-white/40">{ranked ? t('cards.rankedNote') : t('app.disclaimer')}</p>
        </>
      ),
    },
    {
      id: 'info',
      label: t('gameUi.info'),
      icon: 'info',
      content: hand ? (
        <GameCard title={t('fairness.title')}>
          <div className="space-y-1 break-all font-mono text-[11px] text-white/60">
            <div>
              <span className="font-sans text-white/40">{t('tables.seedHash')}</span> {hand.seedHash}
            </div>
            {hand.serverSeed && (
              <div>
                <span className="font-sans text-white/40">{t('tables.seed')}</span> {hand.serverSeed}
              </div>
            )}
            <p className="font-sans text-white/45">{t('cards.fairHint')}</p>
          </div>
        </GameCard>
      ) : (
        <p className="text-xs text-white/50">{t('cards.nextHand')}</p>
      ),
    },
  ];
  const raiseLabel = hand && hand.currentBet > 0 ? t('cards.raiseTo') : t('cards.bet');
const raiseStep = cfg?.bigBlind ?? 1;
  return (
    <GameTableLayout
      title={view ? view.table.name[i18n.language === 'en' ? 'en' : 'vi'] : t('cards.lobby')}
      subtitle={configLine}
      status={
        legal && left !== null ? (
          <GameTimer label={t('cards.yourTurn')} seconds={left} warn={left <= 5} />
        ) : hand?.phase === 'betting' && hand.toActSeat !== null ? (
          <GameTimer label={t('gameUi.turnOf', { name: view?.seats.find((x) => x.seat === hand.toActSeat)?.displayName ?? '' })} seconds={left} />
        ) : (
          <GameTimer label={view ? t('gameUi.waiting') : t('app.loading')} />
        )
      }
      tools={tools}
      stage={
        <div className="gstage-canvas">
          {canvas}
          {passwordPrompt}
        </div>
      }
      controls={
        <>
          <div className="gbar-group gbar-group--wide">
            <GameStat label={t('cards.pot')} value={fmt(pot)} accent />
            {mySeat && <GameStat label={ranked ? t('cards.matchChips') : t('cards.myStack')} value={fmt(myStack)} />}
          </div>
          {legal ? (
            <div className="paction-wrap">
              {legal.canRaise && legal.minRaiseTo < legal.maxRaiseTo && (
                <div className="praise">
                  <button type="button" className="praise-step" aria-label={`− ${fmt(raiseStep)}`} disabled={busy || raise <= legal.minRaiseTo} onClick={() => setRaise((r) => Math.max(legal.minRaiseTo, r - raiseStep))}>
                    −
                  </button>
                  <div className="praise-value" aria-live="polite">{fmt(raise)}</div>
                  <button type="button" className="praise-step" aria-label={`+ ${fmt(raiseStep)}`} disabled={busy || raise >= legal.maxRaiseTo} onClick={() => setRaise((r) => Math.min(legal.maxRaiseTo, r + raiseStep))}>
                    +
                  </button>
                  <GameButton size="sm" tone="danger" loading={acting === 'allin'} disabled={busy} onClick={() => void send('allin')}>
                    {t('gameUi.allIn')}
                  </GameButton>
                  <div className="praise-slider flex items-center gap-2">
                    <input
                      type="range"
                      className="praise-range"
                      min={legal.minRaiseTo}
                      max={legal.maxRaiseTo}
                      step={cfg?.bigBlind ?? 1}
                      value={raise}
                      onChange={(e) => setRaise(Number(e.target.value))}
                      aria-label={t('cards.raiseTo')}
                      style={{ '--p': `${((raise - legal.minRaiseTo) / Math.max(1, legal.maxRaiseTo - legal.minRaiseTo)) * 100}%` } as React.CSSProperties}
                    />
                    {[
                      ['½', Math.floor(pot / 2)],
                      [t('cards.potShort'), pot],
                      ['2×', (hand?.currentBet ?? 0) * 2],
                    ].map(([label, v]) => (
                      <GameButton key={String(label)} size="sm" disabled={busy} onClick={() => setRaise(Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Number(v))))}>
                        {label}
                      </GameButton>
                    ))}
                  </div>
                </div>
              )}
              <div className="pactions">
                <GameButton big tone="danger" icon={<ActionIcon name="fold" />} loading={acting === 'fold'} disabled={busy} onClick={() => void send('fold')}>
                  {t('cards.fold')}
                </GameButton>
                {legal.canCheck ? (
                  <GameButton big tone="sapphire" icon={<ActionIcon name="check" />} loading={acting === 'check'} disabled={busy} onClick={() => void send('check')}>
                    {t('cards.check')}
                  </GameButton>
                ) : (
                  <GameButton big tone="sapphire" icon={<ActionIcon name="call" />} detail={fmt(legal.toCall)} loading={acting === 'call'} disabled={busy} onClick={() => void send('call')}>
                    {t('gameUi.call')}
                  </GameButton>
                )}
                {legal.canRaise && legal.minRaiseTo < legal.maxRaiseTo ? (
                  <GameButton big tone="primary" icon={<ActionIcon name="raise" />} detail={fmt(raise)} loading={acting === 'raise' || acting === 'bet'} disabled={busy} onClick={() => void send(hand!.currentBet > 0 ? 'raise' : 'bet', raise)}>
                    {raiseLabel}
                  </GameButton>
                ) : (
                  <GameButton big tone="vip" icon={<ActionIcon name="allin" />} loading={acting === 'allin'} disabled={busy} onClick={() => void send('allin')}>
                    {t('gameUi.allIn')}
                  </GameButton>
                )}
              </div>
            </div>
          ) : mySeat ? (
            <div className="gbar-group">
              <p className="gbar-note">{hand?.phase === 'betting' ? t('cards.waitTurn') : t('cards.nextHand')}</p>
              {mySeat.status === 'sitting_out' && (
                <GameButton tone="primary" onClick={() => void socket.request('card.back', { tableId }).then(apply, (err) => toast(errorText(t, err, i18n.language), 'error'))}>
                  {t('cards.imBack')}
                </GameButton>
              )}
              {standButton}
            </div>
          ) : !ranked && cfg ? (
            <>
              <div className="gbar-group" role="group" aria-label={t('cards.chooseSeat')}>
                <span className="gbar-note">{t('cards.chooseSeat')}</span>
                {freeSeats.map((seatNo) => (
                  <GameButton
                    key={seatNo}
                    size="sm"
                    selected={pickSeat === seatNo}
                    aria-label={t('gameUi.seat', { n: seatNo + 1 })}
                    onClick={() => {
                      setPickSeat(seatNo);
                      setBuyIn(Math.min(cfg.maxBuyIn, Math.max(cfg.minBuyIn, Math.min(balance, cfg.minBuyIn * 5))));
                    }}
                  >
                    {seatNo + 1}
                  </GameButton>
                ))}
                {freeSeats.length === 0 && <span className="gbar-note">{t('cards.full')}</span>}
              </div>
              {pickSeat !== null && (
                <div className="gbar-group">
                  <input type="range" className="grange" min={cfg.minBuyIn} max={Math.min(cfg.maxBuyIn, Math.max(cfg.minBuyIn, balance))} step={cfg.bigBlind} value={buyIn} onChange={(e) => setBuyIn(Number(e.target.value))} aria-label={t('cards.buyInLabel')} />
                  <GameButton tone="primary" onClick={() => void sit()} disabled={balance < cfg.minBuyIn}>
                    {t('cards.sitWith', { n: fmt(buyIn) })}
                  </GameButton>
                  {balance < cfg.minBuyIn && <span className="gbar-note text-red-200">{t('errors.insufficient_funds')}</span>}
                </div>
              )}
            </>
          ) : null}
        </>
      }
    />
  );
}
