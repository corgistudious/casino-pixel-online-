import type { Permission } from '@casino/shared';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { adminApi } from '../net/adminApi';
import { toast } from '../ui/toast';

export interface AdminMe {
  uid: number;
  roles: string[];
  rank: number;
  permissions: Permission[];
  grantableRoles: string[];
}

interface AdminStore {
  me: AdminMe | null;
  load(): Promise<void>;
}

/** The signed-in staff member's roles and permissions, from GET /api/admin/me (the server re-checks every call). */
export const useAdminStore = create<AdminStore>((set) => ({
  me: null,
  async load() {
    set({ me: await adminApi<AdminMe>('/api/admin/me') });
  },
}));

/** Formatting and permission helpers shared by the admin screens. */
export function useAdminKit() {
  const { t, i18n } = useTranslation();
  const me = useAdminStore((s) => s.me);
  return {
    t,
    me,
    can: (p: Permission) => !!me?.permissions.includes(p),
    fmt: (n: number) => formatChips(n, i18n.language),
    date: (s: string | null | undefined) => (s ? new Date(s).toLocaleString(i18n.language) : '—'),
    fail: (err: unknown) => toast(errorText(t, err, i18n.language), 'error'),
    done: () => toast(t('admin.done'), 'success'),
  };
}
