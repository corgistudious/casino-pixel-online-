import type { SicBoBetKind, SicBoResult } from '@casino/shared';
import { useTranslation } from 'react-i18next';
import { toBetList } from '../../lib/bets';
import { socket } from '../../net/socket';
import { SicBoScene } from '../scenes/SicBoScene';
import { BetBoardGame } from './BetBoardGame';

export function SicBoGame() {
  const { t } = useTranslation();
  return (
    <BetBoardGame
      title={t('games.sicbo.name')}
      actionLabel={t('play.roll')}
      create={() => new SicBoScene()}
      request={(bets) => socket.request('sicbo.roll', { bets: toBetList<SicBoBetKind>(bets) })}
      animate={(scene, env) => scene.roll(env.result as SicBoResult)}
    />
  );
}
