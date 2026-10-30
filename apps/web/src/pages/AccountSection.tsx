import type { PublicUser } from '@casino/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';
import { api, ApiError } from '../net/api';
import { useSession } from '../store/session';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';

interface DeletionRequest {
  id: string;
  createdAt: string;
}

/** Account settings: identity, email linking/verification, sign-out everywhere and deletion requests. */
export function AccountSection() {
  const { t, i18n } = useTranslation();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const signOut = useSession((s) => s.signOut);
  const [deletion, setDeletion] = useState<DeletionRequest | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [delPassword, setDelPassword] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const signIn = useSession((s) => s.signIn);
  const fail = (err: unknown) => toast(errorText(t, err, i18n.language), 'error');

  useEffect(() => {
    void api<{ request: DeletionRequest | null }>('/api/me/deletion').then((r) => setDeletion(r.request), () => {});
  }, []);

  const act = (fn: () => Promise<void>) => async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const linkEmail = act(async () => {
    const res = await api<{ user: PublicUser }>('/api/auth/link-email', { method: 'POST', body: { email, password } });
    setUser(res.user);
    setPassword('');
    toast(t('auth.resent'), 'success');
  });

  const verify = act(async () => {
    const res = await api<{ user: PublicUser }>('/api/auth/verify-email', { method: 'POST', body: { code } });
    setUser(res.user);
    setCode('');
    toast(t('account.verified'), 'success');
  });

  const resend = act(async () => {
    await api('/api/auth/resend-verification', { method: 'POST' });
    toast(t('auth.resent'), 'success');
  });

  // Other sessions are signed out by the server; this one continues with the new token it returns.
  const changePassword = act(async () => {
    if (pw.next !== pw.confirm) throw new ApiError('password_mismatch', 400);
    const res = await api<{ token: string; user: PublicUser }>('/api/me/password', { method: 'POST', body: { currentPassword: pw.current, password: pw.next, confirmPassword: pw.confirm } });
    signIn(res.token, res.user);
    setPw({ current: '', next: '', confirm: '' });
    toast(t('account.passwordChanged'), 'success');
  });

  const logoutAll = act(async () => {
    await api('/api/auth/logout-all', { method: 'POST' });
    toast(t('account.logoutAllDone'), 'success');
    signOut();
  });

  const requestDeletion = act(async () => {
    const res = await api<{ request: DeletionRequest }>('/api/me/deletion', {
      method: 'POST',
      body: { password: delPassword, confirm: true, ...(reason.trim() ? { reason: reason.trim() } : {}) },
    });
    setDeletion(res.request);
    setDelPassword('');
    setConfirm(false);
  });

  const cancelDeletion = act(async () => {
    await api('/api/me/deletion', { method: 'DELETE' });
    setDeletion(null);
    toast(t('account.deletionCancelled'), 'success');
  });

  const row = 'flex items-center justify-between gap-4 text-sm';

  return (
    <div className="glass flex w-full max-w-xl flex-col gap-4 p-6">
      <h3 className="font-display text-lg">{t('account.title')}</h3>
      <div className={row}>
        <span className="text-white/60">{t('account.uid')}</span>
        <span className="font-semibold tabular-nums text-gold-100">{user.uid}</span>
      </div>
      <div className={row}>
        <span className="text-white/60">{t('account.email')}</span>
        <span className="truncate text-right">
          {user.email ?? t('account.noEmail')}
          {user.email && (
            <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${user.emailVerified ? 'bg-emerald-400/15 text-emerald-400' : 'bg-gold-300/15 text-gold-100'}`}>
              {user.emailVerified ? t('account.verified') : t('account.unverified')}
            </span>
          )}
        </span>
      </div>
      <div className={row}>
        <span className="text-white/60">{t('account.status')}</span>
        <span>{t(`account.statuses.${user.status}`)}</span>
      </div>

      {!user.email && (
        <form onSubmit={linkEmail} className="flex flex-col gap-2 border-t border-white/10 pt-4">
          <p className="font-display">{t('account.linkEmail')}</p>
          <p className="text-xs text-white/50">{t('account.linkEmailBody')}</p>
          <input className="field" type="email" placeholder={t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <input className="field" type="password" placeholder={t('auth.password')} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          <Button type="submit" variant="gold" disabled={busy}>
            {t('account.linkSubmit')}
          </Button>
        </form>
      )}

      {user.email && !user.emailVerified && (
        <form onSubmit={verify} className="flex flex-col gap-2 border-t border-white/10 pt-4">
          <p className="text-xs text-white/60">{t('auth.verifyBody', { email: user.email })}</p>
          <input
            className="field tracking-[0.4em] tabular-nums"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder={t('auth.code')}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoComplete="one-time-code"
            required
          />
          <div className="flex gap-2">
            <Button type="submit" variant="gold" disabled={busy || code.length !== 6}>
              {t('auth.verifySubmit')}
            </Button>
            <Button type="button" disabled={busy} onClick={() => void resend()}>
              {t('auth.resend')}
            </Button>
          </div>
        </form>
      )}

      {user.emailVerified && <p className="text-xs text-white/45">{t('account.changeEmailHint')}</p>}

      <form onSubmit={changePassword} className="flex flex-col gap-2 border-t border-white/10 pt-4">
        <p className="font-display">{t('account.changePassword')}</p>
        <input className="field" type="password" placeholder={t('account.currentPassword')} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required autoComplete="current-password" maxLength={128} />
        <input className="field" type="password" placeholder={t('auth.newPassword')} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={8} maxLength={128} autoComplete="new-password" />
        <input className="field" type="password" placeholder={t('auth.confirmPassword')} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required minLength={8} maxLength={128} autoComplete="new-password" />
        <p className="text-[11px] text-white/45">{t('auth.passwordHint')}</p>
        <Button type="submit" variant="gold" disabled={busy || !pw.current || pw.next.length < 8 || !pw.confirm}>
          {t('account.changePassword')}
        </Button>
      </form>

      <div className="border-t border-white/10 pt-4">
        <Button disabled={busy} onClick={() => void logoutAll()}>
          {t('account.logoutAll')}
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
        <p className="font-display text-ruby-400">{t('account.deletion')}</p>
        {deletion ? (
          <>
            <p className="text-sm text-white/70">{t('account.deletionPending', { date: new Date(deletion.createdAt).toLocaleDateString(i18n.language) })}</p>
            <Button disabled={busy} onClick={() => void cancelDeletion()}>
              {t('account.deletionCancel')}
            </Button>
          </>
        ) : (
          <form onSubmit={requestDeletion} className="flex flex-col gap-2">
            <p className="text-xs text-white/50">{t('account.deletionBody')}</p>
            <input className="field" placeholder={t('account.deletionReason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            <input className="field" type="password" placeholder={t('auth.password')} value={delPassword} onChange={(e) => setDelPassword(e.target.value)} required autoComplete="current-password" />
            <label className="flex items-start gap-2 text-xs text-white/70">
              <input type="checkbox" className="mt-0.5 accent-ruby-400" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} required />
              <span>{t('account.deletionConfirm')}</span>
            </label>
            <Button type="submit" variant="ruby" disabled={busy || !confirm}>
              {t('account.deletionSubmit')}
            </Button>
          </form>
        )}
      </div>
      <p className="text-xs text-white/45">{t('auth.neverShare')}</p>
    </div>
  );
}
