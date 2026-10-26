import { create } from 'zustand';
import { api } from '../net/api';
import { socket } from '../net/socket';

/**
 * Unread private messages for the 💬 badge. The server count is the source of truth; realtime
 * events only trigger a refetch (debounced), so the badge cannot drift.
 */
interface SocialState {
  unreadDm: number;
  /** My support tickets with a reply I have not opened. */
  unreadSupport: number;
  /** UID of the conversation open on screen (its messages are read as they arrive). */
  openPeer: number | null;
  refresh(): void;
  setOpenPeer(uid: number | null): void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useSocial = create<SocialState>((set, get) => ({
  unreadDm: 0,
  unreadSupport: 0,
  openPeer: null,
  refresh() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void api<{ dm: number }>('/api/chat/unread').then((r) => set({ unreadDm: r.dm }), () => {});
      void api<{ count: number }>('/api/support/unread').then((r) => set({ unreadSupport: r.count }), () => {});
    }, 250);
  },
  setOpenPeer(uid) {
    set({ openPeer: uid });
    if (uid === null) get().refresh();
  },
}));

let started = false;
/** Wires realtime events to the store once per app. */
export function startSocialSync() {
  if (started) return;
  started = true;
  socket.listen((ev) => {
    if (ev.event === 'chatMessage' && ev.data.channel === 'dm') useSocial.getState().refresh();
    else if (ev.event === 'social' && (ev.data.kind === 'dm_read' || ev.data.kind === 'removed')) useSocial.getState().refresh();
    else if (ev.event === 'support') useSocial.getState().refresh();
  });
}
