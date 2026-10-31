import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { setPasswordPrompt } from '../net/adminApi';
import { Button } from './Button';

/** Password re-confirmation prompt used by adminApi for sensitive staff actions. */
export function ReauthDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const resolver = useRef<((v: string | null) => void) | null>(null);

  useEffect(() => {
    setPasswordPrompt(
      () =>
        new Promise((resolve) => {
          resolver.current = resolve;
          setPassword('');
          setOpen(true);
        }),
    );
    return () => setPasswordPrompt(null);
  }, []);

  const close = (value: string | null) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpen(false);
    setPassword('');
  };

  if (!open) return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password) close(password);
  };
  return (
    <div className="overlay z-[70] flex items-center justify-center bg-ink-950/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reauth-title">
      <form onSubmit={submit} className="glass flex w-full max-w-sm flex-col gap-3 p-5">
        <h2 id="reauth-title" className="font-display text-xl">{t('admin.reauthTitle')}</h2>
        <p className="text-sm text-white/60">{t('admin.reauthBody')}</p>
        <input className="field" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.password')} />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={() => close(null)}>
            {t('admin.cancel')}
          </Button>
          <Button type="submit" variant="gold" disabled={!password}>
            {t('admin.confirm')}
          </Button>
        </div>
      </form>
    </div>
  );
}
