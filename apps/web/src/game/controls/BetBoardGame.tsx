import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addChip, totalOf } from '../../lib/bets';
import { CHIP_VALUES, formatChips } from '../../lib/format';
import { sfx } from '../../audio/sfx';
import { useSession } from '../../store/session';
import { Button } from '../../ui/Button';
import { ChipSelector } from '../../ui/Chip';
import { toast } from '../../ui/toast';
import { ECONOMY } from '@casino/shared';
import { PhaserView } from '../PhaserView';
import type { TableScene } from '../scenes/TableScene';
import { GameLayout, Stat } from './GameLayout';
import { usePlay } from './usePlay';
import { celebrateWin } from '../../cosmetics/VictoryEffect';

interface Props<S extends TableScene, T extends { balance: number; roundId?: string; result: { payout: number } }> {
  title: string;
  actionLabel: string;
  create: () => S;
  request: (bets: Record<string, number>) => Promise<T>;
  animate: (scene: S, env: T) => Promise<void>;
}

/** Shared flow for roulette & sic bo: place chips on the table, then spin/roll. */
export function BetBoardGame<S extends TableScene, T extends { balance: number; roundId?: string; result: { payout: number } }>(props: Props<S, T>) {
  const { t, i18n } = useTranslation();
  const scene = useRef<S | null>(null);
  const [chip, setChip] = useState<number>(100);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [lastBets, setLastBets] = useState<Record<string, number>>({});
  const [lastWin, setLastWin] = useState(0);
  const { busy, run } = usePlay();
  const state = useRef({ chip, bets, busy });
  state.current = { chip, bets, busy };
  const total = totalOf(bets);

  useEffect(() => {
    scene.current?.setBets(bets);
  }, [bets]);

  const onSpot = (key: string) => {
    const { chip, bets, busy } = state.current;
    if (busy) return;
    const next = totalOf(bets) + chip;
    if (next > ECONOMY.maxBet) return toast(t('errors.bet_too_high'), 'error');
    if (next > useSession.getState().balance) return toast(t('errors.insufficient_funds'), 'error');
    sfx.chip();
    setBets(addChip(bets, key, chip));
  };

  const play = async () => {
    const s = scene.current;
    if (!s || total === 0) return;
    if (total < ECONOMY.minBet) return toast(t('errors.bet_too_low'), 'error');
    const placed = bets;
    const env = await run(
      () => props.request(placed),
      (e) =>
        props.animate(s, e).then(() => {
          // Settled server result: play my victory effect if the round paid more than I staked.
          const r = e.result as { payout?: number; bets?: { amount: number }[] };
          const stake = (r.bets ?? []).reduce((sum, b) => sum + b.amount, 0);
          if ((r.payout ?? 0) > stake) celebrateWin(`solo:${e.roundId}`, { big: (r.payout ?? 0) >= stake * 10 });
        }),
    );
    if (env) {
      setLastWin(env.result.payout);
      setLastBets(placed);
      setBets({});
    }
  };

  return (
    <GameLayout
      title={props.title}
      canvas={
        <PhaserView
          create={props.create}
          onReady={(s) => {
            scene.current = s;
            s.events.on('spot', onSpot);
          }}
        />
      }
      panel={
        <>
          <div className="hidden text-center text-xs text-white/50 sm:block">{t('play.placeBets')}</div>
          <ChipSelector values={CHIP_VALUES} value={chip} onChange={setChip} />
          <Stat label={t('play.totalBet')} value={formatChips(total, i18n.language)} accent />
          <Button variant="gold" size="lg" onClick={() => void play()} disabled={busy || total === 0}>
            {busy ? t('play.busy') : props.actionLabel}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => setBets({})} disabled={busy || total === 0}>
              {t('play.clear')}
            </Button>
            <Button
              size="sm"
              onClick={() => totalOf(lastBets) <= useSession.getState().balance && setBets(lastBets)}
              disabled={busy || totalOf(lastBets) === 0}
            >
              {t('play.rebet')}
            </Button>
          </div>
          <Stat label={t('play.lastWin')} value={formatChips(lastWin, i18n.language)} accent={lastWin > 0} />
          <p className="mt-auto text-[11px] leading-snug text-white/40">{t('app.disclaimer')}</p>
        </>
      }
    />
  );
}
