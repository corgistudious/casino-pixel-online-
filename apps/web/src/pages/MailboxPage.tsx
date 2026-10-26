import type { MailAttachment, MailMessage } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sfx } from '../audio/sfx';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { itemName, useCatalog } from '../store/catalog';
import { useSession } from '../store/session';
import { AppShell, PageHeader } from '../ui/AppShell';
import { Button } from '../ui/Button';
import { CurrencyIcon } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';

type Wallet = { balance: number; gold: number };

function stateOf(m: MailMessage): 'claimed' | 'expired' | 'claimable' | 'notice' {
  if (m.claimedAt) return 'claimed';
  if (m.expiresAt && new Date(m.expiresAt).getTime() <= Date.now()) return 'expired';
  return m.attachments.length ? 'claimable' : 'notice';
}

export function MailboxPage() {
  const { t, i18n } = useTranslation();
  const setUnread = useSession((s) => s.setUnread);
  const setBalance = useSession((s) => s.setBalance);
  const [mail, setMail] = useState<MailMessage[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fail = (err: unknown) => toast(errorText(t, err, i18n.language), 'error');

  const load = () =>
    void api<{ mail: MailMessage[]; unread: number }>('/api/mail').then((r) => {
      setMail(r.mail);
      setUnread(r.unread);
    }, fail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const replace = (m: MailMessage) => setMail((list) => list?.map((x) => (x.id === m.id ? m : x)) ?? null);
  const applyWallet = (w: Wallet) => {
    setBalance(w.balance);
    useSession.setState({ gold: w.gold });
  };

  const open = async (m: MailMessage) => {
    setOpenId(m.id);
    if (m.readAt) return;
    try {
      const r = await api<{ mail: MailMessage; unread: number }>(`/api/mail/${m.id}/read`, { method: 'POST' });
      replace(r.mail);
      setUnread(r.unread);
    } catch (err) {
      fail(err);
    }
  };

  const claim = async (m: MailMessage) => {
    setBusy(true);
    try {
      const r = await api<{ mail: MailMessage; wallet: Wallet; unread: number }>(`/api/mail/${m.id}/claim`, { method: 'POST' });
      replace(r.mail);
      applyWallet(r.wallet);
      setUnread(r.unread);
      sfx.win();
      toast(t('mail.claimedToast'), 'success');
    } catch (err) {
      fail(err);
      load();
    } finally {
      setBusy(false);
    }
  };

  const claimAll = async () => {
    setBusy(true);
    try {
      const r = await api<{ claimed: MailMessage[]; wallet: Wallet; unread: number }>('/api/mail/claim-all', { method: 'POST' });
      r.claimed.forEach(replace);
      applyWallet(r.wallet);
      setUnread(r.unread);
      if (r.claimed.length) {
        sfx.win();
        toast(t('mail.claimedToast'), 'success');
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: MailMessage) => {
    try {
      const r = await api<{ unread: number }>(`/api/mail/${m.id}`, { method: 'DELETE' });
      setMail((list) => list?.filter((x) => x.id !== m.id) ?? null);
      setOpenId(null);
      setUnread(r.unread);
    } catch (err) {
      fail(err);
    }
  };

  const current = mail?.find((m) => m.id === openId) ?? null;
  const claimable = mail?.filter((m) => stateOf(m) === 'claimable').length ?? 0;
  const date = (s: string) => new Date(s).toLocaleString(i18n.language);

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <PageHeader icon="mail" title={t('mail.title')} subtitle={t('mail.subtitle')} />
        {mail === null ? (
          <p className="text-white/50">{t('app.loading')}</p>
        ) : mail.length === 0 ? (
          <div className="glass p-10 text-center text-white/55">{t('mail.empty')}</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
            <div className="flex flex-col gap-2">
              {claimable > 1 && (
                <Button variant="gold" disabled={busy} onClick={() => void claimAll()}>
                  {t('mail.claimAll')} ({claimable})
                </Button>
              )}
              <ul className="flex flex-col gap-2">
                {mail.map((m) => {
                  const st = stateOf(m);
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => void open(m)}
                        className={`glass flex w-full items-start gap-3 p-3 text-left transition ${openId === m.id ? 'border-gold-300/60' : 'hover:border-gold-300/30'}`}
                      >
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.readAt ? 'bg-transparent' : 'bg-ruby-400'}`} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/45">
                            {t(`mail.kinds.${m.kind}`)} · {new Date(m.createdAt).toLocaleDateString(i18n.language)}
                          </span>
                          <span className={`block truncate ${m.readAt ? 'text-white/75' : 'font-semibold text-white'}`}>{m.subject}</span>
                        </span>
                        {st === 'claimable' && <CurrencyIcon currency={m.attachments.find((a) => a.type !== 'item')?.type === 'gold' ? 'gold' : 'silver'} size={22} />}
                        {st === 'claimed' && <span className="text-[11px] text-emerald-400">{t('mail.claimed')}</span>}
                        {st === 'expired' && <span className="text-[11px] text-white/40">{t('mail.expired')}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <article className="glass flex min-h-[260px] flex-col gap-4 p-5">
              {!current ? (
                <p className="m-auto text-sm text-white/50">{t('mail.select')}</p>
              ) : (
                <>
                  <header>
                    <p className="text-xs uppercase tracking-wide text-white/45">
                      {t(`mail.kinds.${current.kind}`)} · {date(current.createdAt)}
                    </p>
                    <h2 className="font-display text-2xl">{current.subject}</h2>
                    {current.expiresAt && stateOf(current) !== 'claimed' && (
                      <p className="text-xs text-white/50">{stateOf(current) === 'expired' ? t('mail.expired') : t('mail.expires', { date: date(current.expiresAt) })}</p>
                    )}
                  </header>
                  {/* Plain text only: rendered as text, never as HTML. */}
                  {current.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{current.body}</p>}
                  {current.attachments.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <h3 className="text-sm text-white/60">{t('mail.attachments')}</h3>
                      <div className="flex flex-wrap gap-2">
                        {current.attachments.map((a, i) => (
                          <AttachmentChip key={i} a={a} skipped={current.claimResult?.find((r) => r.index === i)?.outcome === 'already_owned'} />
                        ))}
                      </div>
                    </section>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2">
                    {stateOf(current) === 'claimable' && (
                      <Button variant="gold" disabled={busy} onClick={() => void claim(current)}>
                        {t('mail.claim')}
                      </Button>
                    )}
                    {stateOf(current) !== 'claimable' && (
                      <Button disabled={busy} onClick={() => void remove(current)}>
                        {t('mail.delete')}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </article>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function AttachmentChip({ a, skipped }: { a: MailAttachment; skipped: boolean }) {
  const { t, i18n } = useTranslation();
  const catalog = useCatalog((c) => c.items);
  return (
    <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm">
      {a.type === 'item' ? (
        <>
          <span className="text-white/85">{itemName(catalog[a.itemId], i18n.language, a.itemId)}</span>
          {skipped && <span className="text-[11px] text-white/45">({t('mail.alreadyOwned')})</span>}
        </>
      ) : (
        <>
          <CurrencyIcon currency={a.type} size={20} />
          <span className="font-semibold tabular-nums">{formatChips(a.amount, i18n.language)}</span>
          <span className="text-white/55">{t(`currency.${a.type}`)}</span>
        </>
      )}
    </span>
  );
}
