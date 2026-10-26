import type { GiftcodeRedemption } from '@casino/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { itemName, useCatalog } from '../store/catalog';
import { useSession } from '../store/session';
import { AppShell, PageHeader } from '../ui/AppShell';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';

/** Redeem a gift code; the reward is delivered to the Mailbox by the server (claimed from there). */
export function GiftcodePage() {
  const { t, i18n } = useTranslation();
  const catalog = useCatalog((c) => c.items);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [history, setHistory] = useState<GiftcodeRedemption[] | null>(null);

  const load = () => void api<{ redemptions: GiftcodeRedemption[] }>('/api/giftcode/history').then((r) => setHistory(r.redemptions), () => setHistory([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setDone(false);
    try {
      const r = await api<{ unread: number }>('/api/giftcode/redeem', { method: 'POST', body: { code } });
      const user = useSession.getState().user;
      if (user) useSession.getState().setUser({ ...user, unreadMail: r.unread });
      setDone(true);
      setCode('');
      load();
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <PageHeader icon="gifts" title={t('giftcode.title')} subtitle={t('giftcode.subtitle')} />
        <form onSubmit={submit} className="glass flex max-w-xl flex-col gap-3 p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="field font-bold uppercase tracking-[0.2em] placeholder:normal-case placeholder:tracking-normal"
              value={code}
              onChange={(e) => setCode(e.target.value.slice(0, 32))}
              placeholder={t('giftcode.placeholder')}
              aria-label={t('giftcode.placeholder')}
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit" variant="gold" className="shrink-0 whitespace-nowrap" disabled={busy || code.trim().length < 4}>
              {t('giftcode.redeem')}
            </Button>
          </div>
          {done && (
            <p className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-950/50 px-3 py-2 text-sm font-semibold text-emerald-200" role="status">
              {t('giftcode.redeemed')}
              <Link to="/mail" className="underline">
                {t('giftcode.openMail')}
              </Link>
            </p>
          )}
          <p className="text-xs text-white/50">{t('giftcode.note')}</p>
        </form>
        <section className="glass max-w-xl p-4">
          <h2 className="mb-2 font-display text-lg font-bold text-gold-100">{t('giftcode.history')}</h2>
          {history === null ? (
            <p className="text-sm text-white/50">{t('app.loading')}</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-white/50">{t('giftcode.empty')}</p>
          ) : (
            <ul className="flex flex-col">
              {history.map((h) => (
                <li key={`${h.code}${h.createdAt}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-sm odd:bg-white/[0.03]">
                  <code className="font-bold tracking-widest text-gold-100">{h.code}</code>
                  <span className="text-white/70">{h.campaign}</span>
                  <span className="flex flex-1 flex-wrap gap-1">
                    {h.attachments.map((a, i) => (
                      <span key={i} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold">
                        {a.type === 'item' ? itemName(catalog[a.itemId], i18n.language, a.itemId) : `${formatChips(a.amount, i18n.language)} ${t(`currency.${a.type}`)}`}
                      </span>
                    ))}
                  </span>
                  <span className="text-[11px] text-white/40">{new Date(h.createdAt).toLocaleString(i18n.language)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
