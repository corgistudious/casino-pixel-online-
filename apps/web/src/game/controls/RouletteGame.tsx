import type { RouletteBetKind, RouletteResult } from '@casino/shared';
import { useTranslation } from 'react-i18next';
import { toBetList } from '../../lib/bets';
import { socket } from '../../net/socket';
import { RouletteScene } from '../scenes/RouletteScene';
import { BetBoardGame } from './BetBoardGame';

export function RouletteGame() {
  const { t } = useTranslation();
  return (
    <BetBoardGame
      title={t('games.roulette.name')}
      actionLabel={t('play.spin')}
      create={() => new RouletteScene()}
      request={(bets) => socket.request('roulette.spin', { bets: toBetList<RouletteBetKind>(bets) })}
      animate={(scene, env) => scene.spin(env.result as RouletteResult)}
    />
  );
}
