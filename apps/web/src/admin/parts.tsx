import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function Panel({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass flex flex-col gap-3 p-4 lg:p-5 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="font-display text-lg text-white/90">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="glass flex flex-col gap-1 p-4">
      <span className="text-xs text-white/55">{label}</span>
      <span className="font-display text-2xl tabular-nums text-gold-100">{value}</span>
      {hint && <span className="text-[11px] text-white/45">{hint}</span>}
    </div>
  );
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'gold' | 'cyan' | 'ruby' | 'emerald' }) {
  const tones = {
    muted: 'border-white/15 text-white/65',
    gold: 'border-gold-300/50 text-gold-100',
    cyan: 'border-neon-cyan/50 text-neon-cyan',
    ruby: 'border-ruby-400/60 text-ruby-400',
    emerald: 'border-emerald-400/60 text-emerald-400',
  } as const;
  return <span className={`inline-flex items-center rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  return <p className="py-6 text-center text-sm text-white/45">{children ?? t('admin.empty')}</p>;
}

/** Plain, accessible table: header row, zebra-free rows, horizontal scroll on small screens. */
export function Table({ head, rows, empty }: { head: ReactNode[]; rows: ReactNode[][]; empty?: ReactNode }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="border-b border-white/10 px-2 py-2 text-xs font-medium text-white/50">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-white/[0.03]">
              {r.map((c, j) => (
                <td key={j} className="border-b border-white/5 px-2 py-2 align-top tabular-nums text-white/80">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Bar fill validated for the dark surface (OKLCH L inside the dark band, >= 3:1 contrast); hover brightens to brand gold. */
const BAR = '#b8862a';
const BAR_HOVER = '#f2c14e';

/**
 * Single-series daily bar chart (one measure, one axis): rounded data-ends on the baseline, 2px
 * gaps, recessive gridlines, hover tooltip with a hit target wider than the bar, and a table view.
 */
export function DailyBars({ title, data, format }: { title: string; data: { day: string; value: number }[]; format: (n: number) => string }) {
  const { t, i18n } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 420;
  const H = 140;
  const pad = { l: 36, r: 6, t: 10, b: 20 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = niceMax(max);
  const slot = (W - pad.l - pad.r) / Math.max(1, data.length);
  const barW = Math.max(2, slot - 2);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
  const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  const h = hover === null ? null : data[hover];
  const step = Math.max(1, Math.ceil(data.length / 7));
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="flex items-center justify-between gap-2 text-sm text-white/75">
        <span>{title}</span>
        <button type="button" className="text-[11px] text-white/45 underline-offset-2 hover:text-white/75 hover:underline" onClick={() => setTable(!table)}>
          {table ? t('admin.dash.hideTable') : t('admin.dash.showTable')}
        </button>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].filter((f) => Number.isInteger(nice * f)).map((f) => (
            <g key={f}>
              <line x1={pad.l} x2={W - pad.r} y1={y(nice * f)} y2={y(nice * f)} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
              <text x={pad.l - 6} y={y(nice * f) + 3} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.45)">
                {format(nice * f)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.l + i * slot + 1;
            const top = y(d.value);
            const bh = H - pad.b - top;
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${dayLabel(d.day)}: ${format(d.value)}`}>
                <rect x={pad.l + i * slot} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
                {d.value > 0 && <path d={roundedTop(x, top, barW, bh, Math.min(4, barW / 2, bh))} fill={hover === i ? BAR_HOVER : BAR} />}
              </g>
            );
          })}
          <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
          {data.map((d, i) =>
            // Every `step`-th day is labelled; the last day only when it is not crowded by the previous label.
            i % step === 0 || (i === data.length - 1 && i % step >= step / 2) ? (
              <text key={d.day} x={pad.l + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.45)">
                {dayLabel(d.day)}
              </text>
            ) : null,
          )}
        </svg>
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-white/15 bg-ink-950/95 px-2 py-1 text-[11px] shadow-lg"
            style={{ left: `${((pad.l + hover * slot + slot / 2) / W) * 100}%` }}
            role="status"
          >
            <div className="text-white/55">{dayLabel(h.day)}</div>
            <div className="font-semibold tabular-nums text-white">{format(h.value)}</div>
          </div>
        )}
      </div>
      {table && (
        <Table
          head={[t('admin.dash.day'), title]}
          rows={data.map((d) => [dayLabel(d.day), format(d.value)])}
        />
      )}
    </figure>
  );
}

function niceMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Bar path with only the top corners rounded, anchored flat on the baseline. */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
