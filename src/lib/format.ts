/** ابزارهای قالب‌بندی عدد، مبلغ و متن فارسی */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** تبدیل ارقام لاتین/عربی به فارسی */
export function toFa(v: string | number): string {
  return String(v).replace(/[0-9]/g, (d) => FA_DIGITS[+d]).replace(/[٠-٩]/g, (d) => FA_DIGITS['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
}

/** تبدیل ارقام فارسی/عربی به لاتین (برای ورودی کاربر) */
export function toEn(v: string): string {
  return String(v).replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** حذف جداکننده و تبدیل به عدد */
export function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(toEn(String(v)).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** جداکننده هزارگان */
export function groupDigits(n: number | string): string {
  const s = String(n);
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [int, dec] = body.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return (neg ? '-' : '') + grouped + (dec ? '.' + dec : '');
}

/** قالب مبلغ کامل: «۱۲٬۵۰۰٬۰۰۰» */
export function money(n: number | null | undefined, opts: { sign?: boolean } = {}): string {
  const v = Math.round(Number(n) || 0);
  const s = groupDigits(Math.abs(v));
  const signed = v < 0 ? '−' : opts.sign && v > 0 ? '+' : '';
  return toFa(signed + s);
}

/** قالب مبلغ کوتاه برای کارت‌ها و نمودار: «۱۲٫۵ م» */
export function moneyShort(n: number | null | undefined): string {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const neg = v < 0 ? '−' : '';
  if (abs >= 1e9) return toFa(neg + trim(abs / 1e9) + ' میلیارد');
  if (abs >= 1e6) return toFa(neg + trim(abs / 1e6) + ' میلیون');
  if (abs >= 1e3) return toFa(neg + trim(abs / 1e3) + ' هزار');
  return toFa(neg + String(Math.round(abs)));
}

function trim(x: number): string {
  const r = Math.round(x * 10) / 10;
  return String(r).replace('.', '٫');
}

/** مبلغ به حروف (برای فاکتور و چک) */
const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه', 'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پنجصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

export function moneyInWords(n: number): string {
  const v = Math.abs(Math.round(Number(n) || 0));
  if (v === 0) return 'صفر';
  const parts: string[] = [];
  let rest = v;
  let scale = 0;
  while (rest > 0) {
    const chunk = rest % 1000;
    if (chunk) {
      const words: string[] = [];
      const h = Math.floor(chunk / 100);
      const r = chunk % 100;
      if (h) words.push(HUNDREDS[h]);
      if (r < 20 && r > 0) words.push(ONES[r]);
      else if (r >= 20) {
        words.push(TENS[Math.floor(r / 10)]);
        if (r % 10) words.push(ONES[r % 10]);
      }
      parts.unshift(words.join(' و ') + (scale ? ' ' + SCALES[scale] : ''));
    }
    rest = Math.floor(rest / 1000);
    scale++;
  }
  return parts.join(' و ');
}

/** درصد */
export function percent(a: number, b: number): string {
  if (!b) return toFa('۰') + '٪';
  return toFa(trim(Math.round((a / b) * 1000) / 10)) + '٪';
}

/** نرمال‌سازی شماره موبایل ایران به ۱۱ رقم */
export function normalizePhone(v: string): string {
  let p = toEn(String(v || '')).replace(/[^\d+]/g, '');
  if (p.startsWith('+98')) p = '0' + p.slice(3);
  if (p.startsWith('98') && p.length === 12) p = '0' + p.slice(2);
  if (p.startsWith('9') && p.length === 10) p = '0' + p;
  return p;
}

export function isValidPhone(v: string): boolean {
  return /^09\d{9}$/.test(normalizePhone(v));
}

/** خلاصه‌سازی متن با سه‌نقطه (برای جلوگیری از شکستن طرح) */
export function truncate(v: string, n = 40): string {
  const s = String(v ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** ساخت کد یکتا برای فاکتور/قرارداد */
export function makeCode(prefix: string, n: number): string {
  return `${prefix}-${toFa(String(n).padStart(4, '0'))}`;
}
