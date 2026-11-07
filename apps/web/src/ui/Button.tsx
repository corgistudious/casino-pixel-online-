import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { sfx } from '../audio/sfx';

/**
 * PremiumButton (V7.1 design system, premium.css). Tones carry meaning across the whole app:
 *   gold — play / bet · violet — chat / guild / friends · ice — bank / info · rose — events / rewards
 *   emerald — confirm · ruby (danger) — warning / fold · vip — VIP · glass (neutral) — secondary.
 * `loading` disables the button and shows a spinner (no double submits); `selected` and `state`
 * expose the selected / success / error looks. Layout size never changes with the animation.
 */
export type ButtonVariant = 'gold' | 'glass' | 'ruby' | 'emerald' | 'violet' | 'ice' | 'rose' | 'vip' | 'neutral';
type Size = 'sm' | 'md' | 'lg';

const TONE: Record<ButtonVariant, string> = {
  gold: 'pt-gold',
  glass: 'pt-neutral',
  neutral: 'pt-neutral',
  ruby: 'pt-danger',
  emerald: 'pt-emerald',
  violet: 'pt-violet',
  ice: 'pt-ice',
  rose: 'pt-rose',
  vip: 'pt-vip',
};

export function Button({
  variant = 'glass',
  size = 'md',
  loading = false,
  selected,
  state,
  className = '',
  children,
  onClick,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: Size; loading?: boolean; selected?: boolean; state?: 'success' | 'error'; children: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={selected}
      data-state={state}
      onClick={(e) => {
        sfx.click();
        onClick?.(e);
      }}
      className={`pbtn pbtn-${size} ${TONE[variant]} ${className}`}
    >
      {loading && <span className="pbtn-spin" aria-hidden />}
      <span className="inline-flex items-center gap-2">{children}</span>
    </button>
  );
}
