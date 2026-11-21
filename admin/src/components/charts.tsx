import { useState } from 'react';

// Tiny dependency-free SVG charts for the Usage section. Colours come from CSS tokens (--chart-1…4).
export interface Series { key: string; label: string; color?: string }
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];
const W = 720;
const H = 220;
const PAD = { l: 40, r: 12, t: 12, b: 26 };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
const short = (d: string) => d.slice(5);

export function Legend({ series }: { series: Series[] }) {
  return (
    <div className="legend">
      {series.map((s, i) => (
        <span key={s.key}><i style={{ background: s.color ?? COLORS[i % 4] }} />{s.label}</span>
      ))}
    </div>
  );
}

/** Line chart: one point per row, rows share an x label. Hover shows the row's values. */
export function LineChart({ data, xKey, series }: { data: Record<string, any>[]; xKey: string; series: Series[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="muted">No data in this range.</p>;
  const max = niceMax(Math.max(1, ...data.flatMap((r) => series.map((s) => Number(r[s.key]) || 0))));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const step = Math.max(1, Math.ceil(data.length / 8));
  return (
    <div className="chart">
      <Legend series={series} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="axis">{t}</text>
          </g>
        ))}
        {data.map((r, i) => i % step === 0 && (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="axis">{short(String(r[xKey]))}</text>
        ))}
        {series.map((s, si) => (
          <polyline key={s.key} fill="none" strokeWidth="2" stroke={s.color ?? COLORS[si % 4]}
            points={data.map((r, i) => `${x(i)},${y(Number(r[s.key]) || 0)}`).join(' ')} />
        ))}
        {data.map((_, i) => (
          <rect key={i} x={x(i) - iw / data.length / 2} y={PAD.t} width={Math.max(4, iw / data.length)} height={ih}
            fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} className="cursor" />}
      </svg>
      {hover !== null && (
        <div className="tip"><strong>{String(data[hover][xKey])}</strong>
          {series.map((s) => <span key={s.key}>{s.label}: {Number(data[hover][s.key]) || 0}</span>)}
        </div>
      )}
    </div>
  );
}

/** Stacked / single bar chart. */
export function BarChart({ data, xKey, series, xLabel }: {
  data: Record<string, any>[]; xKey: string; series: Series[]; xLabel?: (v: any) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="muted">No data in this range.</p>;
  const total = (r: Record<string, any>) => series.reduce((a, s) => a + (Number(r[s.key]) || 0), 0);
  const max = niceMax(Math.max(1, ...data.map(total)));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const bw = iw / data.length;
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const step = Math.max(1, Math.ceil(data.length / 12));
  const label = xLabel ?? ((v: any) => short(String(v)));
  return (
    <div className="chart">
      {series.length > 1 && <Legend series={series} />}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * t)} y2={y(max * t)} className="grid" />
            <text x={PAD.l - 6} y={y(max * t) + 4} textAnchor="end" className="axis">{Math.round(max * t)}</text>
          </g>
        ))}
        {data.map((r, i) => {
          let acc = 0;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} opacity={hover === null || hover === i ? 1 : 0.55}>
              {series.map((s, si) => {
                const v = Number(r[s.key]) || 0;
                const top = y(acc + v);
                const h = y(acc) - top;
                acc += v;
                return <rect key={s.key} x={PAD.l + i * bw + bw * 0.12} width={bw * 0.76} y={top} height={Math.max(0, h)}
                  fill={s.color ?? COLORS[si % 4]} rx="2" />;
              })}
              {i % step === 0 && <text x={PAD.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="axis">{label(r[xKey])}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tip"><strong>{label(data[hover][xKey])}</strong>
          {series.map((s) => <span key={s.key}>{s.label}: {Number(data[hover][s.key]) || 0}</span>)}
        </div>
      )}
    </div>
  );
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Weekday × hour grid. `cells` use dow 1 (Mon) … 7 (Sun) and hour 0-23. */
export function Heatmap({ cells, unit }: { cells: { dow: number; hour: number; users: number }[]; unit: string }) {
  const max = Math.max(1, ...cells.map((c) => c.users));
  const map = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c.users]));
  return (
    <div className="heat" role="img" aria-label="Activity by weekday and hour">
      <div />
      {Array.from({ length: 24 }, (_, h) => <span key={h} className="heat-h">{h % 3 === 0 ? h : ''}</span>)}
      {DOW.map((d, di) => (
        <div key={d} style={{ display: 'contents' }}>
          <span className="heat-d">{d}</span>
          {Array.from({ length: 24 }, (_, h) => {
            const v = map.get(`${di + 1}-${h}`) ?? 0;
            return <i key={h} title={`${d} ${h}:00 — ${v} ${unit}`}
              style={{ background: 'var(--chart-1)', opacity: v ? 0.12 + 0.88 * (v / max) : 0.05 }} />;
          })}
        </div>
      ))}
    </div>
  );
}

/** Horizontal share bars: label + value, widths relative to the largest. */
export function HBars({ rows }: { rows: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="muted">No data in this range.</p>;
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.label} className="hbar">
          <span className="hbar-l" title={r.label}>{r.label}</span>
          <span className="hbar-t"><b style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="hbar-v">{r.value.toLocaleString()}{r.sub ? <small> {r.sub}</small> : null}</span>
        </div>
      ))}
    </div>
  );
}
