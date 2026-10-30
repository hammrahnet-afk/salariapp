import React from 'react';
import { moneyShort, toFa } from '../lib/format';
import { cx } from './ui';

/* ------------------------------ نمودار میله‌ای ----------------------------- */

export function BarChart({
  data, height = 160, color = 'var(--c-brand)', secondaryColor = 'var(--c-info)', secondaryKey, unit,
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  secondaryColor?: string;
  secondaryKey?: string;
  unit?: string;
}) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, (d as any)[secondaryKey || 'value'] || 0)));
  return (
    <div className="w-full">
      <div className="flex items-end gap-1.5 w-full" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max(2, Math.round((d.value / max) * (height - 26)));
          const h2 = secondaryKey ? Math.max(2, Math.round((((d as any)[secondaryKey] || 0) / max) * (height - 26))) : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 group">
              <div className="relative w-full flex items-end justify-center gap-0.5" style={{ height: height - 26 }}>
                {secondaryKey ? <div className="w-1/2 rounded-t-md transition-all" style={{ height: h2, background: secondaryColor, opacity: 0.5 }} /> : null}
                <div
                  className={cx('rounded-t-md transition-all', secondaryKey ? 'w-1/2' : 'w-full max-w-[42px] mx-auto')}
                  style={{ height: h, background: color }}
                  title={`${d.label}: ${moneyShort(d.value)}${unit ? ' ' + unit : ''}`}
                />
              </div>
              <span className="text-[10px] text-muted truncate w-full text-center">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- دونات --------------------------------- */

export function Donut({ items, size = 160, thickness = 18, centerLabel, centerValue }: { items: { label: string; value: number; color: string }[]; size?: number; thickness?: number; centerLabel?: string; centerValue?: string }) {
  const total = items.reduce((a, i) => a + i.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4 min-w-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-surface2)" strokeWidth={thickness} />
        {items.map((it, i) => {
          const len = (it.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={it.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="min-w-0 flex-1">
        {centerLabel ? <div className="text-xs text-muted truncate">{centerLabel}</div> : null}
        {centerValue ? <div className="text-lg font-bold nums mb-2 truncate">{centerValue}</div> : null}
        <ul className="space-y-1.5 min-w-0">
          {items.slice(0, 6).map((it, i) => (
            <li key={i} className="flex items-center gap-2 min-w-0 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: it.color }} />
              <span className="truncate flex-1">{it.label}</span>
              <span className="nums text-muted shrink-0">{toFa(Math.round((it.value / total) * 100))}٪</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------ نوار افقی -------------------------------- */

export function RankBars({ items, unit }: { items: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5 min-w-0">
      {items.map((it, i) => (
        <li key={i} className="min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
            <span className="text-xs truncate flex-1">{it.label}</span>
            <span className="text-[11px] nums text-muted shrink-0">{moneyShort(it.value)}{unit ? ` ${unit}` : ''}</span>
          </div>
          <div className="h-2 rounded-full bg-surface2 overflow-hidden">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.max(3, (it.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ جرقه‌نما --------------------------------- */

export function Sparkline({ values, color = 'var(--c-brand)', height = 44 }: { values: number[]; color?: string; height?: number }) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  const w = 100;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(2)},${(height - (v / max) * (height - 6) - 3).toFixed(2)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polyline points={`0,${height} ${pts} ${w},${height}`} fill={color} opacity="0.12" stroke="none" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
