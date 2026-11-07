/**
 * Small/big blind seats of a Hold'em hand, for the blind markers on the table (display only).
 * Mirrors startHand() in packages/shared/src/games/seated.ts — players are in seat order, the button
 * is the last player seated at or before `button`, heads-up the button posts the small blind.
 * blinds.test.ts checks it against startHand for every table size and button position.
 */
export function blindSeats(hand: { game: string; button: number; players: readonly { seat: number }[] }): { sb: number; bb: number } | null {
  const ps = hand.players;
  if (hand.game !== 'poker' || ps.length < 2) return null;
  let b = -1;
  ps.forEach((p, i) => {
    if (p.seat <= hand.button) b = i;
  });
  if (b === -1) b = ps.length - 1;
  const sbIdx = ps.length === 2 ? b : (b + 1) % ps.length;
  const bbIdx = (sbIdx + 1) % ps.length;
  return { sb: ps[sbIdx]!.seat, bb: ps[bbIdx]!.seat };
}
