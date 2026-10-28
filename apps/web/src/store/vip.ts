import { vipProgress, type VipLevelView, type VipStatusView } from '@casino/shared';
import { create } from 'zustand';
import { IS_DEMO, DEMO_EXTRAS } from '../demo';
import { api } from '../net/api';
import { socket } from '../net/socket';
import { useSession } from './session';

/**
 * My VIP status from the server: the effective level (a staff grant wins until it ends), EXP and
 * progress, computed from the live level table. Refreshed when the wallet or my identity changes.
 */
interface VipStore {
  exp: number | null;
  status: VipStatusView | null;
  levels: VipLevelView[] | null;
  refresh(): void;
  loadLevels(): void;
}

function demoStatus(): VipStatusView {
  const p = vipProgress(DEMO_EXTRAS.vipExp);
  const view = (l: typeof p.current): VipLevelView => ({ ...l, name: { vi: `VIP ${l.level}`, en: `VIP ${l.level}` }, description: { vi: '', en: '' }, color: '#f2c14e', iconUrl: null, benefits: [], active: true });
  return { level: p.level, expLevel: p.level, exp: DEMO_EXTRAS.vipExp, current: view(p.current), next: p.next ? view(p.next) : null, ratio: p.ratio, toNext: p.toNext, lastClaimDate: null, override: null };
}

export const useVip = create<VipStore>((set) => ({
  exp: IS_DEMO ? DEMO_EXTRAS.vipExp : null,
  status: IS_DEMO ? demoStatus() : null,
  levels: null,
  refresh() {
    if (IS_DEMO) return;
    void api<VipStatusView>('/api/vip').then((r) => set({ exp: r.exp, status: r }), () => {});
  },
  loadLevels() {
    if (IS_DEMO) return;
    void api<{ levels: VipLevelView[] }>('/api/vip/levels').then((r) => set({ levels: r.levels }), () => {});
  },
}));

let wired = false;
export function startVipSync() {
  if (wired || IS_DEMO) return;
  wired = true;
  socket.listen((ev) => {
    if (ev.event === 'wallet') useVip.getState().refresh();
    else if (ev.event === 'identity' && ev.data.uid === useSession.getState().user?.uid) useVip.getState().refresh();
  });
  useVip.getState().refresh();
}
