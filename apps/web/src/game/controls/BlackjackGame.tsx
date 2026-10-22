import { ECONOMY, type BlackjackAction, type BlackjackView, type RoundEnvelope } from '@casino/shared';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sfx } from '../../audio/sfx';
import { CHIP_VALUES, formatChips } from '../../lib/format';
import { socket } from '../../net/socket';
import { useSession } from '../../store/session';
import { Button } from '../../ui/Button';
import { ChipSelector } from '../../ui/Chip';
import { toast } from '../../ui/toast';
import { PhaserView } from '../PhaserView';
import { BlackjackScene } from '../scenes/BlackjackScene';
import { GameLayout, Stat } from './GameLayout';
import { usePlay } from './usePlay';

export function BlackjackGame() {
  const { t, i18n } = useTranslation();
  const scene = useRef<BlackjackScene | null>(null);
  const [chip, setChip] = useState<number>(100);
  const [bet, setBet] = useState(0);
  const [lastBet, setLastBet] = useState(0);
  const [round, setRound] = useState<RoundEnvelope<BlackjackView> | null>(null);
  const { busy, run } = usePlay();
  const inHand = round?.result.phase === 'player';
  const tr = (key: string) => t(key);

  const addChip = () => {
    if (inHand || busy) return;
    const next = bet + chip;
    if (next > ECONOMY.maxBet) return toast(t('errors.bet_too_high'), 'error');
    if (next > useSession.getState().balance) return toast(t('errors.insufficient_funds'), 'error');
    sfx.chip();
    setBet(next);
    scene.current?.setBet(next);
  };

  const deal = async (amount = bet) => {
    const s = scene.current;
    if (!s || amount < ECONOMY.minBet) return toast(t('errors.bet_too_low'), 'error');
    s.reset();
    const env = await run(
      () => socket.request('blackjack.start', { bet: amount }),
      (e) => s.show(e.result, tr),
    );
    if (env) {
      setRound(env);
      setLastBet(amount);
      setBet(0);
    }
  };

  const act = async (action: BlackjackAction) => {
    const s = scene.current;
    if (!s || !round) return;
    const env = await run(
      () => socket.request('blackjack.action', { roundId: round.roundId, action }),
      (e) => s.show(e.result, tr),
    );
    if (env) setRound(env);
  };

  return (
    <GameLayout
      title={t('games.blackjack.name')}
      canvas={
        <PhaserView
          create={() => new BlackjackScene()}
          onReady={async (s) => {
            scene.current = s;
            // Continue a hand left unfinished (refresh, disconnect, other device).
            const resumed = await socket.request('blackjack.resume', {}).catch(() => null);
            if (resumed) {
              await s.show(resumed.result, tr);
              setRound(resumed);
            }
          }}
        />
      }
      panel={
        inHand ? (
          <>
            <Stat label={t('play.bet')} value={formatChips(round!.result.bet * (round!.result.doubled ? 2 : 1), i18n.language)} accent />
            <Button variant="gold" size="lg" onClick={() => void act('hit')} disabled={busy}>
              {t('play.hit')}
            </Button>
            <Button variant="emerald" size="lg" onClick={() => void act('stand')} disabled={busy}>
              {t('play.stand')}
            </Button>
            <Button
              variant="ruby"
              onClick={() => void act('double')}
              disabled={busy || !round!.result.canDouble || useSession.getState().balance < round!.result.bet}
            >
              {t('play.double')}
            </Button>
          </>
        ) : (
          <>
            <ChipSelector values={CHIP_VALUES} value={chip} onChange={setChip} />
            <Button size="sm" onClick={addChip} disabled={busy}>
              + {formatChips(chip, i18n.language)}
            </Button>
            <Stat label={t('play.bet')} value={formatChips(bet, i18n.language)} accent />
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setBet(0);
                  scene.current?.setBet(0);
                }}
                disabled={busy || bet === 0}
              >
                {t('play.clear')}
              </Button>
              <Button size="sm" onClick={() => void deal(lastBet)} disabled={busy || lastBet === 0}>
                {t('play.rebet')}
              </Button>
            </div>
            <Button variant="gold" size="lg" onClick={() => void deal()} disabled={busy || bet === 0}>
              {busy ? t('play.busy') : t('play.deal')}
            </Button>
            {round && round.result.outcome && (
              <Stat label={t('play.lastWin')} value={formatChips(round.result.payout, i18n.language)} accent={round.result.payout > 0} />
            )}
            <p className="mt-auto text-[11px] leading-snug text-white/40">{t('blackjack.rules')}</p>
          </>
        )
      }
    />
  );
}
