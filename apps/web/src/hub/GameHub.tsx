import { vipProgress } from '@casino/shared';
import { useEffect, useRef, useState, type CSSProperties, type JSX, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { DEMO_EXTRAS } from '../demo';
import { formatChips } from '../lib/format';
import { CheckinPanel } from '../pages/CheckinPanel';
import { WelcomeModal } from '../pages/WelcomeModal';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { DemoBanner, DemoTag } from '../ui/AppShell';
import { Avatar } from '../ui/Avatar';
import { NavIcon, type NavIconName } from '../ui/NavIcons';
import { CurrencyIcon, PlayerName } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';
import { VipEmblem } from '../ui/VipEmblem';
import { BannerGiftArt, BannerRouletteArt, BlackjackArt, LiengArt, PokerArt, RouletteArt, SicBoArt, XiToArt } from './art/gameArt';
import { LoungeBackground } from './LoungeBackground';
import { Stage } from './Stage';

type GameId = 'poker' | 'sicbo' | 'roulette' | 'lieng' | 'xito' | 'blackjack';

/** Live games open their shared multiplayer table; the solo versions stay reachable from it. */
const LIVE_ROUTE: Partial<Record<GameId, string>> = {
  sicbo: '/tables/taixiu-1',
  roulette: '/tables/roulette-1',
  blackjack: '/bjt',
  poker: '/rooms?game=poker',
  lieng: '/rooms?game=lieng',
  xito: '/rooms?game=xito',
};

/** Official line-up. Royal Slots keeps its code and route but is not listed. */
const GAMES: { id: GameId; live: boolean; Art: () => JSX.Element }[] = [
  { id: 'poker', live: true, Art: PokerArt },
  { id: 'sicbo', live: true, Art: SicBoArt },
  { id: 'roulette', live: true, Art: RouletteArt },
  { id: 'lieng', live: true, Art: LiengArt },
  { id: 'xito', live: true, Art: XiToArt },
  { id: 'blackjack', live: true, Art: BlackjackArt },
];

const DOCK: { to: string; icon: NavIconName; label: string }[] = [
  { to: '/', icon: 'hub', label: 'nav.hub' },
  { to: '/rooms', icon: 'rooms', label: 'nav.rooms' },
  { to: '/market', icon: 'market', label: 'nav.market' },
  { to: '/collection', icon: 'collection', label: 'nav.collection' },
  { to: '/vip', icon: 'vip', label: 'nav.vip' },
  { to: '/rank', icon: 'rank', label: 'nav.rank' },
  { to: '/leaderboard', icon: 'leaderboard', label: 'nav.leaderboard' },
  { to: '/friends', icon: 'friends', label: 'nav.friends' },
  { to: '/guild', icon: 'guild', label: 'nav.guild' },
  { to: '/missions', icon: 'missions', label: 'nav.missions' },
  { to: '/support', icon: 'support', label: 'nav.support' },
  { to: '/profile', icon: 'profile', label: 'nav.profile' },
];

/** Design sizes in stage pixels for the 1080-high (desktop) and 720-high (phone) layouts. */
function sizes(compact: boolean) {
  return compact
    ? { pad: 20, gap: 16, hud: 96, dock: 108, avatar: 66, name: 26, small: 18, vip: 60, coin: 54, value: 27, side: 92, sideIcon: 34, label: 18, banner: 0.33, title: 40, body: 19, cta: 22, cardName: 24, cardSub: 16, plate: 78, play: 50, dockIcon: 34 }
    : { pad: 32, gap: 24, hud: 116, dock: 128, avatar: 84, name: 30, small: 20, vip: 74, coin: 66, value: 32, side: 116, sideIcon: 40, label: 20, banner: 0.33, title: 56, body: 22, cta: 26, cardName: 30, cardSub: 18, plate: 96, play: 60, dockIcon: 40 };
}
type Sizes = ReturnType<typeof sizes>;

function GoldFrame({ children, radius, className = '', style }: { children: ReactNode; radius: number; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`relative p-[2px] ${className}`}
      style={{ borderRadius: radius, background: 'linear-gradient(135deg,#fff1b8,#c9963a 30%,#6b4a12 55%,#f2c14e 80%,#fff1b8)', ...style }}
    >
      <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: radius - 2 }}>
        {children}
      </div>
    </div>
  );
}

