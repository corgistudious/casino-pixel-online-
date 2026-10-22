import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
}

interface ToastStore {
  toasts: Toast[];
  push(text: string, tone?: Toast['tone']): void;
}

let next = 1;

export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  push(text, tone = 'info') {
    const id = next++;
    set({ toasts: [...get().toasts.slice(-3), { id, text, tone }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3200);
  },
}));

export const toast = (text: string, tone?: Toast['tone']) => useToasts.getState().push(text, tone);
