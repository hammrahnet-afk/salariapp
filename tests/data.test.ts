import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { saveCategory, saveCustomer, saveProduct, deleteProduct } from '../src/lib/inventory';
import { createSale, deleteSale, getFullSale } from '../src/lib/sales';
import { addPayment, createPlan, deletePlan } from '../src/lib/plans';
import { buildBackup, restoreBackup } from '../src/lib/backup';
import { runAutoSend } from '../src/lib/engine';
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../src/lib/settings';
import { todayKey, addDays } from '../src/lib/jalali';

const TABLES = ['categories', 'products', 'customers', 'sales', 'saleItems', 'plans', 'installments', 'payments', 'stockMoves', 'smsLogs', 'notifications', 'backups'];

async function reset() {
  await db.open();
  await db.transaction('rw', [...TABLES.map((t) => (db as any)[t]), db.settings], async () => {
    for (const t of TABLES) await (db as any)[t].clear();
    await db.settings.clear();
  });
}

beforeEach(reset);

async function seedProduct(qty = 10, price = 1000, cost = 600) {
  const catId = await saveCategory({ name: 'یخچال', color: '#0891b2', icon: '🧊' });
  const id = await saveProduct({ name: 'یخچال اسنوا', categoryId: catId, brand: 'اسنوا', buyPrice: cost, sellPrice: price, quantity: qty, minStock: 2 });
  return { id, catId };
}

describe('کالا و انبار', () => {
  it('ثبت کالا موجودی ابتدایی و سند انبار می‌سازد', async () => {
    const { id } = await seedProduct(10);
    const p = await db.products.get(id);
    expect(p?.quantity).toBe(10);
    expect(p?.archived).toBe(0);
    expect(p?.code).toMatch(/^P-/);
    const moves = await db.stockMoves.where('productId').equals(id).toArray();
    expect(moves.length).toBe(1);
    expect(moves[0].type).toBe('in');
  });

  it('ویرایش موجودی سند اصلاح ثبت می‌کند', async () => {
    const { id } = await seedProduct(10);
    const p = await db.products.get(id);
    await saveProduct({ ...p, quantity: 7 });
    const moves = await db.stockMoves.where('productId').equals(id).toArray();
    expect(moves.some((m) => m.type === 'adjust' && m.qty === -3)).toBe(true);
  });

  it('کالا بدون نام پذیرفته نمی‌شود', async () => {
    await expect(saveProduct({ name: '  ' })).rejects.toThrow();
  });

  it('حذف کالا سوابق انبار را پاک می‌کند', async () => {
    const { id } = await seedProduct();
    await deleteProduct(id);
    expect(await db.products.get(id)).toBeUndefined();
    expect(await db.stockMoves.where('productId').equals(id).count()).toBe(0);
  });
});

describe('فروش', () => {
  it('فروش نقدی روزانه موجودی را کم می‌کند', async () => {
    const { id } = await seedProduct(10, 1000, 600);
    const saleId = await createSale({
      date: todayKey(), customerId: null, customerName: 'مشتری روزگذر', walkIn: true,
      items: [{ productId: id, name: 'یخچال اسنوا', qty: 3, price: 1000, cost: 600 }], paid: 3000, method: 'cash',
    });
    const sale = await db.sales.get(saleId);
    expect(sale?.total).toBe(3000);
    expect(sale?.debt).toBe(0);
    expect(sale?.walkIn).toBe(true);
    expect((await db.products.get(id))?.quantity).toBe(7);
    const full = await getFullSale(saleId);
    expect(full?.items.length).toBe(1);
    expect(sale?.code).toMatch(/^S-/);
  });

  it('فروش بیش از موجودی رد می‌شود', async () => {
    const { id } = await seedProduct(2);
    await expect(createSale({
      date: todayKey(), customerName: 'x', items: [{ productId: id, name: 'یخچال', qty: 5, price: 1000, cost: 600 }],
    })).rejects.toThrow(/موجودی/);
    expect((await db.products.get(id))?.quantity).toBe(2);
  });

  it('فروش نسیه باقی‌مانده ثبت می‌کند', async () => {
    const { id } = await seedProduct(10);
    const cid = await saveCustomer({ name: 'علی', phone: '09121234567', openingBalance: 0 });
    const saleId = await createSale({
      date: todayKey(), customerId: cid, customerName: 'علی', walkIn: false, paid: 400,
      items: [{ productId: id, name: 'یخچال', qty: 1, price: 1000, cost: 600 }],
    });
    const sale = await db.sales.get(saleId);
    expect(sale?.debt).toBe(600);
    expect(sale?.profit).toBe(400);
  });

  it('حذف فاکتور موجودی را برمی‌گرداند', async () => {
    const { id } = await seedProduct(10);
    const saleId = await createSale({ date: todayKey(), customerName: 'x', items: [{ productId: id, name: 'یخچال', qty: 4, price: 1000, cost: 600 }], paid: 4000 });
    await deleteSale(saleId);
    expect((await db.products.get(id))?.quantity).toBe(10);
    expect(await db.saleItems.where('saleId').equals(saleId).count()).toBe(0);
    expect(await db.stockMoves.where('productId').equals(id).and((m) => m.type === 'sale').count()).toBe(0);
  });
});

