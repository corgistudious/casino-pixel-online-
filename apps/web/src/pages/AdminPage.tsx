import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../lib/format';
import { api, ApiError } from '../net/api';
import type { Currency } from '@casino/shared';
import { Button } from '../ui/Button';
import { BadgeIcon } from '../ui/OfficialAssets';
import { TopBar } from '../ui/Chrome';
import { toast } from '../ui/toast';

interface Overview {
  users: number;
  online: number;
  rounds24h: number;
  wagered24h: number;
  paid24h: number;
  chipsInCirculation: number;
  goldInCirculation: number;
}

export function AdminPage() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [username, setUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('silver');
  const fmt = (n: number) => formatChips(n, i18n.language);
  const fail = (err: unknown) => toast(t(`errors.${err instanceof ApiError ? err.code : 'internal'}`), 'error');

  const load = () => void api<Overview>('/api/admin/overview').then(setData, fail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const call = async (path: string, body: unknown) => {
    try {
      await api(`/api/admin/users/${encodeURIComponent(username.trim())}/${path}`, { method: 'POST', body });
      toast(t('admin.done'), 'success');
      load();
    } catch (err) {
      fail(err);
    }
  };

  const edge = data && data.wagered24h > 0 ? (((data.wagered24h - data.paid24h) / data.wagered24h) * 100).toFixed(2) + '%' : '—';

  return (
    <div className="flex h-full flex-col">
      <TopBar title={t('admin.title')} back />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto grid max-w-4xl gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {data &&
              (
                [
                  ['admin.users', String(data.users)],
                  ['admin.online', String(data.online)],
                  ['admin.rounds24h', String(data.rounds24h)],
                  ['admin.wagered24h', fmt(data.wagered24h)],
                  ['admin.paid24h', fmt(data.paid24h)],
                  ['admin.edge24h', edge],
                  ['admin.chips', fmt(data.chipsInCirculation)],
                  ['admin.gold', fmt(data.goldInCirculation)],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="glass p-4">
                  <div className="text-xs text-white/50">{t(k)}</div>
                  <div className="font-display text-2xl text-gold-100">{v}</div>
                </div>
              ))}
          </div>
          <div className="glass flex flex-col gap-3 p-5">
            <h3 className="font-display text-xl">{t('admin.manage')}</h3>
            <input className="field" placeholder={t('admin.username')} value={username} onChange={(e) => setUsername(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <select className="field max-w-40" aria-label={t('admin.currency')} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                <option value="silver">{t('currency.silver')}</option>
                <option value="gold">{t('currency.gold')}</option>
              </select>
              <input className="field max-w-48" placeholder={t('admin.amount')} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Button variant="gold" disabled={!username || !Number.isInteger(Number(amount)) || !amount} onClick={() => void call('grant', { amount: Number(amount), currency })}>
                {t('admin.grant')}
              </Button>
              <Button variant="ruby" disabled={!username} onClick={() => void call('ban', { banned: true })}>
                {t('admin.ban')}
              </Button>
              <Button disabled={!username} onClick={() => void call('ban', { banned: false })}>
                {t('admin.unban')}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-white/60">{t('admin.badges')}:</span>
              {(['verified', 'partner'] as const).map((b) => (
                <span key={b} className="flex items-center gap-1">
                  <BadgeIcon badge={b} size={24} />
                  <Button size="sm" disabled={!username} onClick={() => void call('badges', { [b]: true })}>
                    + {t(`badges.${b}`)}
                  </Button>
                  <Button size="sm" disabled={!username} onClick={() => void call('badges', { [b]: false })}>
                    − {t(`badges.${b}`)}
                  </Button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
