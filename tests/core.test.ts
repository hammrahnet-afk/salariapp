import { describe, expect, it } from 'vitest';
import { addDays, addMonths, diffDays, dueLabel, formatDate, keyToJdn, lastMonths, monthRange, normalizeInputDate, parseKey, relativeDay, todayKey, weekdayName } from '../src/lib/jalali';
import { money, moneyInWords, normalizePhone, isValidPhone, toFa, toEn, toNumber, groupDigits, moneyShort } from '../src/lib/format';
import { computeTotals } from '../src/lib/sales';
import { generateSchedule, planStats } from '../src/lib/plans';
import { renderTemplate, smsParts } from '../src/lib/sms';
import { summarize } from '../src/lib/reports';
import { balanceOf } from '../src/lib/inventory';
import { mergeConfig, DEFAULT_CONFIG } from '../src/lib/settings';
import type { Sale } from '../src/lib/db';

describe('تاریخ شمسی', () => {
  it('کلید تاریخ و تجزیه معکوس', () => {
    expect(parseKey('1404-08-08')).toEqual({ jy: 1404, jm: 8, jd: 8 });
    expect(keyToJdn('1404-01-01')).toBeGreaterThan(0);
  });

  it('جمع و تفریق روز درست کار می‌کند (شامل مرز ماه)', () => {
    const start = '1404-06-31';
    expect(addDays(start, 1)).toBe('1404-07-01');
    expect(addDays('1404-07-01', -1)).toBe('1404-06-31');
    expect(diffDays('1404-06-31', '1404-07-01')).toBe(1);
  });

  it('افزودن ماه با سرریز روز', () => {
    expect(addMonths('1404-06-31', 1)).toBe('1404-07-30');
    expect(addMonths('1404-12-29', 1)).toBe('1405-01-29');
  });

  it('سال کبیسه و طول ماه', () => {
    const len = (y: number, m: number) => {
      const { start, end } = monthRange(y, m);
      return diffDays(start, end) + 1;
    };
    expect(len(1404, 1)).toBe(31);
    expect(len(1404, 7)).toBe(30);
    expect([29, 30]).toContain(len(1403, 12));
  });

  it('تاریخ معتبر با ورودی کاربر', () => {
    expect(normalizeInputDate('1404/8/8')).toBe('1404-08-08');
    expect(normalizeInputDate('۱۴۰۴-۰۸-۰۸')).toBe('1404-08-08');
    expect(normalizeInputDate('1404/13/01')).toBeNull();
    expect(normalizeInputDate('نامعتبر')).toBeNull();
  });

  it('برچسب نسبی و سررسید', () => {
    expect(relativeDay('1404-08-08', '1404-08-08')).toBe('امروز');
    expect(relativeDay('1404-08-09', '1404-08-08')).toBe('فردا');
    expect(relativeDay('1404-08-05', '1404-08-08')).toBe('۳ روز گذشته');
    expect(dueLabel('1404-08-08', '1404-08-08').tone).toBe('danger');
    expect(dueLabel('1404-08-06', '1404-08-08').text).toContain('تأخیر');
    expect(dueLabel('1404-08-10', '1404-08-08').tone).toBe('warn');
  });

  it('نام روز هفته و ماه‌های اخیر', () => {
    expect(['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']).toContain(weekdayName('1404-08-08'));
    const months = lastMonths(3, { jy: 1404, jm: 2, jd: 1, key: '1404-02-01' });
    expect(months.map((m) => m.label)).toEqual(['اسفند', 'فروردین', 'اردیبهشت']);
    expect(formatDate('1404-08-08')).toBe('۰۸ آبان ۱۴۰۴');
  });
});

describe('قالب‌بندی اعداد و پول', () => {
  it('تبدیل ارقام', () => {
    expect(toFa('1404')).toBe('۱۴۰۴');
    expect(toEn('۱۴۰۴')).toBe('1404');
    expect(toNumber('۱۲٬۵۰۰')).toBe(12500);
    expect(groupDigits(1234567)).toBe('1٬234٬567');
  });

  it('قالب مبلغ و اختصاری', () => {
    expect(money(2500000)).toBe('۲٬۵۰۰٬۰۰۰');
    expect(money(-1500)).toBe('−۱٬۵۰۰');
    expect(moneyShort(12500000)).toContain('میلیون');
    expect(moneyShort(500)).toBe('۵۰۰');
  });

  it('مبلغ به حروف', () => {
    expect(moneyInWords(0)).toBe('صفر');
    expect(moneyInWords(1250)).toBe('یک هزار و دویست و پنجاه');
    expect(moneyInWords(2500000)).toContain('میلیون');
  });

  it('نرمال‌سازی موبایل', () => {
    expect(normalizePhone('+989121234567')).toBe('09121234567');
    expect(normalizePhone('۰۹۱۲۱۲۳۴۵۶۷')).toBe('09121234567');
    expect(normalizePhone('9121234567')).toBe('09121234567');
    expect(isValidPhone('09121234567')).toBe(true);
    expect(isValidPhone('12345')).toBe(false);
  });
});

