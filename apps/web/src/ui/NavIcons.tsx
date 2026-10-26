import { useId } from 'react';

export type NavIconName =
  | 'hub'
  | 'rooms'
  | 'market'
  | 'collection'
  | 'missions'
  | 'vip'
  | 'leaderboard'
  | 'rank'
  | 'profile'
  | 'friends'
  | 'gifts'
  | 'mail'
  | 'settings'
  | 'guild'
  | 'support'
  | 'chat'
  | 'bank';

/** Line icons on a 24×24 grid, stroked with a metallic gold gradient. */
const PATHS: Record<NavIconName, string[]> = {
  hub: ['M3.5 10.5 12 4l8.5 6.5', 'M5.5 9v10.5h13V9', 'M9.5 19.5v-5.5h5v5.5', 'M12 7.6l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 9.7l2-.3z'],
  rooms: ['M3.5 6.5h17', 'M3.5 12h17', 'M3.5 17.5h17', 'M6.5 4.5v4', 'M6.5 10v4', 'M6.5 15.5v4', 'M15 4.8l1.2 1.7 1.2-1.7', 'M15 10.3l1.2 1.7 1.2-1.7'],
  market: ['M5 8.5h14l-1.2 11H6.2z', 'M8.5 8.5V7a3.5 3.5 0 0 1 7 0v1.5', 'M12 11.5l1.6 2.2L12 16l-1.6-2.3z'],
  collection: ['M7.5 4.5h10a1.5 1.5 0 0 1 1.5 1.5v12', 'M5 7h10.5A1.5 1.5 0 0 1 17 8.5v10A1.5 1.5 0 0 1 15.5 20H5A1.5 1.5 0 0 1 3.5 18.5v-10A1.5 1.5 0 0 1 5 7z', 'M10.25 10.5l1.3 2.6 2.9.4-2.1 2 .5 2.8-2.6-1.4-2.6 1.4.5-2.8-2.1-2 2.9-.4z'],
  missions: ['M7 3.5h8.5L19 7v13.5H7z', 'M15.5 3.5V7H19', 'M10 11.5l1.5 1.5 3-3', 'M10 16.5h6', 'M4 7v13.5'],
  vip: ['M3.5 8l4 3.5L12 5l4.5 6.5 4-3.5-2 10.5h-13z', 'M5.5 20.5h13', 'M10 14.5l2 2 2-2'],
  rank: ['M12 3.5 19 6.5v5.5c0 4.6-3 7.8-7 9.9-4-2.1-7-5.3-7-9.9V6.5z', 'M12 8.2l1.2 2.5 2.7.4-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.4z', 'M3.5 9.5 2 12l2 1', 'M20.5 9.5 22 12l-2 1'],
  leaderboard: ['M8 4.5h8v4a4 4 0 0 1-8 0z', 'M8 6H5a3 3 0 0 0 3 3', 'M16 6h3a3 3 0 0 1-3 3', 'M12 12.5v3.5', 'M8.5 20h7l-1-4h-5z'],
  profile: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4.5 20.5a7.5 7.5 0 0 1 15 0'],
  friends: ['M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20a6.5 6.5 0 0 1 13 0', 'M16 4.8a3.5 3.5 0 0 1 0 6.4', 'M17.5 14a6.5 6.5 0 0 1 4 6'],
  gifts: ['M4 9.5h16v4H4z', 'M5.5 13.5h13v7h-13z', 'M12 9.5v11', 'M12 9.5C10 9.5 7.5 8.6 7.5 6.6S10.5 4.7 12 9.5z', 'M12 9.5c2 0 4.5-.9 4.5-2.9S13.5 4.7 12 9.5z'],
  mail: ['M3.5 6.5h17v11h-17z', 'M3.5 7l8.5 6.5L20.5 7', 'M3.5 17.5l6.2-5.2', 'M20.5 17.5l-6.2-5.2'],
  guild: ['M5 4.5h14v7.5c0 4.2-3 7-7 8.5-4-1.5-7-4.3-7-8.5z', 'M8.5 8.5h7', 'M12 8.5v7.5', 'M9.5 12.5l2.5 1.6 2.5-1.6', 'M3 4.5h2', 'M19 4.5h2'],
  support: ['M4.5 13v-1.5a7.5 7.5 0 0 1 15 0V13', 'M4.5 13h2.5v5H5.5a1 1 0 0 1-1-1z', 'M19.5 13H17v5h1.5a1 1 0 0 0 1-1z', 'M17 18c0 1.7-1.8 2.5-4.5 2.5', 'M11 20.5h1.5'],
  chat: ['M4 5.5h16v10H11l-4.5 4v-4H4z', 'M8 9.5h8', 'M8 12.5h5'],
  bank: ['M3.5 9.5 12 4.5l8.5 5', 'M5 9.5h14', 'M6.5 12v5.5', 'M10.5 12v5.5', 'M13.5 12v5.5', 'M17.5 12v5.5', 'M4 20h16'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M12 2.8l1.6 2.4 2.8-.6.6 2.8 2.4 1.6-1.4 2.5 1.4 2.5-2.4 1.6-.6 2.8-2.8-.6L12 21.2l-1.6-2.4-2.8.6-.6-2.8-2.4-1.6L6 12.5 4.6 10l2.4-1.6.6-2.8 2.8.6z'],
};

export function NavIcon({ name, size = 22, active = false }: { name: NavIconName; size?: number; active?: boolean }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={id} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={active ? '#fff8e1' : '#f7d77a'} />
          <stop offset="0.5" stopColor={active ? '#f2c14e' : '#c9963a'} />
          <stop offset="1" stopColor={active ? '#fff1b8' : '#8a6a2e'} />
        </linearGradient>
      </defs>
      {PATHS[name].map((d, i) => (
        <path key={i} d={d} stroke={`url(#${id})`} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
