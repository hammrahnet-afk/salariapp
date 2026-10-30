/**
 * لایه تاریخ شمسی (جلالی)
 * همه تاریخ‌ها در دیتابیس به شکل رشته‌ی «1404-08-08» ذخیره می‌شوند تا
 * هم مرتب‌سازی زمانی درست باشد و هم ایندکس‌گذاری ساده.
 */
import jalaali from 'jalaali-js';
import { toFa } from './format';

export type DateKey = string; // 'JYYYY-JMM-JDD'

export const J_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

export const J_WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** کلید تاریخ از اجزای شمسی */
export function jKey(jy: number, jm: number, jd: number): DateKey {
  return `${pad(jy, 4)}-${pad(jm)}-${pad(jd)}`;
}

/** تجزیه کلید تاریخ */
export function parseKey(key: DateKey): { jy: number; jm: number; jd: number } {
  const [a, b, c] = String(key).split('-').map((x) => parseInt(x, 10));
  return { jy: a, jm: b, jd: c };
}

/** امروز بر اساس ساعت دستگاه */
export function today(): { jy: number; jm: number; jd: number; key: DateKey } {
  const now = new Date();
  const j = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return { ...j, key: jKey(j.jy, j.jm, j.jd) };
}

/** کلید امروز */
export function todayKey(): DateKey {
  return today().key;
}

/** تبدیل تاریخ میلادی به کلید شمسی */
export function dateToKey(d: Date): DateKey {
  const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return jKey(j.jy, j.jm, j.jd);
}

/** تبدیل کلید شمسی به شیء Date (میلادی، ساعت ۱۲ ظهر برای امنیت منطقه زمانی) */
export function keyToDate(key: DateKey): Date {
  const { jy, jm, jd } = parseKey(key);
  const g = jalaali.toGregorian(jy, jm, jd);
  return new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0, 0);
}

/** شماره روز جولیان برای محاسبه دقیق اختلاف روز */
export function keyToJdn(key: DateKey): number {
  const { jy, jm, jd } = parseKey(key);
  return jalaali.j2d(jy, jm, jd);
}

/** افزودن/کم کردن روز */
export function addDays(key: DateKey, days: number): DateKey {
  const j = jalaali.d2j(keyToJdn(key) + days);
  return jKey(j.jy, j.jm, j.jd);
}

/** افزودن ماه (با سرریز روز به انتهای ماه مقصد) */
export function addMonths(key: DateKey, months: number): DateKey {
  const { jy, jm, jd } = parseKey(key);
  const total = jy * 12 + (jm - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const len = jalaali.jalaaliMonthLength(ny, nm);
  return jKey(ny, nm, Math.min(jd, len));
}

/** اختلاف روز بین دو تاریخ (b - a) */
export function diffDays(a: DateKey, b: DateKey): number {
  return keyToJdn(b) - keyToJdn(a);
}

/** نام ماه شمسی */
export function monthName(m: number): string {
  return J_MONTHS[m - 1] ?? '';
}

/** نام روز هفته */
export function weekdayName(key: DateKey): string {
  const d = keyToDate(key).getDay();
  // در JS: یکشنبه=۰ ... شنبه=۶
  return J_WEEKDAYS[(d + 1) % 7];
}

/** قالب خوانا: «۰۸ آبان ۱۴۰۴» */
export function formatDate(key: DateKey | undefined | null, withWeekday = false): string {
  if (!key) return '—';
  const { jy, jm, jd } = parseKey(key);
  const base = `${toFa(pad(jd))} ${monthName(jm)} ${toFa(jy)}`;
  return withWeekday ? `${weekdayName(key)} ${base}` : base;
}

/** قالب کوتاه: «1404/08/08» */
export function formatShort(key: DateKey | undefined | null): string {
  if (!key) return '—';
  const { jy, jm, jd } = parseKey(key);
  return toFa(`${jy}/${pad(jm)}/${pad(jd)}`);
}

/** «امروز»، «دیروز»، «فردا»، «۳ روز دیگر»، «۱۲ روز گذشته» */
export function relativeDay(key: DateKey, base: DateKey = todayKey()): string {
  const d = diffDays(base, key);
  if (d === 0) return 'امروز';
  if (d === 1) return 'فردا';
  if (d === -1) return 'دیروز';
  if (d > 1) return `${toFa(d)} روز دیگر`;
  return `${toFa(Math.abs(d))} روز گذشته`;
}

/** برچسب وضعیت سررسید */
export function dueLabel(key: DateKey, base: DateKey = todayKey()): { text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' } {
  const d = diffDays(base, key);
  if (d === 0) return { text: 'سررسید امروز', tone: 'danger' };
  if (d < 0) return { text: `${toFa(Math.abs(d))} روز تأخیر`, tone: 'danger' };
  if (d <= 3) return { text: `${toFa(d)} روز دیگر`, tone: 'warn' };
  return { text: formatDate(key), tone: 'muted' };
}

/** بازه کلیدهای یک ماه شمسی */
export function monthRange(jy: number, jm: number): { start: DateKey; end: DateKey } {
  const len = jalaali.jalaaliMonthLength(jy, jm);
  return { start: jKey(jy, jm, 1), end: jKey(jy, jm, len) };
}

/** n ماه آخر (شامل ماه جاری) به ترتیب صعودی */
export function lastMonths(n: number, from = today()): { jy: number; jm: number; label: string }[] {
  const out: { jy: number; jm: number; label: string }[] = [];
  let total = from.jy * 12 + (from.jm - 1);
  for (let i = n - 1; i >= 0; i--) {
    const t = total - i;
    const jy = Math.floor(t / 12);
    const jm = (t % 12) + 1;
    out.push({ jy, jm, label: monthName(jm) });
  }
  return out;
}

/** n روز اخیر (صعودی) */
export function lastDays(n: number, from = todayKey()): DateKey[] {
  const out: DateKey[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(from, -i));
  return out;
}

/** اعتبارسنج ورودی کاربر: «1404/08/08» یا «1404-8-8» */
export function normalizeInputDate(v: string): DateKey | null {
  const m = String(v).trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .split(/[\/\-.،\s]+/).filter(Boolean).map(Number);
  if (m.length !== 3 || m.some((x) => Number.isNaN(x))) return null;
  let [jy, jm, jd] = m;
  if (jy < 100) jy += 1300;
  if (!jalaali.isValidJalaaliDate(jy, jm, jd)) {
    const len = jalaali.jalaaliMonthLength(jy, jm);
    if (jm < 1 || jm > 12 || jd < 1 || jd > len) return null;
  }
  return jKey(jy, jm, jd);
}
