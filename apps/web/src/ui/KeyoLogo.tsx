import { useId } from 'react';

/** Keyo Game crest: gold shield with a K monogram (original artwork). */
export function KeyoCrest({ size = 64 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Keyo Game">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff4c8" />
          <stop offset="0.35" stopColor="#f2c14e" />
          <stop offset="0.65" stopColor="#9a6512" />
          <stop offset="1" stopColor="#f7d77a" />
        </linearGradient>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2380" />
          <stop offset="1" stopColor="#0f0a2a" />
        </linearGradient>
      </defs>
      <path d="M32 3 56 12v18c0 15-10.5 25-24 31C18.5 55 8 45 8 30V12z" fill={`url(#${id}g)`} />
      <path d="M32 8 51 15v15c0 12-8.4 20.4-19 25.6C21.4 50.4 13 42 13 30V15z" fill={`url(#${id}f)`} />
      <path d="M24 18h6v11l10-11h7.5L36.5 30 48 44h-7.6L32 33.6 30 35.8V44h-6z" fill={`url(#${id}g)`} />
      <path d="M32 2.5l2.2 3.4-2.2 1.7-2.2-1.7z" fill="#5ad8ff" />
      <path d="M16 15c4.5-2.5 10-4 16-4" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Crest + wordmark. */
export function KeyoLogo({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <KeyoCrest size={size} />
      <span className="flex flex-col leading-none">
        <span className="font-display font-black tracking-[0.12em] text-gold" style={{ fontSize: size * 0.62 }}>
          KEYO
        </span>
        <span className="font-semibold tracking-[0.5em] text-white/70" style={{ fontSize: size * 0.22 }}>
          GAME
        </span>
      </span>
    </span>
  );
}
