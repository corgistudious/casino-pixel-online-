import type { GuildColor, GuildEmblem, PlayerCard, PresenceStatus } from '@casino/shared';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';
import { socket } from '../net/socket';
import { PlayerAvatar, PlayerRankBadge, useLiveIdentity } from '../players/identity';
import { PlayerName } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';
import { useDialogFocus } from '../ui/dialog';

/** Toast for any failed social call, translated from the server's error code. */
export function useFail() {
  const { t, i18n } = useTranslation();
  return (err: unknown) => toast(errorText(t, err, i18n.language), 'error');
}

/** Refetch when the server says something social changed (requests, gifts, guild updates). */
export function useSocialEvents(onChange: (kind: string) => void, deps: unknown[] = []) {
  useEffect(
    () =>
      socket.listen((ev) => {
        if (ev.event === 'social') onChange(ev.data.kind);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );
}

/** Avatar (VIP badge, online / in-game dot), name with rank and badges, level and UID. */
export function PlayerChip({ card, size = 44, online, sub, nameClass = '' }: { card: PlayerCard; size?: number; online?: boolean | PresenceStatus; sub?: ReactNode; nameClass?: string }) {
  const { t } = useTranslation();
  const p = useLiveIdentity(card);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PlayerAvatar player={p} size={size} status={online} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1">
          <PlayerName name={p.displayName} badges={p.badges} size={14} className={`min-w-0 font-strong text-white ${nameClass}`} />
          <PlayerRankBadge rank={p.rank} size={16} />
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-white/50">
          <span className="rounded bg-gold-300/15 px-1 font-label text-gold-100">{t('social.level', { level: p.level })}</span>
          <span className="tabular-nums">UID {p.uid}</span>
          {sub}
        </div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items, tone = 'gold' }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; badge?: number }[]; tone?: 'gold' | 'pink' | 'cyan' }) {
  const active = { gold: 'bg-gold-sheen text-ink-900', pink: 'bg-gradient-to-r from-pink-400 to-fuchsia-500 text-white', cyan: 'bg-gradient-to-r from-cyan-300 to-sky-500 text-ink-900' }[tone];
  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-1" role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={`relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 font-label text-sm transition ${value === it.id ? `${active} shadow-button` : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
        >
          {it.label}
          {!!it.badge && <span className="min-w-[18px] rounded-full bg-ruby-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{it.badge > 99 ? '99+' : it.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Centered dialog. Closes on Escape and backdrop click. */
/**
 * Centered dialog sized to the VISIBLE viewport (it never reaches under the phone keyboard): the
 * title bar stays put and only the body scrolls. Closes on Escape, the × button and backdrop click;
 * focus is kept inside and returned to the opener on close.
 */
export function Modal({ title, onClose, children, width = 'max-w-md' }: { title: string; onClose: () => void; children: ReactNode; width?: string }) {
  const { t } = useTranslation();
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useDialogFocus(box, onClose);
  return (
    <div className="overlay z-[70] flex items-center justify-center bg-ink-950/80 backdrop-blur-sm" onClick={onClose}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className={`glass flex max-h-full w-full ${width} flex-col overflow-hidden outline-none`} onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-4 short:px-4 short:pt-3">
          <h2 id={id} className="font-display text-xl font-heading text-white">{title}</h2>
          <button type="button" onClick={onClose} className="-mr-2 flex h-10 w-10 items-center justify-center rounded-xl text-2xl leading-none text-white/55 hover:bg-white/10 hover:text-white" aria-label={t('market.close')}>
            ×
          </button>
        </div>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pb-5 [&>*]:shrink-0 short:px-4 short:pb-4">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ children, icon = '✦' }: { children: ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 bg-black/20 px-6 py-10 text-center text-sm text-white/50">
      <span className="text-2xl opacity-60" aria-hidden>
        {icon}
      </span>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- guild crest

export const GUILD_PALETTE: Record<GuildColor, [string, string, string]> = {
  gold: ['#fff1b8', '#f2c14e', '#7a4f0e'],
  ruby: ['#ffb3c0', '#e0344f', '#5c0a1b'],
  emerald: ['#b8ffd8', '#21b46a', '#0a4a2a'],
  sapphire: ['#bfe4ff', '#2f7fe8', '#0d2a5e'],
  amethyst: ['#ecd2ff', '#9b4ef0', '#3a1466'],
  onyx: ['#e6e6ee', '#5a5a6e', '#141420'],
};

const GLYPH: Record<GuildEmblem, string> = {
  crown: 'M7 22l2.5-9 4 4 2.5-7 2.5 7 4-4L25 22z M7 24h18',
  dragon: 'M9 21c3-1 4-4 4-7 2 2 5 2 7 0-1 3 1 6 4 7-4 1-7 0-8-2-1 2-4 3-7 2z M14 12l2-3 2 3',
  phoenix: 'M16 25V14 M16 14c-3-4-8-4-9-1 3 0 5 2 9 5 4-3 6-5 9-5-1-3-6-3-9 1z M13 9l3-3 3 3',
  lion: 'M16 9a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M13 15h.01 M19 15h.01 M14 19c1 1 3 1 4 0',
  sword: 'M16 6v15 M12 21h8 M16 21v4 M14 9l2-3 2 3',
  shield: 'M16 7l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10v-5z M16 11v10 M12 15h8',
  star: 'M16 7l2.6 5.6 6.1.6-4.6 4.1 1.3 6L16 20.3l-5.4 3 1.3-6-4.6-4.1 6.1-.6z',
  diamond: 'M10 13l3-5h6l3 5-6 11z M10 13h12 M16 24l-3-11 3-5 3 5z',
};

/** Shield-shaped guild crest in the guild's colours. */
export function GuildCrest({ emblem, color, size = 56 }: { emblem: GuildEmblem; color: GuildColor; size?: number }) {
  const id = useId();
  const [light, mid, dark] = GUILD_PALETTE[color] ?? GUILD_PALETTE.gold;
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 32 37" aria-hidden className="shrink-0 drop-shadow-[0_6px_14px_rgba(0,0,0,0.55)]">
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff8e1" />
          <stop offset="0.5" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#8a5a12" />
        </linearGradient>
      </defs>
      <path d="M16 1.5 29.5 6v11c0 9-6 15-13.5 18.5C8.5 32 2.5 26 2.5 17V6z" fill={`url(#${id}f)`} stroke={`url(#${id}r)`} strokeWidth="1.6" />
      <path d="M16 4 27 7.8v9.2c0 7.6-5 12.8-11 15.8" fill="none" stroke={light} strokeOpacity="0.35" strokeWidth="1" />
      <path d={GLYPH[emblem] ?? GLYPH.crown} fill="none" stroke={light} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Coloured tier pill (D … Supreme). */
export function TierPill({ tier }: { tier: string }) {
  const tone =
    tier === 'Supreme' ? 'from-fuchsia-400 via-amber-200 to-cyan-300 text-ink-900' : tier.startsWith('S') ? 'from-amber-200 to-amber-500 text-ink-900' : tier === 'A' ? 'from-violet-300 to-violet-500 text-white' : tier === 'B' ? 'from-sky-300 to-sky-500 text-ink-900' : 'from-white/30 to-white/10 text-white';
  return <span className={`rounded-md bg-gradient-to-r px-1.5 py-px font-heading text-[11px] tracking-wide ${tone}`}>{tier}</span>;
}
