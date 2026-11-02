/** Stroke icons for the game HUD (own artwork, no third-party icon set). */
export type GameIconName = 'back' | 'chat' | 'players' | 'stats' | 'info' | 'room' | 'close';

const PATHS: Record<GameIconName, string> = {
  back: 'M15 5l-7 7 7 7',
  chat: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5z',
  players: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2A6.5 6.5 0 0 1 21.5 20',
  stats: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7.5v.01',
  room: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M14 12v.01',
  close: 'M6 6l12 12M18 6L6 18',
};

export function GameIcon({ name }: { name: GameIconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
