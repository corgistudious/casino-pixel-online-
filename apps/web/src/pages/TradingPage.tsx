import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../net/api';
import { AppShell, PageHeader } from '../ui/AppShell';
import { toast } from '../ui/toast';
import { useSession } from '../store/session';

type Listing = { id: string; item_id: string; price_silver: string; seller_uid: number };
type Inventory = { id: string; itemId: string; kind: string; active: boolean };
export function TradingPage() {
  const { i18n } = useTranslation(); const vi = i18n.language.startsWith('vi');
  const [listings, setListings] = useState<Listing[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [item, setItem] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const uid = useSession(s => s.user?.uid);
  const refresh = async () => {
    const [market, owned] = await Promise.all([
      api<{listings: Listing[]}>('/api/market'),
      api<{items: Inventory[]}>('/api/me/inventory'),
    ]);
    setListings(market.listings);
    setInventory(owned.items.filter(i => i.kind === 'collectible' && i.active));
  };
  useEffect(() => { void refresh().catch(() => {}); }, []);
  const run = async (path: string, body: unknown) => {
    setBusy(true);
    try {
      await api(path, { method:'POST', body });
      await refresh();
      const { user } = await api<{ user: NonNullable<ReturnType<typeof useSession.getState>['user']> }>('/api/me');
      useSession.getState().setUser(user);
      toast(vi ? 'Giao dịch thành công' : 'Transaction successful', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); }
    finally { setBusy(false); }
  };
  return <AppShell><div className="flex flex-col gap-4 p-4">
    <PageHeader icon="collection" title={vi ? 'Chợ giao dịch sưu tầm' : 'Collectible Marketplace'} subtitle={vi ? 'Mua bán vật phẩm bằng Cxu Bạc' : 'Trade collectibles using Silver Cxu'} />
    <section className="glass flex max-w-xl flex-col gap-3 p-4">
      <h2 className="font-bold">{vi ? 'Đăng bán vật phẩm' : 'List collectible'}</h2>
      <select className="field" value={item} onChange={e => setItem(e.target.value)}>
        <option value="">{vi ? 'Chọn vật phẩm' : 'Choose item'}</option>
        {inventory.map(i => <option key={i.id} value={i.id}>{i.itemId} ({i.id.slice(0,8)})</option>)}
      </select>
      <input className="field" type="number" min="1" max="1000000000" step="1" value={price} onChange={e => setPrice(e.target.value)} placeholder={vi ? 'Giá Cxu Bạc' : 'Silver Cxu price'} />
      <button className="rounded-xl bg-amber-500 p-3 font-bold text-black disabled:opacity-40" disabled={busy || !item || !Number.isSafeInteger(Number(price)) || Number(price) < 1} onClick={() => void run('/api/market', { instanceId:item, priceSilver:Number(price) })}>{vi ? 'Đăng bán' : 'Create listing'}</button>
    </section>
    <section className="glass p-4"><h2 className="mb-3 font-bold">{vi ? 'Đang rao bán' : 'Active listings'}</h2>
      {listings.length === 0 && <p className="text-white/50">{vi ? 'Chưa có vật phẩm' : 'No listings'}</p>}
      {listings.map(l => <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 py-3">
        <div><p className="font-semibold">{l.item_id}</p><p className="text-sm text-white/60">UID {l.seller_uid} · {Number(l.price_silver).toLocaleString()} Cxu Bạc</p></div>
        <button className="rounded-lg border border-amber-400 px-4 py-2 font-bold disabled:opacity-40" disabled={busy} onClick={() => void run(`/api/market/${l.id}/${Number(l.seller_uid) === Number(uid) ? 'cancel' : 'buy'}`, { idempotencyKey: crypto.randomUUID() })}>{Number(l.seller_uid) === Number(uid) ? (vi ? 'Hủy bán' : 'Cancel') : (vi ? 'Mua' : 'Buy')}</button>
      </div>)}
    </section>
  </div></AppShell>;
}
