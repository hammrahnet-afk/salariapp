import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toFa, toEn } from '../lib/format';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/* --------------------------------- آیکون‌ها -------------------------------- */

const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  box: 'M21 8v9a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 17V8m18 0-9 5m9-5-9-5m0 10L3 8m9 5v10M3 8l9-5',
  users: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.87M16.5 3.13a4 4 0 0 1 0 7.75',
  card: 'M2 7h20v12H2zM2 11h20M6 15h4',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  calendar: 'M7 2v3m10-3v3M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  message: 'M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2-5.6A8.5 8.5 0 1 1 21 11.5z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.3-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 3 1.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  battery: 'M2 8h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H2zM22 11v2M5 11v2',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  bellOff: 'M13.7 21a2 2 0 0 1-3.4 0M18.6 5.4A6 6 0 0 0 6 8c0 7-3 9-3 9h13M2 2l20 20',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  drag: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.3-4.3',
  close: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  chevDown: 'm6 9 6 6 6-6',
  chevLeft: 'm15 18-6-6 6-6',
  chevRight: 'm9 18 6-6-6-6',
  back: 'M15 18l-6-6 6-6',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  wallet: 'M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z',
  cash: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 12h.01M18 12h.01',
  image: 'M3 5h18v14H3zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M21 15l-5-5L5 19',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4m0 4h.01',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  cloud: 'M18 10a5 5 0 0 0-9.6-1.5A4 4 0 1 0 6 18h12a4 4 0 0 0 0-8z',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
  filter: 'M22 3H2l8 9.5V19l4 2v-8.5z',
  layers: 'm12 2 10 5-10 5L2 7zm10 10-10 5L2 12m20 5-10 5-10-5',
  send: 'm22 2-7 20-4-9-9-4z',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  tag: 'M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5m13 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  power: 'M18.4 6.6a9 9 0 1 1-12.8 0M12 2v10',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7zm11 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  copy: 'M9 9h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  menu: 'M3 6h18M3 12h18M3 18h18',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  database: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3m8-3v14c0 1.7-3.6 3-8 3s-8-1.3-8-3V5m16 7c0 1.7-3.6 3-8 3s-8-1.3-8-3',
  spark: 'M12 2v6m0 8v6M4.9 4.9l4.2 4.2m5.8 5.8 4.2 4.2M2 12h6m8 0h6M4.9 19.1l4.2-4.2m5.8-5.8 4.2-4.2',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
};

export function Icon({ name, className = 'w-5 h-5', stroke = 1.7, ...rest }: { name: keyof typeof PATHS | string; className?: string; stroke?: number } & Omit<React.SVGProps<SVGSVGElement>, 'stroke'>) {
  const d = PATHS[name] ?? PATHS.box;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...rest}>
      <path d={d} />
    </svg>
  );
}

/* --------------------------------- دکمه ---------------------------------- */

type BtnVariant = 'primary' | 'soft' | 'outline' | 'ghost' | 'danger' | 'warn';

export function Button({
  children, variant = 'primary', size = 'md', icon, iconRight, className, loading, block, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  iconRight?: string;
  loading?: boolean;
  block?: boolean;
}) {
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-brand text-brand-ink hover:brightness-105 shadow-sm',
    soft: 'bg-brand-soft text-brand hover:brightness-95',
    outline: 'border border-line bg-surface text-ink hover:bg-surface2',
    ghost: 'text-muted hover:bg-surface2 hover:text-ink',
    danger: 'bg-danger text-white hover:brightness-110',
    warn: 'bg-warn text-white hover:brightness-110',
  };
  const sizes = { sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-lg', md: 'h-11 px-4 text-sm gap-2 rounded-xl', lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl' };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center font-medium transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap select-none',
        variants[variant], sizes[size], block && 'w-full', className,
      )}
    >
      {loading ? <Spinner className="w-4 h-4" /> : icon ? <Icon name={icon} className={size === 'sm' ? 'w-4 h-4' : 'w-[18px] h-[18px]'} /> : null}
      <span className="truncate">{children}</span>
      {iconRight ? <Icon name={iconRight} className={size === 'sm' ? 'w-4 h-4' : 'w-[18px] h-[18px]'} /> : null}
    </button>
  );
}

