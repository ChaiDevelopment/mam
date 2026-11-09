'use client';

import { useState } from 'react';

export interface Datum {
  label: string;
  value: number;
  /** Full label for tooltip/table (e.g. full date). */
  detail?: string;
}

/**
 * Single-series bar chart (one hue = `--mam-chart`, validated for light & dark surfaces).
 * Thin bars with 4px rounded data-ends anchored at the baseline, 2px gaps, recessive grid,
 * per-bar hover/focus tooltip with an oversized hit target, and a table view for accessibility.
 */
export function BarChart({ data, title, valueLabel, height = 180, horizontal = false }: { data: Datum[]; title: string; valueLabel: string; height?: number; horizontal?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = niceMax(max);
  const ticks = [0, nice / 2, nice];

  return (
    <figure className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <figcaption className="text-small font-bold">{title}</figcaption>
        <button className="text-caption font-semibold text-text-muted underline" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? 'Tampilkan grafik' : 'Tampilkan tabel'}
        </button>
      </div>
      {table ? (
        <table className="w-full text-small">
          <thead>
            <tr className="text-left text-text-muted">
              <th className="py-1 font-semibold">Label</th>
              <th className="py-1 text-right font-semibold">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t border-border">
                <td className="py-1">{d.detail ?? d.label}</td>
                <td className="py-1 text-right tabular-nums">{d.value.toLocaleString('id-ID')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : horizontal ? (
        <ul className="space-y-2" role="list">
          {data.map((d, i) => (
            <li key={d.label} className="relative grid grid-cols-[110px_1fr_auto] items-center gap-2 text-small" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <span className="truncate text-text-muted">{d.label}</span>
              <span className="h-3 rounded-r bg-surface-muted">
                <span className="block h-full rounded-r" style={{ width: `${(d.value / nice) * 100}%`, background: 'var(--mam-chart)', borderRadius: '0 4px 4px 0' }} />
              </span>
              <span className="w-10 text-right font-semibold tabular-nums">{d.value.toLocaleString('id-ID')}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="relative" style={{ height }}>
          {/* recessive grid */}
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-8 border-t border-border" style={{ bottom: `${(t / nice) * (height - 20) + 20}px` }}>
              <span className="absolute -left-8 -top-2 w-7 text-right text-[10px] text-text-muted tabular-nums">{t}</span>
            </div>
          ))}
          <div className="absolute inset-x-8 bottom-5 top-0 flex items-end gap-[2px]" role="list" aria-label={title}>
            {data.map((d, i) => (
              <div
                key={d.label}
                role="listitem"
                tabIndex={0}
                aria-label={`${d.detail ?? d.label}: ${d.value} ${valueLabel}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="relative flex h-full flex-1 items-end outline-none"
              >
                <div className="w-full" style={{ height: `${(d.value / nice) * 100}%`, minHeight: d.value ? 2 : 0, background: 'var(--mam-chart)', borderRadius: '4px 4px 0 0', opacity: hover === null || hover === i ? 1 : 0.55 }} />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-text px-2 py-1 text-caption text-background shadow-raised">
                    <strong>{d.value.toLocaleString('id-ID')}</strong> {valueLabel}
                    <span className="block opacity-80">{d.detail ?? d.label}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="absolute inset-x-8 bottom-0 flex justify-between text-[10px] text-text-muted">
            <span>{data[0]?.label}</span>
            <span>{data[Math.floor(data.length / 2)]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
        </div>
      )}
    </figure>
  );
}

export function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}
