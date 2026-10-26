import type { PlayerProfileView } from '@casino/shared';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { errorText } from '../lib/errors';
import { api } from '../net/api';
import { Avatar } from '../ui/Avatar';
import { PlayerName } from '../ui/OfficialAssets';
import { RankEmblem, useRankName } from '../ui/RankEmblem';
import { toast } from '../ui/toast';
import { ReportDialog } from './ReportDialog';

/**
 * One interaction menu for every place a player's name or avatar appears (chat, friends, guild,
 * leaderboards, tables, rooms, search, follower lists). Wrap the name/avatar in <PlayerTrigger>;
 * a single <PlayerActionHost> renders the popover, so menus never stack.
 */

interface OpenState {
  uid: number;
  rect: { top: number; left: number; bottom: number; right: number };
  /** Where the player was seen (sent with a report), e.g. "chat:server". */
  context?: string;
  returnFocus?: HTMLElement | null;
}
interface PlayerMenuStore {
  open: OpenState | null;
  show(s: OpenState): void;
  hide(): void;
}
export const usePlayerMenu = create<PlayerMenuStore>((set) => ({
  open: null,
  show: (open) => set({ open }),
  hide: () => set({ open: null }),
}));

/** Fired after any relationship change so lists on screen can refresh. */
const relationEvents = new EventTarget();
export function onRelationChange(fn: () => void): () => void {
  const h = () => fn();
  relationEvents.addEventListener('change', h);
  return () => relationEvents.removeEventListener('change', h);
}
export const relationChanged = () => relationEvents.dispatchEvent(new Event('change'));

/** Makes a name or avatar open the interaction menu (mouse, touch and keyboard). */
export function PlayerTrigger({ uid, context, className = '', children, label }: { uid: number; context?: string; className?: string; children: ReactNode; label?: string }) {
  const { t } = useTranslation();
  const show = usePlayerMenu((s) => s.show);
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-label={label ? t('people.menu', { name: label }) : undefined}
      className={`min-w-0 cursor-pointer rounded-lg text-left outline-none ring-gold-300/70 transition hover:brightness-110 focus-visible:ring-2 ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        show({ uid, context, rect: { top: r.top, left: r.left, bottom: r.bottom, right: r.right }, returnFocus: e.currentTarget });
      }}
    >
      {children}
    </button>
  );
}

/**
 * The actions that fit a relationship, shared by the popover and the profile page. Every call goes
 * to the server, which re-checks everything (self actions, blocks, limits); the UI only mirrors it.
 */
export function usePlayerActionRunner(reload: () => void) {
  const { t, i18n } = useTranslation();
  return useCallback(
    async (path: string, uid: number, done: string) => {
      try {
        const res = await api<{ status?: string }>(path, { method: 'POST', body: { uid } });
        toast(t(`people.done.${res?.status === 'friends' ? 'friends' : done}`), 'success');
        relationChanged();
        reload();
        return true;
      } catch (err) {
        toast(errorText(t, err, i18n.language), 'error');
        return false;
      }
    },
    [t, i18n.language, reload],
  );
}

type ActionItem = { key: string; label: string; onSelect: () => void; tone?: 'danger' | 'gold'; confirm?: string; disabled?: boolean };

/** Builds the list of actions for a profile (used by the popover and the profile page). */
export function usePlayerActionItems(p: PlayerProfileView | null, reload: () => void, opts: { onReport: () => void; onViewProfile?: () => void; inPopover?: boolean }): ActionItem[] {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const run = usePlayerActionRunner(reload);
  if (!p) return [];
  const name = p.displayName;
  const items: ActionItem[] = [];
  if (p.relation === 'self') {
    if (opts.onViewProfile) items.push({ key: 'view', label: t('people.myProfile'), onSelect: opts.onViewProfile, tone: 'gold' });
    items.push({ key: 'privacy', label: t('people.privacy'), onSelect: () => navigate(`/player/${p.uid}#privacy`) });
    return items;
  }
  if (opts.onViewProfile) items.push({ key: 'view', label: t('people.viewProfile'), onSelect: opts.onViewProfile, tone: 'gold' });
  const blocked = p.social.blocked || p.social.blockedBy;
  if (!blocked) {
    if (p.relation === 'none') items.push({ key: 'add', label: t('people.addFriend'), onSelect: () => void run('/api/friends/request', p.uid, 'request') });
    if (p.relation === 'outgoing') {
      items.push({ key: 'pending', label: t('people.pending'), onSelect: () => {}, disabled: true });
      items.push({ key: 'cancel', label: t('people.cancelRequest'), onSelect: () => void run('/api/friends/cancel', p.uid, 'cancelled') });
    }
    if (p.relation === 'incoming') {
      items.push({ key: 'accept', label: t('people.accept'), onSelect: () => void run('/api/friends/accept', p.uid, 'accepted'), tone: 'gold' });
      items.push({ key: 'decline', label: t('people.decline'), onSelect: () => void run('/api/friends/decline', p.uid, 'declined') });
    }
    if (p.relation === 'friend') items.push({ key: 'message', label: t('people.message'), onSelect: () => navigate(`/chat?dm=${p.uid}`) });
    items.push(
      p.social.following
        ? { key: 'unfollow', label: t('people.unfollow'), onSelect: () => void run('/api/players/unfollow', p.uid, 'unfollowed') }
        : { key: 'follow', label: t('people.follow'), onSelect: () => void run('/api/players/follow', p.uid, 'followed') },
    );
    if (!opts.inPopover) {
      items.push(
        p.social.liked
          ? { key: 'unlike', label: t('people.unlike'), onSelect: () => void run('/api/players/unlike', p.uid, 'unliked') }
          : { key: 'like', label: t('people.like'), onSelect: () => void run('/api/players/like', p.uid, 'liked') },
      );
    }
    if (p.relation === 'friend') items.push({ key: 'unfriend', label: t('people.unfriend'), onSelect: () => void run('/api/friends/remove', p.uid, 'removed'), confirm: t('people.confirmUnfriend', { name }), tone: 'danger' });
  }
  items.push({ key: 'report', label: t('people.report'), onSelect: opts.onReport, tone: 'danger' });
  items.push(
    p.social.blocked
      ? { key: 'unblock', label: t('people.unblock'), onSelect: () => void run('/api/players/unblock', p.uid, 'unblocked') }
      : { key: 'block', label: t('people.block'), onSelect: () => void run('/api/players/block', p.uid, 'blocked'), confirm: t('people.confirmBlock', { name }), tone: 'danger' },
  );
  return items;
}

