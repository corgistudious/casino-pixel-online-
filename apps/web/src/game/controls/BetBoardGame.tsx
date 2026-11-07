import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addChip, totalOf } from '../../lib/bets';
import { CHIP_VALUES, formatChips } from '../../lib/format';
import { sfx } from '../../audio/sfx';
import { useSession } from '../../store/session';
import { toast } from '../../ui/toast';
import { ECONOMY } from '@casino/shared';
import { PhaserView } from '../PhaserView';
import type { TableScene } from '../scenes/TableScene';
import { GameTableLayout } from '../../ui/game/GameTableLayout';
import { GameButton } from '../../ui/game/GameButton';
import { ActionIcon } from '../../ui/game/ActionIcons';
import { GameCard, GameChipRack, GameStat, GameTimer } from '../../ui/game/GameParts';
import { usePlay } from './usePlay';
import { celebrateWin } from '../../cosmetics/VictoryEffect';

interface Props<S extends TableScene, T extends { balance: number; roundId?: string; result: { payout: number } }> {
  title: string;
  actionLabel: string;
  create: () => S;
  request: (bets: Record<string, number>) => Promise<T>;
  animate: (scene: S, env: T) => Promise<void>;
  icon?: 'spin' | 'roll';
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
    <GameTableLayout
      title={props.title}
      status={<GameTimer label={busy ? t('play.busy') : t('play.placeBets')} />}
      tools={[
        {
          id: 'info',
          label: t('gameUi.info'),
          icon: 'info',
          content: (
            <>
              <GameCard>
                <p className="text-xs text-white/60">{t('play.placeBets')}</p>
                <div className="mt-2 flex gap-2">
                  <GameStat label={t('play.totalBet')} value={formatChips(total, i18n.language)} accent />
                  <GameStat label={t('play.lastWin')} value={formatChips(lastWin, i18n.language)} accent={lastWin > 0} />
                </div>
              </GameCard>
              <p className="text-[11px] leading-snug text-white/40">{t('app.disclaimer')}</p>
            </>
          ),
        },
      ]}
      stage={
        <div className="gstage-canvas">
          <PhaserView
            create={props.create}
            onReady={(s) => {
              scene.current = s;
              s.events.on('spot', onSpot);
            }}
          />
        </div>
      }
      controls={
        <>
          <div className="gbar-group">
            <GameChipRack values={CHIP_VALUES} value={chip} onChange={setChip} disabled={busy} />
          </div>
          <div className="gbar-group gbar-group--wide">
            <GameStat label={t('play.totalBet')} value={formatChips(total, i18n.language)} accent />
            <GameStat label={t('play.lastWin')} value={formatChips(lastWin, i18n.language)} accent={lastWin > 0} />
          </div>
          <div className="gbar-group">
            <GameButton size="sm" icon={<ActionIcon name="clear" size={18} />} onClick={() => setBets({})} disabled={busy || total === 0}>
              {t('play.clear')}
            </GameButton>
            <GameButton size="sm" onClick={() => totalOf(lastBets) <= useSession.getState().balance && setBets(lastBets)} disabled={busy || totalOf(lastBets) === 0}>
              {t('play.rebet')}
            </GameButton>
            <GameButton tone="primary" icon={<ActionIcon name={props.icon ?? 'confirm'} />} loading={busy} onClick={() => void play()} disabled={total === 0}>
              {busy ? t('play.busy') : props.actionLabel}
              {!busy && total > 0 && <span className="tabular-nums"> · {formatChips(total, i18n.language)}</span>}
            </GameButton>
          </div>
        </>
      }
    />
  );
}
