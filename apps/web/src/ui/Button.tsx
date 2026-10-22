import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { sfx } from '../audio/sfx';

type Variant = 'gold' | 'glass' | 'ruby' | 'emerald';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  gold: 'bg-gold-sheen text-ink-900 shadow-button hover:brightness-110',
  glass: 'border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12] backdrop-blur',
  ruby: 'bg-gradient-to-b from-ruby-400 to-ruby-600 text-white shadow-[0_6px_16px_-4px_rgba(212,42,68,0.6)] hover:brightness-110',
  emerald: 'bg-gradient-to-b from-emerald-400 to-emerald-700 text-white shadow-[0_6px_16px_-4px_rgba(31,157,97,0.6)] hover:brightness-110',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg',
  md: 'h-10 px-4 text-sm rounded-xl',
  lg: 'h-12 px-6 text-base rounded-xl',
};

export function Button({
  variant = 'glass',
  size = 'md',
  className = '',
  children,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <button
      {...rest}
      onClick={(e) => {
        sfx.click();
        onClick?.(e);
      }}
      className={`relative inline-flex select-none items-center justify-center gap-2 overflow-hidden font-semibold tracking-wide transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {variant === 'gold' && <span className="sheen" />}
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </button>
  );
}
