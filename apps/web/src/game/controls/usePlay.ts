import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../net/api';
import { useSession } from '../../store/session';
import { toast } from '../../ui/toast';

/**
 * Runs one server round: holds the displayed balance, awaits the animation,
 * then reveals the settled balance. Errors become translated toasts.
 */
export function usePlay() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const run = useCallback(
    async <T extends { balance: number }>(request: () => Promise<T>, animate: (env: T) => Promise<void>): Promise<T | null> => {
      if (busyRef.current) return null;
      busyRef.current = true;
      setBusy(true);
      const session = useSession.getState();
      session.holdBalance();
      try {
        const env = await request();
        await animate(env);
        useSession.getState().releaseBalance(env.balance);
        return env;
      } catch (err) {
        useSession.getState().releaseBalance();
        const code = err instanceof ApiError ? err.code : 'internal';
        toast(t(`errors.${code}`), 'error');
        return null;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [t],
  );

  return { busy, run };
}
