'use client';
import { useState } from 'react';

type Point = { day: string; value: number };
const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Une série, un axe. Survol au doigt et à la souris, valeurs disponibles en tableau. */
export function DailyBars({ title, data, color }: { title: string; data: Point[]; color: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 170, top = 12, bottom = 22, left = 46;
  const max = Math.max(...data.map((d) => d.value), 1);
  const nice = niceMax(max);
  const plotH = H - top - bottom;
  const plotW = W - left;
  const step = plotW / Math.max(data.length, 1);
  const barW = Math.max(1.5, Math.min(18, step - 2));
  const labelEvery = Math.ceil(data.length / 6);
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="row between" style={{ marginBottom: 6 }}>
        <h3>{title}</h3><span className="small muted">{fmt.format(total / 100)} sur la période</span>
      </figcaption>
      {total === 0 ? <p className="empty small">Aucun encaissement sur cette période.</p> : <>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${title} par jour`} onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((f) => {
            const y = top + plotH * (1 - f);
            return <g key={f}>
              <line x1={left} x2={W} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
              <text x={left - 6} y={y + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">{fmt.format((nice * f) / 100)}</text>
            </g>;
          })}
          {data.map((d, i) => {
            const h = d.value === 0 ? 0 : Math.max(2, (d.value / nice) * plotH);
            const x = left + i * step + (step - barW) / 2;
            return <g key={d.day}>
              {h > 0 && <path d={roundedTop(x, top + plotH - h, barW, h, Math.min(4, barW / 2))} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />}
              <rect x={left + i * step} y={top} width={step} height={plotH} fill="transparent"
                onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
              {i % labelEvery === 0 && <text x={left + i * step + step / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{dayFmt.format(new Date(d.day))}</text>}
            </g>;
          })}
        </svg>
        {hover !== null && data[hover] && (
          <div className="chart-tip" style={{ left: `${((left + hover * step + step / 2) / W) * 100}%`, top: '12%' }}>
            {dayFmt.format(new Date(data[hover].day))} : {fmt.format(data[hover].value / 100)}
          </div>
        )}
      </div>
      <details className="small">
        <summary className="muted" style={{ fontWeight: 400 }}>Voir les valeurs</summary>
        <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
          <table><thead><tr><th>Jour</th><th className="num">Montant</th></tr></thead>
            <tbody>{data.filter((d) => d.value > 0).map((d) => <tr key={d.day}><td>{dayFmt.format(new Date(d.day))}</td><td className="num">{fmt.format(d.value / 100)}</td></tr>)}</tbody></table>
        </div>
      </details>
      </>}
    </figure>
  );
}
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
function niceMax(v: number) {
  const m = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / m;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * m;
}
