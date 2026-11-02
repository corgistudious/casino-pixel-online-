import type { ButtonHTMLAttributes, ComponentPropsWithRef, ReactNode } from 'react';
import { sfx } from '../../audio/sfx';

export type GameTone = 'primary' | 'positive' | 'danger' | 'neutral' | 'ghost-danger';

/**
 * The single action button of every table screen (styles: .gbtn in index.css).
 * `loading` = waiting for the server: the button is disabled (no duplicate action) and shows a
 * spinner; `selected` sets aria-pressed for toggles.
 */
export function GameButton({
  tone = 'neutral',
  size = 'md',
  loading = false,
  selected,
  icon,
  className = '',
  children,
  disabled,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: GameTone; size?: 'md' | 'sm'; loading?: boolean; selected?: boolean; icon?: ReactNode; children: ReactNode }) {
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
      className={`gbtn gbtn--${tone}${size === 'sm' ? ' gbtn--sm' : ''} ${className}`}
    >
      {loading ? <span className="gbtn-spin" aria-hidden /> : icon}
      <span>{children}</span>
    </button>
  );
}

/** Round HUD tool button; the label is its accessible name and tooltip. */
export function GameIconButton({ label, badge, expanded, children, onClick, ...rest }: ComponentPropsWithRef<'button'> & { label: string; badge?: number | string; expanded?: boolean; children: ReactNode }) {
  return (
    <button type="button" {...rest} className="gicon" aria-label={label} title={label} aria-expanded={expanded} onClick={onClick}>
      {children}
      {badge !== undefined && badge !== 0 && badge !== '' && <span className="gicon-badge">{badge}</span>}
    </button>
  );
}
