import { vipTierOf, type Badge, type PresenceStatus, type PublicIdentity, type RankBadge } from '@casino/shared';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { socket } from '../net/socket';
import { Avatar } from '../ui/Avatar';
import { PlayerName } from '../ui/OfficialAssets';
import { RankEmblem, useRankName } from '../ui/RankEmblem';
import { VipEmblem } from '../ui/VipEmblem';
import { PlayerTrigger } from './PlayerActions';

/**
 * How a player is shown everywhere: round avatar (uploaded photo or equipped avatar) inside the
 * equipped frame, the VIP badge on the avatar's bottom corner (never over the face), the rank right
 * after the name, then Verified/Partner badges. Live changes arrive as 'identity' events and are
 * merged over whatever the list or table sent, so every screen redraws without a reload.
 */

/** The fields a player shown anywhere may carry (older payloads may lack the newer ones). */
export interface IdentityLike {
  uid: number;
  displayName: string;
  avatar: number;
  avatarItem: string | null;
  frame: string;
  badges?: readonly Badge[];
  customAvatar?: string | null;
  vipLevel?: number;
  /** Season rank badge (a number here is a leaderboard position and is ignored). */
  rank?: RankBadge | number | null;
  title?: string | null;
}

interface Counts {
  followers: number;
  likes: number;
  charm: number;
}

interface IdentityStore {
  live: Record<number, PublicIdentity>;
  counts: Record<number, Counts>;
}
export const useIdentityStore = create<IdentityStore>(() => ({ live: {}, counts: {} }));

let wired = false;
/** Wires realtime identity/counter events once per app. */
export function startIdentitySync() {
  if (wired) return;
  wired = true;
  socket.listen((ev) => {
    if (ev.event === 'identity') useIdentityStore.setState((s) => ({ live: { ...s.live, [ev.data.uid]: ev.data } }));
    else if (ev.event === 'counts') useIdentityStore.setState((s) => ({ counts: { ...s.counts, [ev.data.uid]: { followers: ev.data.followers, likes: ev.data.likes, charm: ev.data.charm } } }));
  });
}

/** The player with any newer live identity merged in. */
export function useLiveIdentity<T extends IdentityLike>(p: T): T {
  const live = useIdentityStore((s) => s.live[p.uid]);
  if (!live) return p;
  return { ...p, displayName: live.displayName, avatar: live.avatar, avatarItem: live.avatarItem, frame: live.frame, badges: live.badges, customAvatar: live.customAvatar, vipLevel: live.vipLevel, rank: typeof p.rank === 'object' && p.rank?.topTitle ? p.rank : (live.rank ?? p.rank) };
}

/** Live public counters for a profile (follow, like, gift), falling back to the loaded values. */
export function useLiveCounts(uid: number, loaded: Counts): Counts {
  return useIdentityStore((s) => s.counts[uid]) ?? loaded;
}

/** Mount once: keeps the identity store wired even on pages without lists. */
export function IdentitySync() {
  useEffect(startIdentitySync, []);
  return null;
}

// ---------------------------------------------------------------- badges

const TIER_LABEL_KEYS = { silver: 'identity.tiers.silver', gold: 'identity.tiers.gold', platinum: 'identity.tiers.platinum', diamond: 'identity.tiers.diamond', royal: 'identity.tiers.royal' } as const;

/** VIP shield; tooltip names the level and tier. Hidden for the base level unless `always`. */
export function PlayerVipBadge({ level, size = 18, always = false }: { level: number | undefined; size?: number; always?: boolean }) {
  const { t } = useTranslation();
  if (!level || (level <= 1 && !always)) return null;
  const label = t('identity.vipTooltip', { level, tier: t(TIER_LABEL_KEYS[vipTierOf(level)]) });
  return (
    <span title={label} aria-label={label} className="inline-flex shrink-0">
      <VipEmblem level={level} size={size} />
    </span>
  );
}

/** Current-season rank emblem with its name as tooltip. */
export function PlayerRankBadge({ rank, size = 16 }: { rank: RankBadge | number | null | undefined; size?: number }) {
  const rankName = useRankName();
  if (!rank || typeof rank !== 'object') return null;
  const label = rankName(rank.division, rank.topTitle);
  return (
    <span title={label} aria-label={label} className="inline-flex shrink-0">
      <RankEmblem division={rank.division} top={rank.topTitle} size={size} />
    </span>
  );
}

