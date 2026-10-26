import type { Card } from '@casino/shared';
import { KitDefs, PlayingCard, type Suit } from '../hub/art/kit';

const P = 'bjtcard';

/** Gradients used by every card on the page (rendered once). */
export function CardDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <KitDefs p={P} />
    </svg>
  );
}

/** One playing card (null = face down). */
export function CardSvg({ card, width = 52, className = '' }: { card: Card | null; width?: number; className?: string }) {
  const rank = card ? card.slice(0, -1) : undefined;
  const suit = card ? (card.slice(-1) as Suit) : undefined;
  return (
    <svg viewBox="-31 -43 62 86" width={width} height={(width * 86) / 62} className={`drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)] ${className}`} role="img" aria-label={card ?? '🂠'}>
      <PlayingCard p={P} rank={rank} suit={suit} back={!card} />
    </svg>
  );
}
