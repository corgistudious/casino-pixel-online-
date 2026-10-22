import { ECONOMY, SLOT_PAYTABLE, SLOT_PAYLINES, SLOT_SYMBOLS, type SlotsResult } from '@casino/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../../lib/format';
import { socket } from '../../net/socket';
import { useSession } from '../../store/session';
import { Button } from '../../ui/Button';
import { PhaserView } from '../PhaserView';
import { SlotsScene } from '../scenes/SlotsScene';
import { GameLayout, Stat } from './GameLayout';
import { usePlay } from './usePlay';

const BET_STEPS = [10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000].filter(
  (b) => b >= ECONOMY.minBet && b <= ECONOMY.maxBet,
);

export function SlotsGame() {
  const { t, i18n } = useTranslation();
  const scene = useRef<SlotsScene | null>(null);
  const [step, setStep] = useState(3);
  const [lastWin, setLastWin] = useState(0);
  const [auto, setAuto] = useState(false);
  const [showPaytable, setShowPaytable] = useState(false);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const { busy, run } = usePlay();
  const bet = BET_STEPS[step]!;
  const autoRef = useRef(false);
  autoRef.current = auto;

  const spin = async () => {
    const s = scene.current;
    if (!s) return false;
    const env = await run(
      () => socket.request('slots.spin', { bet }),
      (e) => s.spin(e.result as SlotsResult),
    );
    if (env) setLastWin(env.result.payout);
    return env !== null;
  };

  useEffect(() => {
    if (!auto) return;
    let cancelled = false;
    void (async () => {
      while (!cancelled && autoRef.current) {
        if (useSession.getState().balance < bet) break;
        if (!(await spin())) break;
        await new Promise((r) => setTimeout(r, 350));
      }
      if (!cancelled) setAuto(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <GameLayout
      title={t('games.slots.name')}
      canvas={
        <>
          <PhaserView
            create={() => new SlotsScene()}
            onReady={(s) => {
              scene.current = s;
              setIcons(Object.fromEntries(SLOT_SYMBOLS.map((sym) => [sym, s.textures.getBase64(`slot-${sym}`)])));
            }}
          />
          {showPaytable && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-ink-950/85 p-4 backdrop-blur" onClick={() => setShowPaytable(false)}>
              <div className="glass grid max-w-xl grid-cols-2 gap-x-6 gap-y-2 p-5 text-sm">
                <h3 className="col-span-2 mb-1 font-display text-xl text-gold">{t('play.paytable')}</h3>
                {[...SLOT_SYMBOLS].reverse().map((sym) => (
                  <div key={sym} className="flex items-center gap-3">
                    {icons[sym] && <img src={icons[sym]} alt="" className="h-9 w-9" />}
                    <span className="w-20 text-white/70">{t(`slots.symbols.${sym}`)}</span>
                    <span className="tabular-nums text-gold-100">{SLOT_PAYTABLE[sym].map((m, i) => `${i + 3}×${m}`).join('  ')}</span>
                  </div>
                ))}
                <p className="col-span-2 mt-2 text-xs text-white/50">{t('play.lines', { count: SLOT_PAYLINES.length })}</p>
              </div>
            </div>
          )}
        </>
      }
      panel={
        <>
          <Stat label={t('play.bet')} value={formatChips(bet, i18n.language)} accent />
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="text-lg" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={busy || auto || step === 0}>
              −
            </Button>
            <Button size="sm" className="text-lg" onClick={() => setStep((s) => Math.min(BET_STEPS.length - 1, s + 1))} disabled={busy || auto || step === BET_STEPS.length - 1}>
              +
            </Button>
          </div>
          <Button variant="gold" size="lg" onClick={() => void spin()} disabled={busy || auto}>
            {busy ? t('play.busy') : t('play.spin')}
          </Button>
          <Button variant={auto ? 'ruby' : 'emerald'} onClick={() => setAuto((a) => !a)}>
            {auto ? t('play.stop') : t('play.auto')}
          </Button>
          <Stat label={t('play.lastWin')} value={formatChips(lastWin, i18n.language)} accent={lastWin > 0} />
          <Button size="sm" onClick={() => setShowPaytable((v) => !v)}>
            {t('play.paytable')}
          </Button>
          <p className="mt-auto text-[11px] leading-snug text-white/40">{t('app.disclaimer')}</p>
        </>
      }
    />
  );
}
