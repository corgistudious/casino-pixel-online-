import type { CardTableView } from '@casino/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GameLayout, Stat } from '../game/controls/GameLayout';
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
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';

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
    s.render(view, backs);
  }, [view, backs, labels]);

  const hand = view?.hand;
  const legal = hand?.phase === 'betting' && hand.toActSeat === view?.mySeat ? hand.legal : null;
  useEffect(() => {
    if (legal) setRaise(legal.minRaiseTo);
  }, [legal?.minRaiseTo, hand?.seq, hand?.street]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin', amount?: number) => {
    if (!hand) return;
    setBusy(true);
    try {
      await socket.request('card.act', { tableId, handId: hand.id, action, amount });
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    } finally {
      setBusy(false);
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

  return (
    <GameLayout
      title={view ? view.table.name[i18n.language === 'en' ? 'en' : 'vi'] : t('cards.lobby')}
      canvas={
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
          {legal && left !== null && (
            <div className={`pointer-events-none absolute right-3 top-2 rounded-full border px-4 py-1.5 text-sm font-bold backdrop-blur ${left <= 5 ? 'animate-pulse border-red-400/80 bg-red-950/80 text-red-100' : 'border-gold-300/50 bg-ink-950/80 text-gold-100'}`} role="status">
              {t('cards.yourTurn')} · {left}s
            </div>
          )}
          {view?.match && view.match.status !== 'active' && (
            <div className="absolute inset-x-0 top-1/3 mx-auto w-fit rounded-2xl border border-gold-300/60 bg-ink-950/90 px-6 py-4 text-center shadow-glow">
              <div className="font-display text-2xl font-extrabold text-gold-100">{view.match.winnerUid === me?.uid ? t('cards.matchWon') : view.match.winnerUid ? t('cards.matchLost') : t('cards.matchVoid')}</div>
              <Link to="/rank" className="mt-2 inline-block text-sm font-semibold text-white/80 underline">
                {t('rank.title')}
              </Link>
            </div>
          )}
        </>
      }
      panel={
        <>
          <RoomPanel engine="card" tableId={tableId} members={view?.seats ?? []} />
          {locked && (
            <RoomPasswordPrompt
              roomId={`card:${tableId}`}
              onClose={() => navigate('/custom-rooms')}
              onJoined={() => {
                setLocked(false);
                setJoinKey((k) => k + 1);
              }}
            />
          )}
          {cfg && (
            <div className="text-[11px] font-semibold text-white/55">
              {view.table.game === 'poker' ? t('cards.blinds', { sb: fmt(cfg.smallBlind), bb: fmt(cfg.bigBlind) }) : t('cards.ante', { ante: fmt(cfg.ante) })}
              {hand ? ` · ${t('cards.hand', { n: hand.seq })}` : ''}
              {view.match ? ` · ${t('cards.matchHands', { n: view.match.hands, max: view.match.maxHands })}` : ''}
            </div>
          )}
          <Stat label={t('cards.pot')} value={fmt(pot)} accent />
          {mySeat ? <Stat label={ranked ? t('cards.matchChips') : t('cards.myStack')} value={fmt(hand?.players.find((p) => p.seat === mySeat.seat)?.stack ?? mySeat.stack)} /> : null}

          {legal ? (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => void send('fold')} disabled={busy}>
                  {t('cards.fold')}
                </Button>
                {legal.canCheck ? (
                  <Button variant="emerald" onClick={() => void send('check')} disabled={busy}>
                    {t('cards.check')}
                  </Button>
                ) : (
                  <Button variant="emerald" onClick={() => void send('call')} disabled={busy}>
                    {t('cards.call', { n: fmt(legal.toCall) })}
                  </Button>
                )}
              </div>
              {legal.canRaise && legal.minRaiseTo < legal.maxRaiseTo && (
                <>
                  <input type="range" min={legal.minRaiseTo} max={legal.maxRaiseTo} step={cfg?.bigBlind ?? 1} value={raise} onChange={(e) => setRaise(Number(e.target.value))} className="accent-gold-300" aria-label={t('cards.raiseTo')} />
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      ['½', Math.floor(pot / 2)],
                      [t('cards.potShort'), pot],
                      ['2×', (hand?.currentBet ?? 0) * 2],
                    ].map(([label, v]) => (
                      <Button key={String(label)} size="sm" onClick={() => setRaise(Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Number(v))))}>
                        {label}
                      </Button>
                    ))}
                  </div>
                  <Button variant="gold" onClick={() => void send(hand!.currentBet > 0 ? 'raise' : 'bet', raise)} disabled={busy}>
                    {hand!.currentBet > 0 ? t('cards.raiseTo') : t('cards.bet')} {fmt(raise)}
                  </Button>
                </>
              )}
              <Button variant="ruby" onClick={() => void send('allin')} disabled={busy}>
                {t('cards.allInBtn')}
              </Button>
            </div>
          ) : mySeat ? (
            <p className="rounded-xl bg-black/25 px-3 py-2 text-xs text-white/60">{hand?.phase === 'betting' ? t('cards.waitTurn') : t('cards.nextHand')}</p>
          ) : null}

          {mySeat?.status === 'sitting_out' && (
            <Button variant="gold" onClick={() => void socket.request('card.back', { tableId }).then(apply, (err) => toast(errorText(t, err, i18n.language), 'error'))}>
              {t('cards.imBack')}
            </Button>
          )}
          {mySeat && (
            <Button size="sm" onClick={() => void stand()}>
              {ranked ? t('cards.forfeit') : t('cards.stand')}
            </Button>
          )}

          {!mySeat && !ranked && cfg && (
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="text-xs font-semibold text-white/60">{t('cards.chooseSeat')}</div>
              <div className="flex flex-wrap gap-1">
                {freeSeats.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={pickSeat === s ? 'gold' : 'glass'}
                    onClick={() => {
                      setPickSeat(s);
                      setBuyIn(Math.min(cfg.maxBuyIn, Math.max(cfg.minBuyIn, Math.min(balance, cfg.minBuyIn * 5))));
                    }}
                  >
                    {s + 1}
                  </Button>
                ))}
                {freeSeats.length === 0 && <span className="text-xs text-white/50">{t('cards.full')}</span>}
              </div>
              {pickSeat !== null && (
                <>
                  <input type="range" min={cfg.minBuyIn} max={Math.min(cfg.maxBuyIn, Math.max(cfg.minBuyIn, balance))} step={cfg.bigBlind} value={buyIn} onChange={(e) => setBuyIn(Number(e.target.value))} className="accent-gold-300" aria-label={t('cards.buyInLabel')} />
                  <Button variant="gold" onClick={() => void sit()} disabled={balance < cfg.minBuyIn}>
                    {t('cards.sitWith', { n: fmt(buyIn) })}
                  </Button>
                  {balance < cfg.minBuyIn && <p className="text-[11px] text-red-200">{t('errors.insufficient_funds')}</p>}
                </>
              )}
            </div>
          )}

          {hand && (
            <details className="rounded-xl border border-white/5 bg-black/25 px-3 py-2 text-[11px] text-white/60">
              <summary className="cursor-pointer font-semibold text-white/70">{t('fairness.title')}</summary>
              <div className="mt-2 space-y-1 break-all font-mono">
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
            </details>
          )}
          <Link to="/rooms" className="text-center text-xs text-white/50 underline">
            {t('cards.backToLobby')}
          </Link>
          <p className="mt-auto text-[11px] leading-snug text-white/40">{ranked ? t('cards.rankedNote') : t('app.disclaimer')}</p>
        </>
      }
    />
  );
}