describe('اقساط', () => {
  it('جمع اقساط دقیقاً برابر مبلغ قابل تقسیط است', async () => {
    const cid = await saveCustomer({ name: 'رضا' });
    const planId = await createPlan({ customerId: cid, totalAmount: 10000, downPayment: 1000, count: 3, startDate: todayKey(), interval: 1, mode: 'months' });
    const rows = await db.installments.where('planId').equals(planId).toArray();
    expect(rows.length).toBe(3);
    expect(rows.reduce((a, r) => a + r.amount, 0)).toBe(9000);
    expect(rows[2].amount).toBe(9000 - 3000 * 2);
    expect(rows[0].dueDate > todayKey()).toBe(true);
  });

  it('واریزی به قسط تخصیص می‌یابد و قسط تسویه می‌شود', async () => {
    const cid = await saveCustomer({ name: 'رضا' });
    const planId = await createPlan({ customerId: cid, totalAmount: 3000, count: 3, startDate: todayKey(), interval: 1, mode: 'months' });
    await addPayment({ customerId: cid, amount: 1000, date: todayKey() });
    const rows = await db.installments.where('planId').equals(planId).sortBy('idx');
    expect(rows[0].status).toBe('paid');
    expect(rows[1].status).toBe('pending');
    const plan = await db.plans.get(planId);
    expect(plan?.status).toBe('active');

    await addPayment({ customerId: cid, amount: 2000, date: todayKey() });
    const after = await db.installments.where('planId').equals(planId).toArray();
    expect(after.every((r) => r.status === 'paid')).toBe(true);
    expect((await db.plans.get(planId))?.status).toBe('done');
  });

  it('پرداخت جزئی قسط را باز نگه می‌دارد', async () => {
    const cid = await saveCustomer({ name: 'سارا' });
    const planId = await createPlan({ customerId: cid, totalAmount: 1000, count: 1, startDate: todayKey(), interval: 1, mode: 'months' });
    await addPayment({ customerId: cid, amount: 400, date: todayKey() });
    const row = (await db.installments.where('planId').equals(planId).toArray())[0];
    expect(row.paidAmount).toBe(400);
    expect(row.status).toBe('pending');
  });

  it('حذف قرارداد اقساط آن را پاک می‌کند', async () => {
    const cid = await saveCustomer({ name: 'مریم' });
    const planId = await createPlan({ customerId: cid, totalAmount: 2000, count: 2, startDate: todayKey(), interval: 1, mode: 'months' });
    await deletePlan(planId);
    expect(await db.installments.where('planId').equals(planId).count()).toBe(0);
    expect(await db.plans.get(planId)).toBeUndefined();
  });
});

