import { vipProgress } from '@casino/shared';
import { useEffect, useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { DEMO_EXTRAS, IS_DEMO } from '../demo';
import { formatChips } from '../lib/format';
import { useSession } from '../store/session';
import { useSocial } from '../store/social';
import { startVipSync, useVip } from '../store/vip';
import { Avatar } from './Avatar';
import { NavIcon, type NavIconName } from './NavIcons';
import { CurrencyIcon, PlayerName } from './OfficialAssets';
import { VipEmblem } from './VipEmblem';
import { ChatButton } from './ChatButton';

export const NAV_ITEMS: { to: string; icon: NavIconName; label: string }[] = [
  { to: '/', icon: 'hub', label: 'nav.hub' },
  { to: '/rooms', icon: 'rooms', label: 'nav.rooms' },
  { to: '/market', icon: 'market', label: 'nav.market' },
  { to: '/bank', icon: 'bank', label: 'nav.bank' },
  { to: '/collection', icon: 'collection', label: 'nav.collection' },
  { to: '/mail', icon: 'mail', label: 'nav.mail' },
  { to: '/missions', icon: 'missions', label: 'nav.missions' },
  { to: '/vip', icon: 'vip', label: 'nav.vip' },
  { to: '/rank', icon: 'rank', label: 'nav.rank' },
  { to: '/leaderboard', icon: 'leaderboard', label: 'nav.leaderboard' },
  { to: '/guild', icon: 'guild', label: 'nav.guild' },
  { to: '/friends', icon: 'friends', label: 'nav.friends' },
  { to: '/support', icon: 'support', label: 'nav.support' },
  { to: '/gifts', icon: 'gifts', label: 'nav.gifts' },
  { to: '/profile', icon: 'profile', label: 'nav.profile' },
  { to: '/settings', icon: 'settings', label: 'nav.settings' },
];

/** Small pill marking values whose feature is not implemented on the server yet ("Demo" in the preview build). */
export function DemoTag() {
  const { t } = useTranslation();
  return (
    <span className="rounded border border-neon-cyan/40 bg-neon-cyan/10 px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wider text-neon-cyan">
      {t(IS_DEMO ? 'demo.tag' : 'demo.notLive')}
    </span>
  );
}

export function CharmIcon({ size = 18 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd1e8" />
          <stop offset="0.5" stopColor="#ff4f9a" />
          <stop offset="1" stopColor="#8a0f45" />
        </linearGradient>
      </defs>
      <path d="M12 21s-8.5-5.2-8.5-11.3A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.5 3.1C20.5 15.8 12 21 12 21z" fill={`url(#${id})`} stroke="#f7d77a" strokeWidth="1.1" />
      <path d="M7.2 9.2a2.4 2.4 0 0 1 2.4-2" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** VIP level and EXP bar from the server (demo data only in the preview build). */
export function VipMeter({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const exp = useVip((v) => v.exp);
  useEffect(startVipSync, []);
  const vip = vipProgress(exp ?? 0);
  return (
    <NavLink to="/vip" className="group flex items-center gap-2" title={t('nav.vip')}>
      <VipEmblem level={vip.level} size={compact ? 34 : 40} />
      <div className={compact ? 'w-20' : 'w-32 xl:w-40'}>
        <div className="flex items-center justify-between gap-1 text-[10px] leading-none text-white/55">
          <span className="font-semibold tracking-wide text-gold-200">{t('player.vipExp')}</span>
          {IS_DEMO && <DemoTag />}
        </div>
        <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold-500 via-gold-300 to-gold-100 shadow-[0_0_8px_rgba(242,193,78,0.7)] transition-all duration-700"
            style={{ width: `${vip.ratio * 100}%` }}
          />
          <span className="absolute inset-y-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        </div>
        {!compact && (
          <div className="mt-1 truncate text-[10px] leading-none tabular-nums text-white/45">
            {vip.next ? `${formatChips(exp ?? 0, i18n.language)} / ${formatChips(vip.next.exp, i18n.language)}` : t('player.maxLevel')}
          </div>
        )}
      </div>
    </NavLink>
  );
}

function PlayerBar() {
  const { t, i18n } = useTranslation();
  const user = useSession((s) => s.user)!;
  const balance = useSession((s) => s.balance);
  const gold = useSession((s) => s.gold);
  const fmt = (n: number) => formatChips(n, i18n.language);
  return (
    <header className="relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-gold-300/15 bg-gradient-to-b from-ink-800/95 to-ink-900/90 px-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl lg:h-16 lg:gap-5 lg:px-5">
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-300/60 to-transparent" />
      <NavLink to="/profile" className="flex min-w-0 items-center gap-2.5">
        <Avatar index={user.avatar} frame={user.frame} avatarItem={user.avatarItem} size={40} />
        <div className="hidden min-w-0 sm:block">
          <PlayerName name={user.displayName} badges={user.badges} size={16} className="max-w-[11rem] text-sm font-semibold" />
          <div className="text-[11px] leading-tight text-white/45 tabular-nums">
            <span className="font-semibold text-gold-100">{t('level.short', { level: user.level })}</span> · {t('player.id', { id: user.uid })}
          </div>
        </div>
      </NavLink>
      <span className="hidden h-8 w-px bg-white/10 md:block" />
      <div className="hidden md:block">
        <VipMeter />
      </div>
      <div className="md:hidden">
        <VipMeter compact />
      </div>
      <div className="ml-auto flex items-center gap-2 lg:gap-3">
        <div className="hidden items-center gap-1.5 rounded-full border border-pink-300/20 bg-black/30 px-2.5 py-1 lg:flex" title={t('player.charmDesc')}>
          <CharmIcon size={18} />
          <span className="text-sm font-semibold tabular-nums text-pink-100">{fmt(DEMO_EXTRAS.charm)}</span>
          <span className="text-[10px] text-white/45">{t('player.charm')}</span>
          <DemoTag />
        </div>
        <ChatButton />
        {(['silver', 'gold'] as const).map((c) => (
          <div key={c} className="gold-border flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-3" title={t(`currency.${c}`)}>
            <CurrencyIcon currency={c} size={28} />
            <span className={`text-sm font-bold tabular-nums ${c === 'gold' ? 'text-gold-100' : 'text-white'}`}>{fmt(c === 'gold' ? gold : balance)}</span>
          </div>
        ))}
      </div>
    </header>
  );
}

function NavRail() {
  const { t } = useTranslation();
  const badges: Record<string, number> = { '/support': useSocial((s) => s.unreadSupport) };
  return (
    <nav className="relative flex w-[60px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-gold-300/10 bg-ink-950/70 px-1.5 py-2 backdrop-blur-xl lg:w-52 lg:px-3 lg:py-4">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          title={t(item.label)}
          className={({ isActive }) =>
            `group relative flex shrink-0 items-center justify-center gap-3 rounded-xl px-2 py-2 transition lg:justify-start lg:px-3 ${
              isActive ? 'bg-gradient-to-r from-gold-300/20 to-transparent text-gold-100' : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-gold-sheen shadow-glow" />}
              <span className="relative">
                <NavIcon name={item.icon} active={isActive} size={22} />
                {!!badges[item.to] && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-ruby-500 ring-2 ring-ink-950" aria-label={String(badges[item.to])} />}
              </span>
              <span className="hidden truncate text-sm font-medium lg:inline">{t(item.label)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function DemoBanner() {
  const { t } = useTranslation();
  if (!IS_DEMO) return null;
  return (
    <div className="shrink-0 bg-gradient-to-r from-neon-cyan/20 via-neon-violet/25 to-neon-cyan/20 py-0.5 text-center text-[10px] font-semibold tracking-wide text-white/85">
      {t('demo.banner')}
    </div>
  );
}

/** Lobby-style screens: player bar on top, navigation rail on the left. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <DemoBanner />
      <PlayerBar />
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ icon, title, subtitle, right }: { icon: NavIconName; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="gold-border flex h-11 w-11 items-center justify-center rounded-xl">
          <NavIcon name={icon} size={24} active />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-gold lg:text-3xl">{title}</h1>
          {subtitle && <p className="text-sm text-white/50">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}