/** Online (green), in a game (amber), offline (grey). */
export function PresenceDot({ status, className = '' }: { status: PresenceStatus | boolean | null | undefined; className?: string }) {
  const { t } = useTranslation();
  if (status === null || status === undefined) return null;
  const s: PresenceStatus = status === true ? 'online' : status === false ? 'offline' : status;
  const tone = s === 'online' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]' : s === 'in_game' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]' : 'bg-white/30';
  return <span role="img" aria-label={t(`identity.presence.${s}`)} title={t(`identity.presence.${s}`)} className={`block h-3 w-3 rounded-full ring-2 ring-ink-900 ${tone} ${className}`} />;
}

// ---------------------------------------------------------------- avatar

/**
 * Round avatar + frame, VIP badge on the bottom-right corner (outside the face area) and an
 * optional presence dot on the top-right.
 */
export function PlayerAvatar({ player, size = 44, status, vip = true, animated = false }: { player: IdentityLike; size?: number; status?: PresenceStatus | boolean | null; vip?: boolean; animated?: boolean }) {
  const p = useLiveIdentity(player);
  const badge = Math.max(14, Math.round(size * 0.4));
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <Avatar index={p.avatar} frame={p.frame} avatarItem={p.avatarItem} customAvatar={p.customAvatar ?? null} size={size} animated={animated} />
      {vip && (p.vipLevel ?? 1) > 1 && (
        <span className="pointer-events-none absolute" style={{ right: -badge * 0.28, bottom: -badge * 0.22 }}>
          <PlayerVipBadge level={p.vipLevel} size={badge} />
        </span>
      )}
      {status !== undefined && status !== null && (
        <span className="pointer-events-none absolute" style={{ right: size * 0.02, top: size * 0.02 }}>
          <PresenceDot status={status} />
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- identity rows

/**
 * Avatar, name, rank right after the name, Verified/Partner badges, optional title, UID and a
 * subtitle. Clicking opens the quick profile when `context` is given.
 */
export function PlayerIdentity({
  player,
  size = 44,
  status,
  showUid = false,
  sub,
  context,
  nameClass = '',
}: {
  player: IdentityLike;
  size?: number;
  status?: PresenceStatus | boolean | null;
  showUid?: boolean;
  sub?: ReactNode;
  context?: string;
  nameClass?: string;
}) {
  const p = useLiveIdentity(player);
  const body = (
    <span className="flex min-w-0 items-center gap-3">
      <PlayerAvatar player={p} size={size} status={status} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1">
          <PlayerName name={p.displayName} badges={p.badges ?? []} size={14} className={`min-w-0 font-strong text-white ${nameClass}`} />
          <PlayerRankBadge rank={p.rank} size={16} />
        </span>
        {(showUid || sub) && (
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-white/50">
            {showUid && <span className="tabular-nums">UID {p.uid}</span>}
            {sub}
          </span>
        )}
      </span>
    </span>
  );
  return context ? (
    <PlayerTrigger uid={p.uid} context={context} label={p.displayName}>
      {body}
    </PlayerTrigger>
  ) : (
    body
  );
}

/** One-line version for tight places (table seats, rosters, spectator lists, chat lines). */
export function PlayerIdentityCompact({ player, size = 26, context, status, className = '' }: { player: IdentityLike; size?: number; context?: string; status?: PresenceStatus | boolean | null; className?: string }) {
  const p = useLiveIdentity(player);
  const body = (
    <span className={`flex min-w-0 items-center gap-1.5 ${className}`}>
      <PlayerAvatar player={p} size={size} status={status} />
      <PlayerName name={p.displayName} badges={p.badges ?? []} size={12} className="min-w-0 text-xs text-white/90" />
      <PlayerRankBadge rank={p.rank} size={14} />
    </span>
  );
  return context ? (
    <PlayerTrigger uid={p.uid} context={context} label={p.displayName}>
      {body}
    </PlayerTrigger>
  ) : (
    body
  );
}