describe('موتور یادآوری و پیامک', () => {
  it('برای قسط سررسید امروز یک پیامک در صف می‌گذارد و تکرار نمی‌کند', async () => {
    const cid = await saveCustomer({ name: 'حسین', phone: '09121234567' });
    const planId = await createPlan({ customerId: cid, totalAmount: 1000, count: 1, startDate: addDays(todayKey(), -31), interval: 1, mode: 'months' });
    // سررسید را به امروز منتقل کن
    await db.installments.where('planId').equals(planId).modify({ dueDate: todayKey() });

    const res1 = await runAutoSend('test');
    expect(res1.scanned).toBe(1);
    expect(res1.queued).toBe(1);

    const logs = await db.smsLogs.toArray();
    expect(logs.length).toBe(1);
    expect(logs[0].status).toBe('queued');
    expect(logs[0].phone).toBe('09121234567');
    expect(logs[0].message).toContain('حسین');

    const res2 = await runAutoSend('test-again');
    expect(res2.scanned).toBe(0);
    expect(await db.smsLogs.count()).toBe(1);
  });

  it('مشتری بدون شماره موبایل پیامک نمی‌گیرد ولی اعلان می‌شود', async () => {
    const cid = await saveCustomer({ name: 'بدون شماره', phone: '' });
    const planId = await createPlan({ customerId: cid, totalAmount: 500, count: 1, startDate: todayKey(), interval: 1, mode: 'months' });
    await db.installments.where('planId').equals(planId).modify({ dueDate: todayKey() });
    const res = await runAutoSend('test');
    expect(res.sent + res.queued).toBe(0);
    expect(res.skippedNoPhone).toBe(1);
    expect(await db.smsLogs.count()).toBe(0);
    expect((await db.notifications.toArray()).some((n) => n.title.includes('نامعتبر'))).toBe(true);
  });

  it('هشدار موجودی کم فقط یک‌بار در روز ساخته می‌شود', async () => {
    await saveProduct({ name: 'کالای کم', quantity: 0, minStock: 3, sellPrice: 1000, buyPrice: 500 });
    const r1 = await runAutoSend('t1');
    expect(r1.lowStock).toBe(1);
    const r2 = await runAutoSend('t2');
    expect(r2.lowStock).toBe(0);
  });

  it('حالت پنلی با API ناموفق، خطا را ثبت می‌کند', async () => {
    await saveConfig({
      ...DEFAULT_CONFIG,
      sms: { ...DEFAULT_CONFIG.sms, mode: 'panel', autoSend: true, apiKey: 'TESTKEY' },
    });
    const cid = await saveCustomer({ name: 'کیان', phone: '09121112233' });
    const planId = await createPlan({ customerId: cid, totalAmount: 1000, count: 1, startDate: todayKey(), interval: 1, mode: 'months' });
    await db.installments.where('planId').equals(planId).modify({ dueDate: todayKey() });

    const res = await runAutoSend('panel-test');
    expect(res.failed + res.sent).toBe(1);
    const log = (await db.smsLogs.toArray())[0];
    expect(log.provider).toBe('kavenegar');
    expect(['sent', 'failed']).toContain(log.status);
  });
});

describe('پشتیبان‌گیری', () => {
  it('ساخت و بازیابی نسخه پشتیبان', async () => {
    const { id } = await seedProduct(5);
    await saveCustomer({ name: 'زهرا', phone: '09120000000', openingBalance: 1200 });
    const payload = await buildBackup('manual');
    expect(payload.meta.counts.products).toBe(1);
    expect(payload.data.customers.length).toBe(1);

    await db.products.clear();
    expect(await db.products.count()).toBe(0);

    await restoreBackup(payload, 'replace');
    expect(await db.products.count()).toBe(1);
    expect((await db.products.toArray())[0].id).toBe(id);
    expect((await db.customers.toArray())[0].openingBalance).toBe(1200);
  });
});

describe('تنظیمات', () => {
  it('ذخیره و بازخوانی پیکربندی', async () => {
    await saveConfig({ ...DEFAULT_CONFIG, shop: { ...DEFAULT_CONFIG.shop, name: 'فروشگاه تست' }, sms: { ...DEFAULT_CONFIG.sms, autoSend: true } });
    const cfg = await loadConfig();
    expect(cfg.shop.name).toBe('فروشگاه تست');
    expect(cfg.sms.autoSend).toBe(true);
    expect(cfg.sms.templates.overdue).toContain('{due}');
  });
});