export function IconButton({
  name, label, className, variant = 'ghost', size = 'md', ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { name: string; label: string; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-brand text-brand-ink',
    soft: 'bg-brand-soft text-brand',
    outline: 'border border-line bg-surface text-ink',
    ghost: 'text-muted hover:bg-surface2 hover:text-ink',
    danger: 'text-danger hover:bg-danger-soft',
    warn: 'text-warn hover:bg-warn-soft',
  };
  const box = { sm: 'w-8 h-8 rounded-lg', md: 'w-9 h-9 rounded-lg', lg: 'w-11 h-11 rounded-xl' }[size];
  const ico = { sm: 'w-4 h-4', md: 'w-[18px] h-[18px]', lg: 'w-5 h-5' }[size];
  return (
    <button {...rest} title={label} aria-label={label} className={cx('inline-flex items-center justify-center transition active:scale-95 shrink-0 disabled:opacity-40', box, variants[variant], className)}>
      <Icon name={name} className={ico} />
    </button>
  );
}

export function Spinner({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('animate-spin', className)} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* --------------------------------- کارت ---------------------------------- */

export function Card({ children, className, pad = true }: { children: React.ReactNode; className?: string; pad?: boolean }) {
  return <div className={cx('bg-surface border border-line rounded-card shadow-card', pad && 'p-4', className)}>{children}</div>;
}

export function SectionTitle({ title, subtitle, action, icon }: { title: string; subtitle?: string; action?: React.ReactNode; icon?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3 min-w-0">
      <div className="min-w-0 flex items-center gap-2">
        {icon ? <Icon name={icon} className="w-[18px] h-[18px] text-brand shrink-0" /> : null}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold truncate">{title}</h3>
          {subtitle ? <p className="text-xs text-muted truncate">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* -------------------------------- نشان‌ها --------------------------------- */

export type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info' | 'muted';

export function Badge({ children, tone = 'neutral', className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-surface2 text-muted border-line',
    brand: 'bg-brand-soft text-brand border-transparent',
    ok: 'bg-ok-soft text-ok border-transparent',
    warn: 'bg-warn-soft text-warn border-transparent',
    danger: 'bg-danger-soft text-danger border-transparent',
    info: 'bg-info-soft text-info border-transparent',
    muted: 'bg-surface2 text-muted border-line',
  };
  return <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

/* -------------------------------- ورودی‌ها -------------------------------- */

export function Field({ label, hint, error, required, children, className }: { label?: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('block min-w-0', className)}>
      {label ? (
        <span className="block text-xs font-medium text-muted mb-1.5 truncate">
          {label}
          {required ? <span className="text-danger mr-1">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? <span className="block text-[11px] text-danger mt-1">{error}</span> : hint ? <span className="block text-[11px] text-muted mt-1 truncate">{hint}</span> : null}
    </label>
  );
}

/** پایه یکسان همه کنترل‌ها: ارتفاع، حاشیه، گردی و حالت فوکوس */
export const CONTROL_BASE =
  'w-full rounded-xl border border-line bg-surface2 text-ink placeholder:text-muted/70 outline-none transition focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/15 disabled:opacity-60 disabled:cursor-not-allowed';

export type ControlSize = 'md' | 'sm';
export const CONTROL_HEIGHT: Record<ControlSize, string> = { md: 'h-11', sm: 'h-10' };
const inputCls = cx(CONTROL_BASE, CONTROL_HEIGHT.md, 'px-3');

export const Input = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: ControlSize }>(
  function Input({ className, size = 'md', ...rest }, ref) {
    return <input ref={ref} {...rest} className={cx(CONTROL_BASE, CONTROL_HEIGHT[size], 'px-3', className)} />;
  },
);

export function Select({ className, children, size = 'md', ...rest }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { size?: ControlSize }) {
  return (
    <div className="relative min-w-0">
      <select {...rest} className={cx(CONTROL_BASE, CONTROL_HEIGHT[size], 'pl-9 pr-3 appearance-none truncate', className)}>{children}</select>
      <Icon name="chevDown" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
    </div>
  );
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(CONTROL_BASE, 'px-3 py-2.5 leading-6 resize-y min-h-[84px]', className)} />;
}

/** ورودی مبلغ: ارقام فارسی + جداکننده هزارگان (با واحد اختیاری داخل کادر) */
export function MoneyInput({
  value, onChange, placeholder, className, unit, size = 'md', ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> & {
  value: number | string;
  onChange: (n: number) => void;
  unit?: string;
  size?: ControlSize;
}) {
  const [text, setText] = useState(() => formatMoneyText(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(formatMoneyText(value));
  }, [value]);
  const input = (
    <input
      {...rest}
      inputMode="numeric"
      value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setText(formatMoneyText(toEn(String(value)))); }}
      onChange={(e) => {
        const n = toNumberSafe(e.target.value);
        setText(toFa(n === 0 ? '' : n.toLocaleString('en-US')));
        onChange(n);
      }}
      placeholder={placeholder}
      className={cx(
        CONTROL_BASE,
        CONTROL_HEIGHT[size],
        'text-left nums font-medium tracking-tight',
        unit ? 'pl-3 pr-14' : 'px-3',
        className,
      )}
    />
  );
  if (!unit) return input;
  return (
    <div className="relative min-w-0">
      {input}
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted pointer-events-none select-none">{unit}</span>
    </div>
  );
}

/** شمارنده مقدار با دکمه‌های هم‌اندازه (جایگزین دکمه‌های پراکنده +/-) */
export function Stepper({
  value, onChange, min = 0, max = 9999, step = 1, size = 'md', suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: ControlSize;
  suffix?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
  return (
    <div className={cx('flex items-stretch overflow-hidden', CONTROL_BASE, CONTROL_HEIGHT[size], 'p-0 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15')}>
      <button
        type="button"
        aria-label="کاهش"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
        className="w-10 shrink-0 grid place-items-center text-muted transition hover:bg-surface active:scale-95 disabled:opacity-35"
      >
        <Icon name="minus" className="w-4 h-4" stroke={2.2} />
      </button>
      <div className="flex-1 min-w-0 flex items-center justify-center gap-1 border-x border-line bg-surface/60">
        <input
          inputMode="numeric"
          aria-label="مقدار"
          value={toFa(value)}
          onChange={(e) => {
            const digits = toEn(e.target.value).replace(/[^\d]/g, '');
            onChange(clamp(digits === '' ? min : Number(digits)));
          }}
          className="w-full min-w-0 bg-transparent text-center text-sm font-semibold nums outline-none"
        />
        {suffix ? <span className="text-[10px] text-muted shrink-0 pl-1 select-none">{suffix}</span> : null}
      </div>
      <button
        type="button"
        aria-label="افزایش"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
        className="w-10 shrink-0 grid place-items-center text-brand transition hover:bg-surface active:scale-95 disabled:opacity-35"
      >
        <Icon name="plus" className="w-4 h-4" stroke={2.2} />
      </button>
    </div>
  );
}

/** ردیف خوانا برای جمع‌بندی مبالغ (عدد همیشه راست‌چین و هم‌تراز) */
export function AmountRow({
  label, value, tone, strong, className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: 'ok' | 'danger' | 'warn' | 'muted';
  strong?: boolean;
  className?: string;
}) {
  const tones = { ok: 'text-ok', danger: 'text-danger', warn: 'text-warn', muted: 'text-muted' };
  return (
    <div className={cx('flex items-baseline justify-between gap-2 min-w-0 py-0.5', className)}>
      <span className={cx('truncate text-[12px]', strong ? 'font-semibold text-ink' : 'text-muted')}>{label}</span>
      <span className={cx('shrink-0 nums tabular-nums text-left', strong ? 'text-base font-bold' : 'text-[13px] font-medium', tone ? tones[tone] : '')}>
        {value}
      </span>
    </div>
  );
}

function formatMoneyText(v: number | string): string {
  const n = toNumberSafe(String(v));
  return n ? toFa(n.toLocaleString('en-US')) : '';
}

function toNumberSafe(v: string): number {
  const n = Number(toEn(String(v)).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center justify-between gap-3 w-full text-right py-2 group min-w-0">
      <span className="min-w-0">
        <span className="block text-sm font-medium truncate">{label}</span>
        {hint ? <span className="block text-[11px] text-muted leading-5">{hint}</span> : null}
      </span>
      <span className={cx('shrink-0 w-11 h-6 rounded-full relative transition-colors', checked ? 'bg-brand' : 'bg-line')}>
        <span className={cx('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', checked ? 'right-0.5' : 'right-[22px]')} />
      </span>
    </button>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2 text-sm min-w-0">
      <span className={cx('w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition', checked ? 'bg-brand border-brand text-brand-ink' : 'border-line bg-surface2')}>
        {checked ? <Icon name="check" className="w-3.5 h-3.5" stroke={3} /> : null}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export function SearchInput({ value, onChange, placeholder = 'جستجو…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Icon name="search" className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(inputCls, 'pr-9')} />
      {value ? <IconButton name="close" label="پاک کردن" className="absolute left-1 top-1" onClick={() => onChange('')} /> : null}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: string }[] }) {
  return (
    <div className="inline-flex p-1 bg-surface2 rounded-xl border border-line gap-1 overflow-x-auto max-w-full">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx('px-3 h-9 rounded-lg text-[13px] font-medium whitespace-nowrap transition inline-flex items-center gap-1.5', value === o.value ? 'bg-surface shadow-sm text-ink' : 'text-muted hover:text-ink')}
        >
          {o.icon ? <Icon name={o.icon} className="w-4 h-4" /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------- مودال ---------------------------------- */

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center no-print">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('relative w-full bg-surface border border-line rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col anim-sheet sm:anim-pop', widths[size])}>
        <header className="flex items-center justify-between gap-3 px-4 h-14 border-b border-line shrink-0">
          <h2 className="text-[15px] font-semibold truncate">{title}</h2>
          <IconButton name="close" label="بستن" onClick={onClose} />
        </header>
        <div className="p-4 overflow-y-auto flex-1">{children}</div>
        {footer ? <footer className="p-3 border-t border-line flex items-center justify-end gap-2 shrink-0 bg-surface2/50 rounded-b-2xl">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Confirm({ open, onClose, onConfirm, title, message, confirmLabel = 'تأیید', danger }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string; danger?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="outline" onClick={onClose}>انصراف</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
      </>}>
      <p className="text-sm text-muted leading-7">{message}</p>
    </Modal>
  );
}

/* ------------------------------ سایر اجزا -------------------------------- */

export function StatCard({ label, value, sub, icon, tone = 'brand', onClick }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: string; tone?: Tone; onClick?: () => void }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-surface2 text-muted',
    muted: 'bg-surface2 text-muted',
    brand: 'bg-brand-soft text-brand',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-info-soft text-info',
  };
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={cx('text-right bg-surface border border-line rounded-card p-3.5 shadow-card w-full min-w-0 transition', onClick && 'active:scale-[.98] hover:border-brand/40')}>
      <div className="flex items-start justify-between gap-2 min-w-0">
        <span className="text-xs text-muted truncate">{label}</span>
        <span className={cx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', tones[tone])}><Icon name={icon} className="w-4 h-4" /></span>
      </div>
      <div className="mt-2 text-lg font-bold nums truncate" title={String(value)}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-muted truncate">{sub}</div> : null}
    </button>
  );
}

export function Progress({ value, max, tone = 'brand' }: { value: number; max: number; tone?: Tone }) {
  const p = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const colors: Record<Tone, string> = { neutral: 'bg-muted', muted: 'bg-muted', brand: 'bg-brand', ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', info: 'bg-info' };
  return (
    <div className="w-full h-2 rounded-full bg-surface2 overflow-hidden">
      <div className={cx('h-full rounded-full transition-all', colors[tone])} style={{ width: `${p}%` }} />
    </div>
  );
}

export function EmptyState({ icon = 'layers', title, hint, action }: { icon?: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-surface2 text-muted flex items-center justify-center mb-3">
        <Icon name={icon} className="w-7 h-7" />
      </div>
      <p className="font-medium text-sm">{title}</p>
      {hint ? <p className="text-xs text-muted mt-1 max-w-sm mx-auto leading-6">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ListRow({ title, sub, right, left, onClick, tone }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; left?: React.ReactNode; onClick?: () => void; tone?: Tone }) {
  const tones: Record<Tone, string> = { neutral: 'text-muted', muted: 'text-muted', brand: 'text-brand', ok: 'text-ok', warn: 'text-warn', danger: 'text-danger', info: 'text-info' };
  return (
    <div onClick={onClick} className={cx('flex items-center gap-3 px-3 py-3 min-w-0 border-b border-line last:border-0 transition', onClick && 'cursor-pointer hover:bg-surface2/70 active:bg-surface2')}>
      {right ? <div className="shrink-0">{right}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{title}</div>
        {sub ? <div className="text-[11px] text-muted truncate mt-0.5">{sub}</div> : null}
      </div>
      {left ? <div className={cx('shrink-0 text-left', tone ? tones[tone] : '')}>{left}</div> : null}
    </div>
  );
}

export function ProductThumb({ src, name, size = 'md' }: { src?: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-10 h-10 text-base', md: 'w-12 h-12 text-lg', lg: 'w-16 h-16 text-2xl' };
  const rounded = size === 'lg' ? 'rounded-xl' : 'rounded-lg';
  if (src) return <img src={src} alt={name} loading="lazy" className={cx(sizes[size], rounded, 'object-cover bg-surface2 border border-line shrink-0')} />;
  return (
    <div className={cx(sizes[size], rounded, 'bg-surface2 border border-line flex items-center justify-center text-muted shrink-0')} aria-label={name}>
      <Icon name="box" className="w-1/2 h-1/2" />
    </div>
  );
}

/* -------------------------------- توست ---------------------------------- */

interface Toast { id: number; text: string; tone: Tone }
const ToastCtx = createContext<{ push: (text: string, tone?: Tone) => void }>({ push: () => undefined });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Tone = 'brand') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-3), { id, text, tone }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3600);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  const tones: Record<Tone, string> = {
    neutral: 'bg-surface border-line', muted: 'bg-surface2 text-ink border-line', brand: 'bg-brand text-brand-ink border-brand',
    ok: 'bg-ok text-white border-ok', warn: 'bg-warn text-white border-warn',
    danger: 'bg-danger text-white border-danger', info: 'bg-info text-white border-info',
  };
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed bottom-[86px] sm:bottom-6 inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none no-print">
        {items.map((t) => (
          <div key={t.id} className={cx('px-4 py-2.5 rounded-xl border shadow-lg text-sm font-medium max-w-md text-center anim-pop', tones[t.tone])}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
