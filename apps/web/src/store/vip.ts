import { create } from 'zustand';
import { IS_DEMO, DEMO_EXTRAS } from '../demo';
import { api } from '../net/api';
import { socket } from '../net/socket';

/** VIP EXP from the server (refreshed when the wallet changes, e.g. after a mission claim). */
export const useVip = create<{ exp: number | null; refresh(): void }>((set) => ({
  exp: IS_DEMO ? DEMO_EXTRAS.vipExp : null,
  refresh() {
    if (IS_DEMO) return;
    void api<{ exp: number }>('/api/vip').then((r) => set({ exp: r.exp }), () => {});
  },
}));

let wired = false;
export function startVipSync() {
  if (wired || IS_DEMO) return;
  wired = true;
  socket.listen((ev) => ev.event === 'wallet' && useVip.getState().refresh());
  useVip.getState().refresh();
}
