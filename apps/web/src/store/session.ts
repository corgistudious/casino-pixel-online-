import type { BigWinEvent, PublicUser } from '@casino/shared';
import { create } from 'zustand';
import { api, setAuthToken, setUnauthorizedHandler } from '../net/api';
import { socket, type SocketStatus } from '../net/socket';
import { storage } from '../lib/storage';
import { DEMO_TOKEN, IS_DEMO } from '../demo';

const TOKEN_KEY = 'cpo.token';

interface SessionStore {
  token: string | null;
  user: PublicUser | null;
  /** Balance shown in the UI. Can lag behind the server while an animation plays. */
  balance: number;
  /** Cxu Vàng. Never held: it is not touched by game rounds. */
  gold: number;
  /** Set right after registration so the lobby can show the welcome pack. */
  justRegistered: boolean;
  online: number;
  status: SocketStatus;
  bigWins: BigWinEvent[];
  booting: boolean;

  boot(): Promise<void>;
  signIn(token: string, user: PublicUser, registered?: boolean): void;
  dismissWelcome(): void;
  setUnread(count: number): void;
  signOut(): void;
  setUser(user: PublicUser): void;
  /** While held, wallet pushes are buffered so the balance updates after the animation. */
  holdBalance(): void;
  releaseBalance(balance?: number): void;
  setBalance(balance: number): void;
}

let held = false;
let pendingBalance: number | null = null;

export const useSession = create<SessionStore>((set, get) => {
  socket.onStatus = (status) => set({ status });
  socket.onAuthFailed = () => get().signOut();
  socket.onEvent = (ev) => {
    switch (ev.event) {
      case 'wallet':
        if (held) pendingBalance = ev.data.balance;
        else set({ balance: ev.data.balance });
        if (ev.data.gold !== undefined) set({ gold: ev.data.gold });
        break;
      case 'presence':
        set({ online: ev.data.online });
        break;
      case 'bigwin':
        set({ bigWins: [ev.data, ...get().bigWins].slice(0, 20) });
        break;
      case 'mail': {
        const user = get().user;
        if (!user) break;
        if (ev.data.unread !== undefined) set({ user: { ...user, unreadMail: ev.data.unread } });
        else void api<{ unread: number }>('/api/mail').then(({ unread }) => get().user && set({ user: { ...get().user!, unreadMail: unread } }), () => {});
        break;
      }
    }
  };
  setUnauthorizedHandler(() => get().signOut());

  return {
    token: null,
    user: null,
    balance: 0,
    gold: 0,
    justRegistered: false,
    online: 0,
    status: 'idle',
    bigWins: [],
    booting: true,

    async boot() {
      if (IS_DEMO) {
        const { user } = await api<{ user: PublicUser }>('/api/me');
        const { wins } = await api<{ wins: BigWinEvent[] }>('/api/bigwins');
        return set({ token: DEMO_TOKEN, user, balance: user.balance, gold: user.gold, online: 1, bigWins: wins, booting: false });
      }
      const token = storage.get(TOKEN_KEY);
      if (!token) return set({ booting: false });
      setAuthToken(token);
      try {
        const { user } = await api<{ user: PublicUser }>('/api/me');
        get().signIn(token, user);
      } catch {
        // Network errors keep the token so the player can retry; auth errors already signed out.
      } finally {
        set({ booting: false });
      }
    },

    signIn(token, user, registered = false) {
      storage.set(TOKEN_KEY, token);
      setAuthToken(token);
      set({ token, user, balance: user.balance, gold: user.gold, justRegistered: registered });
      socket.start(token);
      void api<{ wins: BigWinEvent[] }>('/api/bigwins').then(({ wins }) => set({ bigWins: wins }), () => {});
    },

    signOut() {
      if (IS_DEMO) return;
      storage.set(TOKEN_KEY, null);
      setAuthToken(null);
      socket.stop();
      held = false;
      pendingBalance = null;
      set({ token: null, user: null, balance: 0, gold: 0, justRegistered: false });
    },

    setUnread(unreadMail) {
      const user = get().user;
      if (user) set({ user: { ...user, unreadMail } });
    },

    dismissWelcome() {
      set({ justRegistered: false });
    },

    setUser(user) {
      set({ user, balance: held ? get().balance : user.balance, gold: user.gold });
    },

    holdBalance() {
      held = true;
    },

    releaseBalance(balance) {
      held = false;
      const next = balance ?? pendingBalance;
      pendingBalance = null;
      if (next !== null && next !== undefined) set({ balance: next });
    },

    setBalance(balance) {
      if (held) pendingBalance = balance;
      else set({ balance });
    },
  };
});