function Hud({ s }: { s: Sizes }) {
  const { t, i18n } = useTranslation();
  const user = useSession((st) => st.user)!;
  const balance = useSession((st) => st.balance);
  const gold = useSession((st) => st.gold);
  const vip = vipProgress(DEMO_EXTRAS.vipExp);
  return (
    <header className="relative z-10 flex shrink-0 items-center" style={{ height: s.hud, paddingInline: s.pad, gap: s.gap * 1.4 }}>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#1c1245]/95 via-[#120b30]/85 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-3 h-[2px] bg-gradient-to-r from-transparent via-[#f2c14e]/70 to-transparent" />

      <Link to="/profile" className="relative flex items-center" style={{ gap: s.gap * 0.7 }}>
        <Avatar customAvatar={user.customAvatar} index={user.avatar} frame={user.frame} avatarItem={user.avatarItem} size={s.avatar} />
        <div className="min-w-0">
          <div style={{ fontSize: s.name }}>
            <PlayerName name={user.displayName} badges={user.badges} size={s.name * 0.95} className="max-w-[11em] font-bold" />
          </div>
          <div className="flex items-center gap-2 tabular-nums text-white/55" style={{ fontSize: s.small }}>
            <span className="rounded-full border border-gold-300/50 bg-black/40 px-2 font-bold text-gold-100">{t('level.short', { level: user.level })}</span>
            {t('player.id', { id: user.uid })}
          </div>
        </div>
      </Link>

      <Link to="/vip" className="relative flex items-center" style={{ gap: s.gap * 0.6 }}>
        <VipEmblem level={vip.level} size={s.vip} />
        <div style={{ width: s.vip * 3.4 }}>
          <div className="flex items-center justify-between">
            <span className="font-display font-bold text-[#f7d77a]" style={{ fontSize: s.name * 0.85 }}>
              VIP {vip.level}
            </span>
            <span style={{ transform: `scale(${s.small / 12})`, transformOrigin: 'right center' }}>
              <DemoTag />
            </span>
          </div>
          <div className="relative mt-1 overflow-hidden rounded-full bg-black/55 ring-1 ring-white/10" style={{ height: s.small * 0.6 }}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#a8700f] via-[#f2c14e] to-[#fff1b8]" style={{ width: `${vip.ratio * 100}%` }} />
          </div>
          <div className="mt-1 tabular-nums text-white/55" style={{ fontSize: s.small * 0.85 }}>
            {formatChips(DEMO_EXTRAS.vipExp, i18n.language)} / {vip.next ? formatChips(vip.next.exp, i18n.language) : '—'} EXP
          </div>
        </div>
      </Link>

      <div className="relative ml-auto flex items-center" style={{ gap: s.gap }}>
        {(['silver', 'gold'] as const).map((c) => (
          <div key={c} className="relative flex items-center" title={t(`currency.${c}`)} style={{ paddingLeft: s.coin * 0.55 }}>
            <div
              className="flex items-center rounded-full border border-[#f2c14e]/60 bg-gradient-to-b from-[#241a4d] to-[#0d0920] shadow-[inset_0_2px_0_rgba(255,255,255,0.08),0_6px_16px_rgba(0,0,0,0.5)]"
              style={{ height: s.coin * 0.78, paddingLeft: s.coin * 0.62, paddingRight: s.coin * 0.42, minWidth: s.coin * 3 }}
            >
              <span className={`font-bold tabular-nums ${c === 'gold' ? 'text-[#ffe08a]' : 'text-white'}`} style={{ fontSize: s.value }}>
                {formatChips(c === 'gold' ? gold : balance, i18n.language)}
              </span>
            </div>
            <div className="absolute left-0 top-1/2 -translate-y-1/2">
              <CurrencyIcon currency={c} size={s.coin} />
            </div>
          </div>
        ))}
        {user.permissions.includes('admin.access') && (
          <Link
            to="/admin"
            title={t('nav.admin')}
            aria-label={t('nav.admin')}
            className="flex items-center justify-center rounded-full border border-[#f2c14e]/70 bg-gradient-to-b from-[#493074] to-[#1c103e] px-3 font-bold text-[#ffe08a] transition hover:brightness-125"
            style={{ height: s.coin * 0.85, fontSize: s.small * 0.85 }}
          >
            {t('nav.admin')}
          </Link>
        )}
        <Link
          to="/settings"
          title={t('nav.settings')}
          className="flex items-center justify-center rounded-full border border-[#f2c14e]/50 bg-gradient-to-b from-[#2a1f58] to-[#110b28] transition hover:brightness-125 active:scale-95"
          style={{ width: s.coin * 0.85, height: s.coin * 0.85 }}
        >
          <NavIcon name="settings" size={s.sideIcon * 0.85} active />
        </Link>
      </div>
    </header>
  );
}

