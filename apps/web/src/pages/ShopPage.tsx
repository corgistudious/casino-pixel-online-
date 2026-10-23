import { FRAMES, type PublicUser } from '@casino/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sfx } from '../audio/sfx';
import { api, ApiError } from '../net/api';
import { useSession } from '../store/session';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { BalancePill, TopBar } from '../ui/Chrome';
import { Amount } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';

export function ShopPage() {
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
    <div className="flex h-full flex-col">
      <TopBar title={t('shop.title')} back />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-gold">{t('shop.frames')}</h2>
              <p className="text-sm text-white/50">{t('shop.desc')}</p>
            </div>
            <BalancePill />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {FRAMES.map((frame, i) => {
              const owned = user.ownedFrames.includes(frame.id);
              const equipped = user.frame === frame.id;
              return (
                <div
                  key={frame.id}
                  className={`glass flex animate-rise flex-col items-center gap-3 p-4 ${equipped ? 'border-gold-300/60 shadow-glow' : ''}`}
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <Avatar index={user.avatar} frame={frame.id} size={84} />
                  <div className="text-center">
                    <div className="font-display text-lg">{t(`shop.names.${frame.id}`)}</div>
                    <div className="mt-0.5 flex justify-center text-sm">
                      {frame.price === 0 ? <span className="text-white/50">{t('shop.free')}</span> : <Amount currency="gold" value={String(frame.price)} size={20} className="text-gold-100" />}
                    </div>
                  </div>
                  {equipped ? (
                    <span className="rounded-full bg-gold-300/15 px-3 py-1 text-xs font-semibold text-gold-200">{t('shop.equipped')}</span>
                  ) : owned ? (
                    <Button size="sm" onClick={() => void call('/api/me/frame', frame.id)} disabled={busy !== null}>
                      {t('shop.equip')}
                    </Button>
                  ) : (
                    <Button
                      variant="gold"
                      size="sm"
                      onClick={() => void call('/api/shop/buy', frame.id, t('shop.bought'))}
                      disabled={busy !== null || gold < frame.price}
                    >
                      {t('shop.buy')}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-white/35">{t('app.disclaimer')}</p>
        </div>
      </div>
    </div>
  );
}
