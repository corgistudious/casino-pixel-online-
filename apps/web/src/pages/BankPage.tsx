import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { newIdempotencyKey } from '../net/adminApi';
import { useFail } from '../social/parts';
import { useSession } from '../store/session';
import { AppShell } from '../ui/AppShell';
import { Button } from '../ui/Button';
import { NavIcon } from '../ui/NavIcons';
import { CurrencyIcon } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';

type Currency = 'silver' | 'gold';
type Direction = 'deposit' | 'withdraw';
interface Overview {
  wallet: { balance: number; gold: number };
  bank: { silver: number; gold: number };
}
interface Transfer {
  id: string;
  currency: Currency;
  direction: Direction;
  amount: number;
  walletAfter: number;
  bankAfter: number;
  createdAt: string;
}

/** Premium bank: total assets, per-currency vault cards, deposit/withdraw desk and statement. */
export function BankPage() {
  const { t, i18n } = useTranslation();
  const fail = useFail();
  const [data, setData] = useState<Overview | null>(null);
  const [history, setHistory] = useState<Transfer[] | null>(null);
  const [more, setMore] = useState(false);
  const [filter, setFilter] = useState<'all' | Currency>('all');
  const [currency, setCurrency] = useState<Currency>('silver');
  const [direction, setDirection] = useState<Direction>('deposit');
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  // One key per intended transfer: a retry after a network error reuses it and cannot apply twice.
  const [key, setKey] = useState(newIdempotencyKey);
  const fmt = (n: number) => formatChips(n, i18n.language);
  const cur = (c: Currency) => t(`currency.${c}`);

  const load = () => {
    void api<Overview>('/api/bank').then(setData, fail);
    void api<{ transfers: Transfer[] }>('/api/bank/history').then((r) => {
      setHistory(r.transfers);
      setMore(r.transfers.length === 50);
    }, fail);
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  const older = () => {
    const last = history?.at(-1);
    if (!last) return;
    void api<{ transfers: Transfer[] }>(`/api/bank/history?before=${encodeURIComponent(last.createdAt)}`).then((r) => {
      setHistory((h) => [...(h ?? []), ...r.transfers]);
      setMore(r.transfers.length === 50);
    }, fail);
  };

  const wallet = data ? (currency === 'silver' ? data.wallet.balance : data.wallet.gold) : 0;
  const vault = data ? data.bank[currency] : 0;
  const source = direction === 'deposit' ? wallet : vault;
  const valid = Number.isSafeInteger(amount) && amount > 0 && amount <= source;
  const action = t(`bankPage.${direction}`);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api<Overview & { transfer: { replayed: boolean } }>('/api/bank/transfer', { method: 'POST', body: { idempotencyKey: key, currency, direction, amount } });
      setData({ wallet: res.wallet, bank: res.bank });
      useSession.setState({ balance: res.wallet.balance, gold: res.wallet.gold });
      toast(t('bankPage.success', { action, amount: fmt(amount), currency: cur(currency) }), 'success');
      setAmount(0);
      setKey(newIdempotencyKey());
      void api<{ transfers: Transfer[] }>('/api/bank/history').then((r) => setHistory(r.transfers), () => {});
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  // Changing what is being sent is a new intended transfer.
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setKey(newIdempotencyKey());
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <section className="relative overflow-hidden rounded-3xl border border-gold-300/30 bg-[linear-gradient(135deg,#1d1606_0%,#0c0b14_45%,#06131a_100%)] p-6 shadow-panel">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-gold-300/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(242,193,78,0.04)_0_1px,transparent_1px_10px)]" />
          <div className="relative flex flex-wrap items-center gap-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-300/50 bg-black/40 shadow-glow">
              <NavIcon name="bank" size={30} active />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-3xl font-heading text-gold">{t('bankPage.title')}</h1>
              <p className="text-sm text-white/60">{t('bankPage.subtitle')}</p>
            </div>
            {data && (
              <div className="rounded-2xl border border-gold-300/30 bg-black/40 px-5 py-3 text-right">
                <div className="text-[11px] uppercase tracking-[0.2em] text-gold-200/70">{t('bankPage.totalAssets')}</div>
                <div className="flex items-center justify-end gap-2 font-heading text-2xl tabular-nums text-white">
                  <CurrencyIcon currency="silver" size={24} /> {fmt(data.wallet.balance + data.bank.silver)}
                </div>
                <div className="flex items-center justify-end gap-2 font-heading text-lg tabular-nums text-gold-100">
                  <CurrencyIcon currency="gold" size={20} /> {fmt(data.wallet.gold + data.bank.gold)}
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          {(['silver', 'gold'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => change(setCurrency)(c)}
              aria-pressed={currency === c}
              className={`group relative overflow-hidden rounded-3xl border p-5 text-left transition ${currency === c ? 'border-gold-300/70 shadow-[0_0_30px_-10px_rgba(242,193,78,0.8)]' : 'border-white/10 hover:border-white/25'} ${c === 'gold' ? 'bg-gradient-to-br from-[#4a3208] via-[#1f1606] to-[#0d0b10]' : 'bg-gradient-to-br from-[#2b3442] via-[#141821] to-[#0b0d12]'}`}
            >
              <span className="sheen opacity-40" />
              <div className="relative flex items-center justify-between">
                <span className="flex items-center gap-2 font-display text-lg font-heading text-white">
                  <CurrencyIcon currency={c} size={30} /> {cur(c)}
                </span>
                <span className="font-mono text-[11px] tracking-[0.3em] text-white/35">KEYO •••• {c === 'gold' ? '0002' : '0001'}</span>
              </div>
              <div className="relative mt-5 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-white/45">{t('bankPage.wallet')}</div>
                  <div className="font-heading text-xl tabular-nums text-white">{data ? fmt(c === 'silver' ? data.wallet.balance : data.wallet.gold) : '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gold-200/70">{t('bankPage.vault')}</div>
                  <div className="font-heading text-xl tabular-nums text-gold-100">{data ? fmt(data.bank[c]) : '—'}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
          <section className="glass flex flex-col gap-4 p-5">
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-black/35 p-1" role="tablist">
              {(['deposit', 'withdraw'] as const).map((d) => (
                <button key={d} type="button" role="tab" aria-selected={direction === d} onClick={() => change(setDirection)(d)} className={`rounded-xl py-2.5 font-label text-sm transition ${direction === d ? (d === 'deposit' ? 'bg-gradient-to-r from-emerald-400 to-teal-500 text-ink-900' : 'bg-gradient-to-r from-amber-300 to-orange-500 text-ink-900') : 'text-white/60 hover:text-white'}`}>
                  {d === 'deposit' ? '⬇ ' : '⬆ '}
                  {t(`bankPage.${d}`)}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="flex justify-between text-xs text-white/55">
                <span>
                  {t('bankPage.amount')} · {cur(currency)}
                </span>
                <span>{t('bankPage.max', { amount: fmt(source) })}</span>
              </span>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 focus-within:border-gold-300/60">
                <CurrencyIcon currency={currency} size={26} />
                <input className="w-full bg-transparent py-3 font-heading text-2xl tabular-nums text-white outline-none" inputMode="numeric" value={amount ? fmt(amount) : ''} placeholder="0" onChange={(e) => change(setAmount)(Math.min(1_000_000_000, Number(e.target.value.replace(/\D/g, '')) || 0))} aria-label={t('bankPage.amount')} />
              </div>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <button key={f} type="button" disabled={!source} onClick={() => change(setAmount)(Math.floor(source * f))} className="rounded-lg bg-white/5 py-1.5 text-xs font-label text-white/70 hover:bg-white/10 disabled:opacity-30">
                  {f === 1 ? t('bankPage.all') : `${f * 100}%`}
                </button>
              ))}
            </div>
            {valid && (
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/25 p-3 text-xs">
                <div className="col-span-2 text-white/45">{t('bankPage.after')}</div>
                <div>
                  <div className="text-white/45">{t('bankPage.wallet')}</div>
                  <div className="font-strong tabular-nums text-white">{fmt(direction === 'deposit' ? wallet - amount : wallet + amount)}</div>
                </div>
                <div>
                  <div className="text-white/45">{t('bankPage.vault')}</div>
                  <div className="font-strong tabular-nums text-gold-100">{fmt(direction === 'deposit' ? vault + amount : vault - amount)}</div>
                </div>
              </div>
            )}
            <Button variant="gold" size="lg" disabled={busy || !valid} onClick={() => void submit()}>
              {busy ? t('bankPage.processing') : t('bankPage.confirm', { action: action.toLowerCase() })}
            </Button>
            <p className="text-[11px] leading-snug text-white/40">🔒 {t('bankPage.secure')}</p>
          </section>

          <section className="glass flex min-w-0 flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-heading">{t('bankPage.history')}</h2>
              <div className="flex gap-1 text-xs">
                {(['all', 'silver', 'gold'] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-lg px-2.5 py-1 ${filter === f ? 'bg-gold-300/20 text-gold-100' : 'text-white/55 hover:bg-white/5'}`}>
                    {f === 'all' ? t('bankPage.filterAll') : cur(f)}
                  </button>
                ))}
              </div>
            </div>
            {history?.length === 0 && <p className="py-8 text-center text-sm text-white/45">{t('bankPage.noHistory')}</p>}
            <ul className="flex flex-col divide-y divide-white/5">
              {history
                ?.filter((h) => filter === 'all' || h.currency === filter)
                .map((h) => (
                  <li key={h.id} className="flex items-center gap-3 py-2.5">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm ${h.direction === 'deposit' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`} aria-hidden>
                      {h.direction === 'deposit' ? '⬇' : '⬆'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white">{t(`bankPage.${h.direction}`)}</div>
                      <time className="text-[11px] text-white/40">{new Date(h.createdAt).toLocaleString(i18n.language)}</time>
                    </div>
                    <div className="text-right">
                      <div className={`flex items-center justify-end gap-1 font-strong tabular-nums ${h.direction === 'deposit' ? 'text-emerald-200' : 'text-amber-200'}`}>
                        <CurrencyIcon currency={h.currency} size={16} /> {fmt(h.amount)}
                      </div>
                      <div className="text-[10px] tabular-nums text-white/40">
                        {t('bankPage.vault')}: {fmt(h.bankAfter)}
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
            {more && (
              <Button size="sm" onClick={older}>
                {t('bankPage.more')}
              </Button>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
