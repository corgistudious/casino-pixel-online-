import type { ButtonHTMLAttributes, ComponentPropsWithRef, ReactNode } from 'react';
import { sfx } from '../../audio/sfx';

export type GameTone = 'primary' | 'positive' | 'danger' | 'neutral' | 'ghost-danger' | 'violet' | 'ice' | 'rose' | 'vip' | 'sapphire';

/** Game tones → premium design-system tones (premium.css). */
const TONE: Record<GameTone, string> = { primary: 'pt-gold', positive: 'pt-emerald', danger: 'pt-danger', neutral: 'pt-neutral', 'ghost-danger': 'pt-danger pbtn-ghost', violet: 'pt-violet', ice: 'pt-ice', rose: 'pt-rose', vip: 'pt-vip', sapphire: 'pt-sapphire' };

/**
 * The single action button of every table screen: sizes from .gbtn (index.css), looks from the
 * premium design system (.pbtn + tone, premium.css).
 * `loading` = waiting for the server: the button is disabled (no duplicate action) and shows a
 * spinner; `selected` sets aria-pressed for toggles.
 */
export function GameButton({
  tone = 'neutral',
  size = 'md',
  loading = false,
  selected,
  icon,
  detail,
  big = false,
  className = '',
  children,
  disabled,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: GameTone; size?: 'md' | 'sm'; loading?: boolean; selected?: boolean; icon?: ReactNode; detail?: ReactNode; big?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={selected}
      onClick={(e) => {
        sfx.click();
        onClick?.(e);
      }}
      className={`gbtn pbtn ${TONE[tone]}${size === 'sm' ? ' gbtn--sm' : ''}${big ? ' pbtn-xl' : ''} ${className}`}
    >
      {loading ? <span className="pbtn-spin" aria-hidden /> : icon}
      {detail !== undefined ? (
        <span className="pbtn-stack">
          <span className="pbtn-title">{children}</span>
          <span className="pbtn-detail">{detail}</span>
        </span>
      ) : (
        <span>{children}</span>
      )}
    </button>
  );
}

/** Round HUD tool button; the label is its accessible name and tooltip. */
export function GameIconButton({ label, badge, expanded, children, onClick, ...rest }: ComponentPropsWithRef<'button'> & { label: string; badge?: number | string; expanded?: boolean; children: ReactNode }) {
  return (
    <button type="button" {...rest} className="gicon picon" aria-label={label} title={label} aria-expanded={expanded} onClick={onClick}>
      {children}
      {badge !== undefined && badge !== 0 && badge !== '' && <span className="gicon-badge">{badge}</span>}
    </button>
  );
}
