import { FRAMES, type PublicUser } from '@casino/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sfx } from '../audio/sfx';
import { api, ApiError } from '../net/api';
import { useSession } from '../store/session';
import { AppShell, PageHeader } from '../ui/AppShell';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { NavIcon } from '../ui/NavIcons';
import { Amount } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';

const TABS = ['frames', 'cardBacks', 'tables', 'effects'] as const;
type Tab = (typeof TABS)[number];

function FramesGrid() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user)!;
  const gold = useSession((s) => s.gold);
  const setUser = useSession((s) => s.setUser);
  const [busy, setBusy] = useState<string | null>(null);

  const call = async (path: string, itemId: string, success?: string) => {
    setBusy(itemId);
    try {
      const { user: fresh } = await api<{ user: PublicUser }>(path, { method: 'POST', body: { itemId } });
      setUser(fresh);
      if (success) {
        sfx.win();
        toast(success, 'success');
      }
    } catch (err) {
      toast(t(`errors.${err instanceof ApiError ? err.code : 'internal'}`), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">
      {FRAMES.map((frame, i) => {
        const owned = user.ownedFrames.includes(frame.id);
        const equipped = user.frame === frame.id;
        return (
          <div
            key={frame.id}
            className={`glass group relative flex animate-rise flex-col items-center gap-2 overflow-hidden p-3 transition hover:-translate-y-0.5 ${
              equipped ? 'border-gold-300/60 shadow-glow' : 'hover:border-gold-300/30'
            }`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="relative flex h-24 w-full items-center justify-center lg:h-36 xl:h-44">
              <div className="absolute bottom-1 h-4 w-28 rounded-[50%] bg-gold-300/25 blur-md xl:w-40" />
              <div className="absolute h-20 w-20 rounded-full bg-gradient-to-b from-white/10 to-transparent lg:h-32 lg:w-32" />
              <div className="lg:hidden">
                <Avatar index={user.avatar} frame={frame.id} size={76} />
              </div>
              <div className="hidden lg:block xl:hidden">
                <Avatar index={user.avatar} frame={frame.id} size={104} />
              </div>
              <div className="hidden xl:block">
                <Avatar index={user.avatar} frame={frame.id} size={132} />
              </div>
            </div>
            <div className="text-center">
              <div className="font-display text-base leading-tight xl:text-xl">{t(`shop.names.${frame.id}`)}</div>
              <div className="mt-1 flex justify-center text-sm">
                {frame.price === 0 ? (
                  <span className="text-white/50">{t('shop.free')}</span>
                ) : (
                  <Amount currency="gold" value={String(frame.price)} size={20} className="font-semibold text-gold-100" />
                )}
              </div>
            </div>
            {equipped ? (
              <span className="rounded-full bg-gold-300/15 px-3 py-1 text-xs font-semibold text-gold-200">{t('shop.equipped')}</span>
            ) : owned ? (
              <Button size="sm" onClick={() => void call('/api/me/frame', frame.id)} disabled={busy !== null}>
                {t('shop.equip')}
              </Button>
            ) : (
              <Button variant="gold" size="sm" onClick={() => void call('/api/shop/buy', frame.id, t('shop.bought'))} disabled={busy !== null || gold < frame.price}>
                {t('shop.buy')}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SoonPanel({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <div className="glass relative flex flex-col items-center gap-3 overflow-hidden px-6 py-10 text-center">
      <div className="pointer-events-none absolute -top-16 h-40 w-80 rounded-full bg-gold-300/10 blur-3xl" />
      <div className="gold-border flex h-16 w-16 items-center justify-center rounded-2xl">
        <NavIcon name="collection" size={32} active />
      </div>
      <h3 className="font-display text-xl text-gold">{t('soon.title')}</h3>
      <p className="max-w-md text-sm text-white/60">{text}</p>
    </div>
  );
}

export function MarketPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('frames');
  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <PageHeader icon="market" title={t('market.title')} subtitle={t('market.subtitle')} />
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-1">
          {TABS.map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === key ? 'bg-gold-sheen text-ink-900 shadow-button' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              {t(`market.tabs.${key}`)}
              {key === 'frames' ? (
                <span className={`rounded px-1 text-[9px] font-bold uppercase ${tab === key ? 'bg-ink-900/20' : 'bg-emerald-500/20 text-emerald-400'}`}>{t('market.live')}</span>
              ) : (
                <span className={`rounded px-1 text-[9px] font-bold uppercase ${tab === key ? 'bg-ink-900/20' : 'bg-white/10 text-white/50'}`}>{t('hub.comingSoon')}</span>
              )}
            </button>
          ))}
        </div>
        {tab === 'frames' ? <FramesGrid /> : <SoonPanel text={t('market.tabSoon')} />}
        <p className="text-[11px] text-white/35">{t('app.disclaimer')}</p>
      </div>
    </AppShell>
  );
}