function SideButton({ s, icon, label, onClick, to, dot = false }: { s: Sizes; icon: NavIconName; label: string; onClick?: () => void; to?: string; dot?: boolean }) {
  const inner = (
    <>
      <span
        className="relative flex items-center justify-center rounded-full bg-gradient-to-b from-[#3a2a7a] to-[#140c30] shadow-[0_8px_18px_rgba(0,0,0,0.55),inset_0_2px_0_rgba(255,255,255,0.15)] ring-2 ring-[#f2c14e]/70 transition group-hover:-translate-y-1 group-hover:ring-[#ffe08a] group-active:scale-95"
        style={{ width: s.side * 0.72, height: s.side * 0.72 }}
      >
        <NavIcon name={icon} size={s.sideIcon} active />
        {dot && <span className="absolute right-0 top-0 rounded-full bg-[#ff3b5c] ring-2 ring-[#140c30]" style={{ width: s.small * 0.7, height: s.small * 0.7 }} />}
      </span>
      <span className="mt-1.5 text-center font-semibold leading-tight text-white/85 [text-shadow:0_2px_4px_rgba(0,0,0,0.8)]" style={{ fontSize: s.label * 0.9 }}>
        {label}
      </span>
    </>
  );
  const cls = 'group flex flex-col items-center';
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

interface Slide {
  key: 'roulette' | 'welcome' | 'vip';
  art: ReactNode;
  action: () => void;
}

function Banner({ s, openCheckin }: { s: Sizes; openCheckin: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reduceMotion = useSettings((st) => st.reduceMotion);
  const [index, setIndex] = useState(0);
  const slides: Slide[] = [
    { key: 'roulette', art: <BannerRouletteArt />, action: () => navigate('/tables/roulette-1') },
    { key: 'welcome', art: <BannerGiftArt />, action: openCheckin },
    {
      key: 'vip',
      art: (
        <div className="relative h-full w-full bg-[radial-gradient(circle_at_70%_40%,#4a2a8a,#160d38_60%,#07051a)]">
          <div className="absolute inset-0 bg-[repeating-conic-gradient(from_0deg_at_70%_42%,rgba(242,193,78,0.12)_0deg_6deg,transparent_6deg_15deg)]" />
          <div className="absolute right-[8%] top-1/2 -translate-y-[58%] drop-shadow-[0_20px_30px_rgba(0,0,0,0.6)]" style={{ width: '46%' }}>
            <div className="flex items-end justify-center gap-[4%]">
              <div className="w-[26%] opacity-80">
                <VipEmblemFill level={10} />
              </div>
              <div className="w-[42%]">
                <VipEmblemFill level={15} />
              </div>
              <div className="w-[26%] opacity-80">
                <VipEmblemFill level={13} />
              </div>
            </div>
          </div>
        </div>
      ),
      action: () => navigate('/vip'),
    },
  ];

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), 7000);
    return () => clearInterval(id);
  }, [reduceMotion, slides.length]);

  const slide = slides[index]!;
  return (
    <GoldFrame radius={30} className="h-full shadow-[0_24px_50px_rgba(0,0,0,0.6)]">
      {slides.map((sl, i) => (
        <div
          key={sl.key}
          className={`absolute inset-0 transition-[opacity,transform] duration-1000 ease-out ${i === index ? 'scale-100 opacity-100' : 'scale-105 opacity-0'}`}
        >
          {sl.art}
        </div>
      ))}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07051a] via-[#07051a]/55 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-start" style={{ padding: s.pad, gap: s.gap * 0.5 }}>
        <span
          key={`k${index}`}
          className="animate-rise rounded-full border border-[#f2c14e]/60 bg-black/40 font-bold uppercase tracking-[0.18em] text-[#f7d77a] backdrop-blur"
          style={{ fontSize: s.small * 0.85, paddingInline: s.small * 0.8, paddingBlock: s.small * 0.2 }}
        >
          {t(`hub.slides.${slide.key}.kicker`)}
        </span>
        <h2 key={`t${index}`} className="animate-rise font-display font-bold leading-[1.05] text-white [text-shadow:0_4px_16px_rgba(0,0,0,0.7)]" style={{ fontSize: s.title }}>
          {t(`hub.slides.${slide.key}.title`)}
        </h2>
        <p key={`b${index}`} className="animate-rise text-white/80 [text-shadow:0_2px_6px_rgba(0,0,0,0.8)]" style={{ fontSize: s.body, maxWidth: '26em' }}>
          {t(`hub.slides.${slide.key}.body`)}
        </p>
        <div className="mt-1 flex w-full items-center justify-between">
          <button
            onClick={() => {
              sfx.click();
              slide.action();
            }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#fff1b8] via-[#f2c14e] to-[#b9801c] font-bold text-[#1a1036] shadow-[0_10px_24px_rgba(185,128,28,0.45),inset_0_2px_0_rgba(255,255,255,0.7)] transition hover:brightness-110 active:scale-95"
            style={{ fontSize: s.cta, paddingInline: s.cta * 1.3, height: s.cta * 2.4 }}
          >
            <span className="sheen" />
            <span className="relative">{t(`hub.slides.${slide.key}.cta`)}</span>
          </button>
          <div className="flex" style={{ gap: s.gap * 0.5 }}>
            {slides.map((sl, i) => (
              <button
                key={sl.key}
                aria-label={t(`hub.slides.${sl.key}.title`)}
                onClick={() => setIndex(i)}
                className={`rounded-full transition-all ${i === index ? 'bg-[#f2c14e]' : 'bg-white/30 hover:bg-white/60'}`}
                style={{ height: s.small * 0.55, width: i === index ? s.small * 2 : s.small * 0.55 }}
              />
            ))}
          </div>
        </div>
      </div>
    </GoldFrame>
  );
}

