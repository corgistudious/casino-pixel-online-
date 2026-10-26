import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../../lib/format';
import { Button } from '../../ui/Button';
import { CurrencyIcon } from '../../ui/OfficialAssets';

/**
 * Insurance decision with a countdown ring. When time runs out "No insurance" is chosen
 * (the multiplayer server applies the same default on its own deadline).
 */
/** `deadline` comes from the server on shared tables; solo play gives the player 15 s from mount. */
export function InsurancePrompt({ max, deadline: given, busy, onDecide }: { max: number; deadline?: number; busy: boolean; onDecide: (amount: number) => void }) {
  const [deadline] = useState(() => given ?? Date.now() + 15_000);
  const { t, i18n } = useTranslation();
  const [amount, setAmount] = useState(max);
  const [now, setNow] = useState(Date.now());
  const decided = useRef(false);
  const total = Math.max(1, deadline - Date.now());
  const totalRef = useRef(total);
  const left = Math.max(0, deadline - now);
  const fmt = (n: number) => formatChips(n, i18n.language);
  const decide = (n: number) => {
    if (decided.current) return;
    decided.current = true;
    onDecide(n);
  };
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (left <= 0) decide(0);
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = 18;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, left / totalRef.current);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-300/40 bg-gradient-to-br from-[#06303a] via-[#0b1d2c] to-[#120d24] p-4 shadow-[0_0_30px_-10px_rgba(90,216,255,0.7)]" role="dialog" aria-labelledby="ins-title">
      <div className="flex items-start gap-3">
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden className="shrink-0">
          <circle cx="22" cy="22" r={r} fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
          <circle cx="22" cy="22" r={r} fill="none" stroke={frac > 0.35 ? '#5ad8ff' : '#ff5a6e'} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 22 22)" />
          <text x="22" y="26" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">{Math.ceil(left / 1000)}</text>
        </svg>
        <div className="min-w-0">
          <h3 id="ins-title" className="font-display text-lg font-heading text-cyan-100">🛡️ {t('blackjack.insurance.title')}</h3>
          <p className="text-xs leading-snug text-white/70">{t('blackjack.insurance.body', { max: fmt(max) })}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <CurrencyIcon currency="silver" size={22} />
        <input type="range" min={1} max={Math.max(1, max)} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="flex-1 accent-cyan-300" aria-label={t('blackjack.insurance.title')} disabled={max < 1} />
        <span className="w-16 text-right font-strong tabular-nums text-white">{fmt(amount)}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
        <button type="button" className="rounded-lg bg-white/5 py-1 text-white/70 hover:bg-white/10" onClick={() => setAmount(Math.max(1, Math.floor(max / 2)))}>
          {t('blackjack.insurance.half')}
        </button>
        <button type="button" className="rounded-lg bg-white/5 py-1 text-white/70 hover:bg-white/10" onClick={() => setAmount(max)}>
          {t('blackjack.insurance.full')}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={() => decide(0)} disabled={busy}>
          {t('blackjack.insurance.none')}
        </Button>
        <Button variant="gold" onClick={() => decide(amount)} disabled={busy || max < 1}>
          {t('blackjack.insurance.buy', { amount: fmt(amount) })}
        </Button>
      </div>
      <p className="mt-2 text-center text-[10px] text-white/45">{t('blackjack.insurance.timeLeft', { s: Math.ceil(left / 1000) })}</p>
    </div>
  );
}
