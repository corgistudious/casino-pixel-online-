import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../net/api';
import { errorText } from '../lib/errors';
import { AppShell, PageHeader } from '../ui/AppShell';
import { toast } from '../ui/toast';
import { useSession } from '../store/session';

type Currency = 'silver' | 'gold';
type Direction = 'deposit' | 'withdraw';
type BankState = { wallet: { balance: number; gold: number }; bank: { silver: number; gold: number } };
type BankHistory = { transfers: Array<{ id: string; currency: Currency; direction: Direction; amount: string; created_at: string }> };

export function BankPage() {
  const { i18n } = useTranslation();
  const vi = i18n.language.startsWith('vi');
  const [data, setData] = useState<BankState | null>(null);
  const [history, setHistory] = useState<BankHistory['transfers']>([]);
  const [currency, setCurrency] = useState<Currency>('silver');
  const [direction, setDirection] = useState<Direction>('deposit');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const [bank, h] = await Promise.all([api<BankState>('/api/bank'), api<BankHistory>('/api/bank/history')]);
    setData(bank); setHistory(h.transfers);
  };
  useEffect(() => { void refresh().catch(() => toast(vi ? 'Không thể tải ngân hàng' : 'Cannot load bank', 'error')); }, []);
  const submit = async () => {
    const n = Number(amount);
    if (!Number.isSafeInteger(n) || n < 1 || n > 1_000_000_000) return;
    setBusy(true);
    try {
      await api('/api/bank/transfer', { method: 'POST', body: { currency, direction, amount: n, idempotencyKey: crypto.randomUUID() } });
      await refresh();
      const { user } = await api<{ user: NonNullable<ReturnType<typeof useSession.getState>['user']> }>('/api/me');
      useSession.getState().setUser(user);
      setAmount('');
      toast(vi ? 'Giao dịch thành công' : 'Transfer completed', 'success');
    } catch (err) { toast(errorText((key: string) => key, err, i18n.language), 'error'); }
    finally { setBusy(false); }
  };
  return <AppShell><div className="flex flex-col gap-4 p-4">
    <PageHeader icon="collection" title={vi ? 'Ngân hàng Keyo' : 'Keyo Bank'} subtitle={vi ? 'Chuyển Cxu giữa ví và ngân hàng' : 'Move Cxu between wallet and bank'} />
    <section className="glass grid grid-cols-2 gap-4 p-4">
      {(['silver','gold'] as const).map(c => <div key={c}>
        <div className="text-sm text-white/60">{c === 'silver' ? (vi ? 'Cxu Bạc' : 'Silver Cxu') : (vi ? 'Cxu Vàng' : 'Gold Cxu')}</div>
        <div>{vi ? 'Ví' : 'Wallet'}: {(data?.wallet[c === 'silver' ? 'balance' : 'gold'] ?? 0).toLocaleString()}</div>
        <div>{vi ? 'Ngân hàng' : 'Bank'}: {(data?.bank[c] ?? 0).toLocaleString()}</div>
      </div>)}
    </section>
    <section className="glass flex max-w-xl flex-col gap-3 p-4">
      <select className="field" value={currency} onChange={e => setCurrency(e.target.value as Currency)}><option value="silver">{vi ? 'Cxu Bạc' : 'Silver'}</option><option value="gold">{vi ? 'Cxu Vàng' : 'Gold'}</option></select>
      <select className="field" value={direction} onChange={e => setDirection(e.target.value as Direction)}><option value="deposit">{vi ? 'Gửi vào' : 'Deposit'}</option><option value="withdraw">{vi ? 'Rút ra' : 'Withdraw'}</option></select>
      <input className="field" type="number" min="1" max="1000000000" step="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder={vi ? 'Số lượng' : 'Amount'} />
      <button className="rounded-xl bg-amber-500 p-3 font-bold text-black disabled:opacity-40" disabled={busy || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0} onClick={() => void submit()}>{busy ? '...' : vi ? 'Xác nhận' : 'Confirm'}</button>
    </section>
    <section className="glass p-4"><h2 className="mb-2 font-bold">{vi ? 'Lịch sử giao dịch' : 'Transfer history'}</h2>
      {history.map(h => <div key={h.id} className="flex justify-between border-b border-white/10 py-2 text-sm"><span>{h.direction} · {h.currency} · {Number(h.amount).toLocaleString()}</span><time>{new Date(h.created_at).toLocaleString()}</time></div>)}
    </section>
  </div></AppShell>;
}
