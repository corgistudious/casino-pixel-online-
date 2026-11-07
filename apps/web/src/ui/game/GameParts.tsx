import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { sfx } from '../../audio/sfx';
import { compactChips, formatChips } from '../../lib/format';
import { useSession } from '../../store/session';
import { CurrencyIcon } from '../OfficialAssets';
import { Chip } from '../Chip';

/** Chip rack: a radiogroup of chip values; the selected chip lifts. */
export function GameChipRack({ values, value, onChange, disabled = false }: { values: readonly number[]; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="gchips" role="radiogroup" aria-label={t('gameUi.chips')}>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          aria-label={formatChips(v, i18n.language)}
          disabled={disabled}
          className="gchip"
          onClick={() => {
            sfx.chip();
            onChange(v);
          }}
        >
          <Chip value={v} size={40} selected={v === value} />
        </button>
      ))}
    </div>
  );
}

export function GameStat({ label, value, accent = false }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className={`gstat${accent ? ' gstat--accent' : ''}`}>
      <span className="gstat-label">{label}</span>
      <span className="gstat-value">{value}</span>
    </div>
  );
}

/** Phase / turn pill with a seconds counter; turns red and pulses when `warn`. */
export function GameTimer({ label, seconds, warn = false }: { label: string; seconds?: number | null; warn?: boolean }) {
  return (
    <div role="status" aria-live="polite" className={`gtimer${warn ? ' gtimer--warn' : ''}`}>
      <span>{label}</span>
      {seconds !== undefined && seconds !== null && seconds > 0 && <b>{seconds}s</b>}
    </div>
  );
}

/** A titled block inside a floating panel. */
export function GameCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="gcard">
      {title && <div className="gcard-title">{title}</div>}
      {children}
    </section>
  );
}

/**
 * Silver / gold balance for the table HUD: a pill in the top bar, a narrow two-line stack in the side
 * columns of the compact (phone landscape) layout. Full amounts are in the title and screen-reader text.
 */
export function GameBalance() {
  const { t, i18n } = useTranslation();
  const balance = useSession((s) => s.balance);
  const gold = useSession((s) => s.gold);
  return (
    <div className="gbalance">
      <span className="gbalance-row" title={`${t('currency.silver')}: ${formatChips(balance, i18n.language)}`}>
        <CurrencyIcon currency="silver" size={18} />
        <span className="gbalance-full">{formatChips(balance, i18n.language)}</span>
        <span className="gbalance-short" aria-hidden>{compactChips(balance)}</span>
      </span>
      <span className="gbalance-row gbalance-row--gold" title={`${t('currency.gold')}: ${formatChips(gold, i18n.language)}`}>
        <CurrencyIcon currency="gold" size={18} />
        <span className="gbalance-full">{formatChips(gold, i18n.language)}</span>
        <span className="gbalance-short" aria-hidden>{compactChips(gold)}</span>
      </span>
    </div>
  );
}