/** VipEmblem stretched to its container width. */
function VipEmblemFill({ level }: { level: number }) {
  return (
    <div className="aspect-square w-full [&>svg]:h-full [&>svg]:w-full">
      <VipEmblem level={level} size={48} />
    </div>
  );
}

function GameCard({ s, game, index, cardW }: { s: Sizes; game: (typeof GAMES)[number]; index: number; cardW: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useSettings((st) => st.reduceMotion);
  const [shake, setShake] = useState(false);
  const name = t(`games.${game.id}.name`);

  const onMove = (e: React.PointerEvent) => {
    if (reduceMotion || e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - y) * 9}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 11}deg`);
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };
  const open = () => {
    sfx.click();
    if (game.live) navigate(LIVE_ROUTE[game.id] ?? `/play/${game.id}`);
    else {
      toast(t('hub.soonToast', { game: name }));
      setShake(true);
      setTimeout(() => setShake(false), 450);
    }
  };

  return (
    <div className="animate-rise [perspective:1200px]" style={{ animationDelay: `${120 + index * 70}ms` }}>
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={name}
        title={t(`games.${game.id}.desc`)}
        onClick={open}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open()}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className={`group relative h-full cursor-pointer outline-none transition-transform duration-200 ease-out [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] [transform-style:preserve-3d] focus-visible:ring-4 focus-visible:ring-[#ffe08a]/70 ${shake ? 'animate-[shake_0.45s]' : ''}`}
        style={{ borderRadius: 26 }}
      >
        <GoldFrame radius={26} className="h-full shadow-[0_18px_40px_rgba(0,0,0,0.55)] transition-shadow duration-300 group-hover:shadow-[0_26px_60px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,224,138,0.4)]">
          <div className="flex h-full flex-col bg-[#0b0820]">
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div className={`h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.06] ${game.live ? '' : 'saturate-[0.75]'}`}>
                <game.Art />
              </div>
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 [background:radial-gradient(circle_at_var(--mx,50%)_var(--my,30%),rgba(255,240,200,0.22),transparent_45%)]" />
              {!game.live && (
                <span
                  className="absolute right-0 top-0 rounded-bl-2xl bg-gradient-to-b from-[#2a1f58] to-[#110b28] font-bold uppercase tracking-[0.14em] text-[#f7d77a] shadow-lg ring-1 ring-[#f2c14e]/50"
                  style={{ fontSize: s.cardSub * 0.85, paddingInline: s.cardSub, paddingBlock: s.cardSub * 0.4 }}
                >
                  {t('hub.comingSoon')}
                </span>
              )}
            </div>
            <div
              className="relative flex shrink-0 items-center border-t border-[#f2c14e]/40 bg-gradient-to-b from-[#1b1340] to-[#0a0720]"
              style={{ height: s.plate, paddingInline: s.cardName * 0.6, gap: s.gap * 0.5 }}
            >
              <div className="min-w-0 flex-1">
                <div
                  className="font-display font-bold leading-[1.1] text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [overflow-wrap:anywhere]"
                  style={{ fontSize: Math.min(s.cardName, Math.max(s.cardSub * 1.15, cardW / 11.5)) }}
                >
                  {name}
                </div>
              </div>
              {game.live && (
                <span
                  className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#fff1b8] via-[#f2c14e] to-[#b9801c] shadow-[0_6px_16px_rgba(185,128,28,0.5),inset_0_2px_0_rgba(255,255,255,0.7)] transition group-hover:scale-110"
                  style={{ width: s.play, height: s.play }}
                  aria-hidden
                >
                  <svg viewBox="0 0 24 24" width={s.play * 0.42} height={s.play * 0.42}>
                    <path d="M8 5.5v13l10.5-6.5z" fill="#1a1036" />
                  </svg>
                </span>
              )}
            </div>
          </div>
        </GoldFrame>
      </div>
    </div>
  );
}