const WIDTH = 264;
const MARGIN = 8;

/** Mount once inside the router. */
export function PlayerActionHost() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const rankName = useRankName();
  const { open, hide } = usePlayerMenu();
  const [p, setP] = useState<PlayerProfileView | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [report, setReport] = useState<{ uid: number; displayName: string; context?: string } | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; origin: string } | null>(null);
  const [shown, setShown] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const uid = open?.uid;
  const load = useCallback(() => {
    if (!uid) return;
    setFailed(false);
    api<{ player: PlayerProfileView }>(`/api/players/${uid}`).then(
      (r) => setP(r.player),
      (err) => {
        setFailed(true);
        toast(errorText(t, err, i18n.language), 'error');
      },
    );
  }, [uid, t, i18n.language]);

  useEffect(() => {
    setP(null);
    setConfirming(null);
    setShown(false);
    if (uid) {
      load();
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
  }, [uid, load]);

  const close = useCallback(() => {
    const back = usePlayerMenu.getState().open?.returnFocus;
    hide();
    back?.focus?.();
  }, [hide]);

  // Place next to the trigger, flipping above / clamping inside the viewport near the edges.
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const h = box.current?.offsetHeight ?? 280;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = open.rect.bottom + MARGIN + h <= vh || open.rect.top - MARGIN - h < 0;
    const top = below ? Math.min(open.rect.bottom + MARGIN, vh - h - MARGIN) : Math.max(MARGIN, open.rect.top - MARGIN - h);
    const left = Math.min(Math.max(MARGIN, open.rect.left), vw - WIDTH - MARGIN);
    setPos({ top: Math.max(MARGIN, top), left, origin: below ? 'top' : 'bottom' });
  }, [open, p, confirming]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const buttons = [...(box.current?.querySelectorAll<HTMLButtonElement>('button[data-item]:not(:disabled)') ?? [])];
        if (!buttons.length) return;
        e.preventDefault();
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]!.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    const onResize = () => close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close]);

  // Focus the first action once loaded (keyboard users start inside the menu).
  useEffect(() => {
    if (p) box.current?.querySelector<HTMLButtonElement>('button[data-item]:not(:disabled)')?.focus({ preventScroll: true });
  }, [p]);

  const items = usePlayerActionItems(p, load, {
    inPopover: true,
    onViewProfile: () => {
      if (!p) return;
      hide();
      navigate(`/player/${p.uid}`);
    },
    onReport: () => {
      if (!p) return;
      setReport({ uid: p.uid, displayName: p.displayName, context: open?.context });
      hide();
    },
  });

  return (
    <>
      {open && (
        <div
          ref={box}
          role="menu"
          aria-label={p ? t('people.menu', { name: p.displayName }) : undefined}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: WIDTH, transformOrigin: pos?.origin ?? 'top' }}
          className={`fixed z-[80] overflow-hidden rounded-2xl border border-gold-300/25 bg-ink-900/95 shadow-[0_18px_50px_-10px_rgba(0,0,0,0.8)] backdrop-blur-xl transition duration-150 ease-out motion-reduce:transition-none ${shown ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
        >
          {!p ? (
            <div className="p-4 text-sm text-white/50">{failed ? '—' : t('app.loading')}</div>
          ) : (
            <>
              <div className="flex items-center gap-3 bg-gradient-to-r from-fuchsia-600/25 via-violet-600/15 to-transparent p-3">
                <div className="relative shrink-0">
                  <Avatar index={p.avatar} frame={p.frame} avatarItem={p.avatarItem} size={48} />
                  {p.online !== null && <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-ink-900 ${p.online ? 'bg-emerald-400' : 'bg-white/25'}`} />}
                </div>
                <div className="min-w-0 flex-1">
                  <PlayerName name={p.displayName} badges={p.badges} size={14} className="max-w-full font-strong text-white" />
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/55">
                    <span className="tabular-nums">UID {p.uid}</span>
                    <span className="rounded bg-gold-300/15 px-1 font-label text-gold-100">{t('social.level', { level: p.level })}</span>
                    <span className="rounded bg-fuchsia-400/15 px-1 font-label text-fuchsia-100">{t('people.profile.vip', { level: p.vip.level })}</span>
                  </div>
                  {p.rank && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/70">
                      <RankEmblem division={p.rank.division} top={p.rank.topTitle} size={18} />
                      <span className="truncate">{rankName(p.rank.division, p.rank.topTitle)}</span>
                    </div>
                  )}
                </div>
              </div>
              {(p.social.blockedBy || p.social.blocked || p.social.followedBy) && (
                <p className="border-b border-white/5 px-3 py-1.5 text-[11px] text-white/55">
                  {p.social.blockedBy ? t('people.blockedBy') : p.social.blocked ? t('people.youBlocked') : t('people.followsYou')}
                </p>
              )}
              <div className="flex flex-col p-1.5">
                {items.map((it) =>
                  confirming === it.key ? (
                    <div key={it.key} className="m-1 rounded-xl bg-ruby-500/10 p-2 text-xs text-white/80">
                      <p>{it.confirm}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          data-item
                          className="rounded-lg bg-ruby-500/80 px-3 py-1 font-strong text-white hover:bg-ruby-500"
                          onClick={() => {
                            setConfirming(null);
                            it.onSelect();
                          }}
                        >
                          {it.label}
                        </button>
                        <button type="button" data-item className="rounded-lg px-3 py-1 text-white/70 hover:bg-white/10" onClick={() => setConfirming(null)}>
                          {t('people.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      key={it.key}
                      type="button"
                      role="menuitem"
                      data-item
                      disabled={it.disabled}
                      onClick={() => (it.confirm ? setConfirming(it.key) : it.onSelect())}
                      className={`rounded-xl px-3 py-2 text-left text-sm outline-none transition hover:bg-white/10 focus-visible:bg-white/10 disabled:opacity-50 ${
                        it.tone === 'danger' ? 'text-ruby-200' : it.tone === 'gold' ? 'font-strong text-gold-100' : 'text-white/90'
                      }`}
                    >
                      {it.label}
                    </button>
                  ),
                )}
              </div>
            </>
          )}
        </div>
      )}
      {report && <ReportDialog target={report} context={report.context} onClose={() => setReport(null)} />}
    </>
  );
}

/** UIDs I have blocked (refreshed after any relationship change); used to hide their chat lines. */
export function useBlockedUids(): Set<number> {
  const [ids, setIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    const load = () => void api<{ players: { uid: number }[] }>('/api/me/blocks').then((r) => setIds(new Set(r.players.map((p) => p.uid))), () => {});
    load();
    return onRelationChange(load);
  }, []);
  return ids;
}