describe('محاسبات فروش', () => {
  const items = [
    { qty: 2, price: 1000, cost: 600 },
    { qty: 1, price: 3000, cost: 2000 },
  ];

  it('جمع، تخفیف، سود و باقی‌مانده', () => {
    const t = computeTotals(items, 500, 2000);
    expect(t.subtotal).toBe(5000);
    expect(t.total).toBe(4500);
    expect(t.paid).toBe(2000);
    expect(t.debt).toBe(2500);
    expect(t.profit).toBe(4500 - 3200);
  });

  it('دریافتی بیش از مبلغ کل پذیرفته نمی‌شود', () => {
    const t = computeTotals(items, 0, 99999);
    expect(t.paid).toBe(5000);
    expect(t.debt).toBe(0);
  });

  it('مالیات روی مبلغ پس از تخفیف', () => {
    const t = computeTotals(items, 0, 0, 10);
    expect(t.total).toBe(5500);
  });
});

describe('اقساط', () => {
  it('تقویم ماهانه', () => {
    expect(generateSchedule('1404-08-08', 3, 1, 'months')).toEqual(['1404-09-08', '1404-10-08', '1404-11-08']);
  });

  it('تقویم روزانه', () => {
    expect(generateSchedule('1404-08-08', 2, 15, 'days')).toEqual(['1404-08-23', '1404-09-08']);
  });

  it('آمار قرارداد', () => {
    const rows = [
      { id: 1, planId: 1, planCode: 'P', customerId: 1, idx: 1, amount: 1000, dueDate: '1404-08-01', paidAmount: 1000, status: 'paid' as const },
      { id: 2, planId: 1, planCode: 'P', customerId: 1, idx: 2, amount: 1000, dueDate: '1404-08-05', paidAmount: 0, status: 'pending' as const },
      { id: 3, planId: 1, planCode: 'P', customerId: 1, idx: 3, amount: 1000, dueDate: '1404-09-05', paidAmount: 0, status: 'pending' as const },
    ];
    const s = planStats(rows, '1404-08-10');
    expect(s.paid).toBe(1000);
    expect(s.remaining).toBe(2000);
    expect(s.openCount).toBe(2);
    expect(s.overdue).toBe(1000);
    expect(s.nextDue?.idx).toBe(2);
  });
});

describe('پیامک', () => {
  it('جایگذاری متغیرها', () => {
    const out = renderTemplate('سلام {name}، قسط {idx} به مبلغ {amount} {unit}', { name: 'رضا', idx: 2, amount: '۱٬۰۰۰', unit: 'تومان' });
    expect(out).toBe('سلام رضا، قسط 2 به مبلغ ۱٬۰۰۰ تومان');
  });

  it('متغیر ناشناخته دست‌نخورده می‌ماند', () => {
    expect(renderTemplate('{unknown}', {})).toBe('{unknown}');
  });

  it('شمارش بخش‌های پیامک', () => {
    expect(smsParts('')).toBe(0);
    expect(smsParts('کوتاه')).toBe(1);
    expect(smsParts('ا'.repeat(71))).toBe(2);
  });
});

describe('گزارش و مانده حساب', () => {
  const mk = (o: Partial<Sale>): Sale => ({
    code: 'S-1', date: '1404-08-01', customerName: 'x', subtotal: 0, discount: 0, total: 0,
    paid: 0, debt: 0, profit: 0, method: 'cash', walkIn: true, createdAt: '1404-08-01', ...o,
  });

  it('خلاصه فروش', () => {
    const s = summarize([
      mk({ total: 1000, paid: 600, debt: 400, profit: 200, subtotal: 1000, walkIn: true }),
      mk({ total: 500, paid: 500, debt: 0, profit: 100, subtotal: 500, walkIn: false, customerId: 3 }),
    ]);
    expect(s.count).toBe(2);
    expect(s.total).toBe(1500);
    expect(s.debt).toBe(400);
    expect(s.profit).toBe(300);
    expect(s.walkInTotal).toBe(1000);
    expect(s.customerTotal).toBe(500);
    expect(s.avgTicket).toBe(750);
  });

  it('مانده حساب = مانده قبلی + بدهی فروش - واریزی', () => {
    expect(balanceOf({ openingBalance: 500 }, [{ total: 1000, paid: 400 }], [{ amount: 100 }])).toBe(500 + 600 - 100);
    expect(balanceOf({ openingBalance: -200 }, [], [])).toBe(-200);
  });
});

describe('تنظیمات', () => {
  it('ادغام با مقادیر پیش‌فرض', () => {
    const cfg = mergeConfig({ shop: { name: 'فروشگاه من' }, sms: { mode: 'panel' } });
    expect(cfg.shop.name).toBe('فروشگاه من');
    expect(cfg.shop.phone).toBe(DEFAULT_CONFIG.shop.phone);
    expect(cfg.sms.mode).toBe('panel');
    expect(cfg.sms.templates.due).toContain('{name}');
    expect(cfg.background.enabled).toBe(true);
  });
});

describe('امروز', () => {
  it('کلید امروز قابل تجزیه است', () => {
    const key = todayKey();
    const p = parseKey(key);
    expect(p.jy).toBeGreaterThan(1390);
    expect(p.jm).toBeGreaterThanOrEqual(1);
    expect(p.jm).toBeLessThanOrEqual(12);
  });
});