function Dock({ s }: { s: Sizes }) {
  const { t } = useTranslation();
  // Keep the chat shortcut outside the central lobby dock, aligned at its left edge.
  // Compact layouts use smaller icons so the expanded navigation remains usable in landscape.
  const iconSize = Math.round(s.dockIcon * 0.72);
  const itemWidth = s.dockIcon * 2.05;
  return (
    <div className="relative z-10 grid shrink-0 grid-cols-[1fr_minmax(0,auto)_1fr] items-end" style={{ height: s.dock, paddingBottom: s.pad * 0.5, paddingInline: s.pad }}>
      <Link
        to="/chat"
        title={t('nav.chat')}
        aria-label={t('nav.chat')}
        className="group flex w-fit flex-col items-center justify-center self-center rounded-2xl border border-[#f2c14e]/45 bg-gradient-to-b from-[#241a4d]/95 to-[#0a0720]/95 px-3 py-2 text-[#ffe08a] shadow-lg transition hover:brightness-125"
      >
        <NavIcon name="chat" size={iconSize} active />
        <span className="mt-1 whitespace-nowrap font-semibold" style={{ fontSize: s.label * 0.75 }}>{t('nav.chat')}</span>
      </Link>
      <nav aria-label={t('nav.hub')} className="min-w-0 max-w-full overflow-x-auto rounded-[28px] border border-[#f2c14e]/45 bg-gradient-to-b from-[#1e1546]/95 to-[#0a0720]/95 shadow-[0_-6px_30px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="flex w-max items-stretch" style={{ paddingInline: s.gap * 0.35, gap: s.gap * 0.1 }}>
          {DOCK.map((item) => {
            const active = item.to === '/';
            return (
              <Link
                key={item.to}
                to={item.to}
                title={t(item.label)}
                className={`group relative flex shrink-0 flex-col items-center justify-center transition ${active ? '-translate-y-[8%]' : 'hover:-translate-y-1'}`}
                style={{ minWidth: itemWidth, paddingInline: s.dockIcon * 0.15, paddingBlock: s.dockIcon * 0.18 }}
              >
                <span
                  className={`relative flex items-center justify-center rounded-full transition ${
                    active
                      ? 'bg-gradient-to-b from-[#fff1b8] via-[#f2c14e] to-[#8a5a12] shadow-[0_8px_20px_rgba(242,193,78,0.35)] ring-2 ring-[#fff1b8]/60 [&_path]:!stroke-[#1a1036]'
                      : 'group-hover:bg-white/5'
                  }`}
                  style={{ width: iconSize * 1.5, height: iconSize * 1.5 }}
                >
                  <NavIcon name={item.icon} size={iconSize} active={active} />
                </span>
                <span className={`relative mt-1 whitespace-nowrap font-semibold ${active ? 'text-[#ffe08a]' : 'text-white/70 group-hover:text-white'}`} style={{ fontSize: s.label * 0.72 }}>
                  {t(item.label)}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
      <span aria-hidden="true" />
    </div>
  );
}

export function GameHub() {
  const { t } = useTranslation();
  const user = useSession((st) => st.user)!;
  const [checkinOpen, setCheckinOpen] = useState(false);

  return (
    <div className="flex h-full flex-col bg-[#05040f]">
      <DemoBanner />
      <WelcomeModal />
      <div className="relative min-h-0 flex-1">
        <LoungeBackground />
        <Stage>
          {({ compact, width }) => {
            const s = sizes(compact);
            const cardW = (width - s.pad * 2 - s.side - s.gap * 4 - (width - s.pad * 2) * s.banner) / 3;
            return (
              <div className="relative flex h-full flex-col text-white">
                <Hud s={s} />
                <main className="flex min-h-0 flex-1" style={{ paddingInline: s.pad, gap: s.gap, paddingTop: s.gap * 0.5 }}>
                  <div className="flex shrink-0 flex-col items-center justify-center" style={{ width: s.side, gap: s.gap * 1.2 }}>
                    <SideButton s={s} icon="gifts" label={t('checkin.claim')} onClick={() => setCheckinOpen(true)} dot={!user.checkin.claimedToday} />
                    <SideButton s={s} icon="mail" label={t('nav.mail')} to="/mail" dot={user.unreadMail > 0} />
                    <SideButton s={s} icon="market" label={t('nav.market')} to="/market" />
                  </div>
                  <div className="shrink-0 animate-rise" style={{ width: `${s.banner * 100}%` }}>
                    <Banner s={s} openCheckin={() => setCheckinOpen(true)} />
                  </div>
                  <div className="grid min-w-0 flex-1 grid-cols-3 grid-rows-2" style={{ gap: s.gap }}>
                    {GAMES.map((g, i) => (
                      <GameCard key={g.id} s={s} game={g} index={i} cardW={cardW} />
                    ))}
                  </div>
                </main>
                <Dock s={s} />
              </div>
            );
          }}
        </Stage>
      </div>
      {checkinOpen && (
        <div className="overlay z-40 flex items-center justify-center bg-[#05040f]/80 backdrop-blur-sm" onClick={() => setCheckinOpen(false)} role="dialog" aria-modal="true">
          <div className="w-full max-w-md animate-rise" onClick={(e) => e.stopPropagation()}>
            <CheckinPanel />
            <button onClick={() => setCheckinOpen(false)} className="mx-auto mt-3 block rounded-full border border-white/20 px-5 py-1.5 text-sm text-white/70 hover:text-white">
              {t('nav.back')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
