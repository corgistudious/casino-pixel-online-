import { useId } from 'react';
import { compactChips } from '../lib/format';

const STYLES: Record<number, { base: string; dark: string; insert: string; text: string }> = {
  10: { base: '#e9e6f2', dark: '#9d98b8', insert: '#3d3790', text: '#2b2766' },
  50: { base: '#d42a44', dark: '#7d1222', insert: '#ffffff', text: '#ffffff' },
  100: { base: '#1f9d61', dark: '#0d5434', insert: '#ffffff', text: '#ffffff' },
  500: { base: '#2f5ee8', dark: '#162f87', insert: '#ffffff', text: '#ffffff' },
  1000: { base: '#24203f', dark: '#08070f', insert: '#f2c14e', text: '#f7d77a' },
  5000: { base: '#9b4dea', dark: '#4e1a85', insert: '#f2c14e', text: '#ffffff' },
};

/** Vector casino chip matching the in-game chip textures. */
export function Chip({ value, size = 40, selected = false }: { value: number; size?: number; selected?: boolean }) {
  const id = useId();
  const s = STYLES[value] ?? STYLES[10]!;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={selected ? 'drop-shadow-[0_0_8px_rgba(242,193,78,0.9)]' : 'drop-shadow-md'}>
      <defs>
        <radialGradient id={`${id}b`} cx="38%" cy="32%" r="70%">
          <stop offset="0" stopColor={s.base} />
          <stop offset="0.85" stopColor={s.base} />
          <stop offset="1" stopColor={s.dark} />
        </radialGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="21.5" r="18.5" fill={s.dark} />
      <circle cx="20" cy="20" r="18.5" fill={`url(#${id}b)`} />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <rect key={a} x="17" y="1.8" width="6" height="5" rx="1.2" fill={s.insert} transform={`rotate(${a} 20 20)`} />
      ))}
      <circle cx="20" cy="20" r="12" fill="none" stroke={s.insert} strokeOpacity="0.7" strokeDasharray="2.2 1.6" />
      <circle cx="20" cy="20" r="10.5" fill={s.dark} opacity="0.35" />
      <text x="20" y="20.5" textAnchor="middle" dominantBaseline="middle" fontWeight="800" fontSize={value >= 1000 ? 8 : 9} fill={s.text}>
        {compactChips(value)}
      </text>
      <ellipse cx="20" cy="11" rx="14" ry="7.5" fill={`url(#${id}g)`} />
      {selected && <circle cx="20" cy="20" r="19.2" fill="none" stroke="#f7d77a" strokeWidth="1.5" />}
    </svg>
  );
}

export function ChipSelector({ values, value, onChange }: { values: readonly number[]; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {values.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-full transition ${v === value ? '-translate-y-1 scale-110' : 'opacity-80 hover:opacity-100'}`}
          aria-pressed={v === value}
          aria-label={String(v)}
        >
          <Chip value={v} size={30} selected={v === value} />
        </button>
      ))}
    </div>
  );
}
