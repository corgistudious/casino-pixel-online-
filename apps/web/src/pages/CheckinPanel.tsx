import { CHECKIN_REWARDS, type CheckinResult } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { compactChips, formatChips, formatDuration } from '../lib/format';
import { api, ApiError } from '../net/api';
import { sfx } from '../audio/sfx';
import { useSession } from '../store/session';
import { Button } from '../ui/Button';
import { CurrencyIcon } from '../ui/OfficialAssets';
import { toast } from '../ui/toast';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** 7-day check-in cycle: claimed days, today's tile, and upcoming rewards. */
export function CheckinPanel() {
  const { t, i18n } = useTranslation();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const { streak, claimedToday, nextDay, dayEndsAt } = user.checkin;
  const endsIn = new Date(dayEndsAt).getTime() - now;

  // Refresh state when the check-in day rolls over while the lobby is open.
  useEffect(() => {
    if (endsIn > 0) return;
    void api<{ user: typeof user }>('/api/me').then((r) => setUser(r.user), () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsIn <= 0]);

  const claim = async () => {
    setBusy(true);
    try {
      const res = await api<CheckinResult>('/api/me/checkin', { method: 'POST' });
      setUser(res.user);
      sfx.win();
      const parts = [`+${formatChips(res.reward.silver, i18n.language)} ${t('currency.silver')}`];
      if (res.reward.gold) parts.push(`+${res.reward.gold} ${t('currency.gold')}`);
      toast(`${t('checkin.claimed', { day: res.day })} ${parts.join(' · ')}`, 'success');
    } catch (err) {
      toast(t(`errors.${err instanceof ApiError ? err.code : 'internal'}`), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`glass flex flex-col gap-3 p-4 ${claimedToday ? '' : 'animate-pulse-glow'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg">{t('checkin.title')}</h3>
        <span className="text-[11px] text-white/40">{t('checkin.resetIn', { time: formatDuration(endsIn) })}</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {CHECKIN_REWARDS.map((reward, i) => {
          const day = i + 1;
          const done = day <= streak;
          const today = !claimedToday && day === nextDay;
          return (
            <div
              key={day}
              className={`relative flex flex-col items-center gap-0.5 rounded-lg border px-0.5 py-1.5 text-center transition ${
                today
                  ? 'border-gold-300 bg-gold-300/15 shadow-glow'
                  : done
                    ? 'border-emerald-400/40 bg-emerald-400/10'
                    : day === 7
                      ? 'border-neon-violet/40 bg-neon-violet/10'
                      : 'border-white/10 bg-black/20'
              }`}
            >
              <span className="whitespace-nowrap text-[9px] leading-none text-white/50">{t('checkin.day', { n: day })}</span>
              <CurrencyIcon currency="silver" size={day === 7 ? 28 : 22} />
              <span className="text-[10px] font-semibold tabular-nums text-white/90">{compactChips(reward.silver)}</span>
              {reward.gold > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] font-semibold tabular-nums text-gold-200">
                  <CurrencyIcon currency="gold" size={12} />+{reward.gold}
                </span>
              )}
              {done && (
                <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-ink-950/55 text-lg font-bold text-emerald-400">✓</span>
              )}
            </div>
          );
        })}
      </div>
      {claimedToday ? (
        <p className="text-center text-sm text-white/60">{t('checkin.done')}</p>
      ) : (
        <Button variant="gold" onClick={() => void claim()} disabled={busy}>
          {t('checkin.claim')} · {t('checkin.day', { n: nextDay })}
        </Button>
      )}
      <p className="text-[11px] leading-snug text-white/40">{t('checkin.streakInfo')}</p>
    </div>
  );
}
