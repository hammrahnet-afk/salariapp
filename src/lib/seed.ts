import { db, type Category, type Product } from './db';
import { addDays, addMonths, todayKey } from './jalali';
import { createSale } from './sales';
import { addPayment, createPlan } from './plans';
import { saveCustomer } from './inventory';

const CATEGORIES: { name: string; color: string; icon: string }[] = [
  { name: 'یخچال و فریزر', color: '#0891b2', icon: '🧊' },
  { name: 'ماشین لباسشویی', color: '#2563eb', icon: '🌀' },
  { name: 'اجاق و فر', color: '#ea580c', icon: '🔥' },
  { name: 'ظروف پخت‌وپز', color: '#ca8a04', icon: '🍲' },
  { name: 'لوازم برقی آشپزخانه', color: '#7c3aed', icon: '🔌' },
  { name: 'ظروف سرو و پذیرایی', color: '#db2777', icon: '🍽️' },
  { name: 'جاروبرقی و نظافت', color: '#16a34a', icon: '🧹' },
  { name: 'صوتی و تصویری', color: '#475569', icon: '📺' },
];

/** کالاهای نمونه مخصوص لوازم خانگی و آشپزخانه */
const PRODUCTS: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'archived' | 'image'>[] = [
  { name: 'یخچال ساید بای ساید اسنوا', code: 'P-1001', brand: 'اسنوا', model: 'SS-5500', buyPrice: 42000000, sellPrice: 49500000, quantity: 4, minStock: 2, unit: 'عدد', note: 'گارانتی ۱۸ ماهه' },
  { name: 'یخچال فریزر دوقلو پارس', code: 'P-1002', brand: 'پارس', model: 'PR-2200', buyPrice: 26500000, sellPrice: 31000000, quantity: 6, minStock: 3, unit: 'عدد', note: '' },
  { name: 'فریزر صندوقی الکترواستیل', code: 'P-1003', brand: 'الکترواستیل', model: 'ES-18', buyPrice: 15800000, sellPrice: 18900000, quantity: 3, minStock: 2, unit: 'عدد', note: '' },
  { name: 'ماشین لباسشویی ۹ کیلو اسنوا', code: 'P-2001', brand: 'اسنوا', model: 'SWM-91448', buyPrice: 19800000, sellPrice: 23500000, quantity: 5, minStock: 2, unit: 'عدد', note: '' },
  { name: 'ماشین لباسشویی ۸ کیلو دوو', code: 'P-2002', brand: 'دوو', model: 'DWM-842', buyPrice: 22400000, sellPrice: 26800000, quantity: 2, minStock: 2, unit: 'عدد', note: '' },
  { name: 'ماشین ظرفشویی ۱۴ نفره بوش', code: 'P-2003', brand: 'بوش', model: 'SMS-4', buyPrice: 38500000, sellPrice: 44900000, quantity: 1, minStock: 1, unit: 'عدد', note: '' },
  { name: 'اجاق گاز ۵ شعله استیل البرز', code: 'P-3001', brand: 'استیل البرز', model: 'S-5906', buyPrice: 12600000, sellPrice: 14900000, quantity: 7, minStock: 3, unit: 'عدد', note: '' },
  { name: 'فر توکار برقی و گازی', code: 'P-3002', brand: 'لتو', model: 'L-60', buyPrice: 9800000, sellPrice: 11900000, quantity: 4, minStock: 2, unit: 'عدد', note: '' },
  { name: 'هود آشپزخانه شومینه‌ای', code: 'P-3003', brand: 'اخراجی', model: 'H-90', buyPrice: 4200000, sellPrice: 5600000, quantity: 9, minStock: 3, unit: 'عدد', note: '' },
  { name: 'سرویس قابلمه ۱۰ پارچه گرانیتی', code: 'P-4001', brand: 'زینوم', model: 'ZN-10', buyPrice: 2400000, sellPrice: 3350000, quantity: 22, minStock: 5, unit: 'سرویس', note: '' },
  { name: 'ماهیتابه گرانیتی ۲۸ سانتی', code: 'P-4002', brand: 'زینوم', model: 'ZN-28', buyPrice: 380000, sellPrice: 590000, quantity: 40, minStock: 10, unit: 'عدد', note: '' },
  { name: 'زودپز ۶ لیتری استیل', code: 'P-4003', brand: 'کرکماز', model: 'K-6L', buyPrice: 1850000, sellPrice: 2450000, quantity: 8, minStock: 3, unit: 'عدد', note: '' },
  { name: 'کتری و قوری استیل دو پارچه', code: 'P-4004', brand: 'زینوم', model: 'ZN-KT', buyPrice: 620000, sellPrice: 890000, quantity: 15, minStock: 5, unit: 'عدد', note: '' },
  { name: 'ماکروویو ۳۴ لیتری سامسونگ', code: 'P-5001', brand: 'سامسونگ', model: 'ME34', buyPrice: 8900000, sellPrice: 10900000, quantity: 3, minStock: 2, unit: 'عدد', note: '' },
  { name: 'چرخ‌گوشت برقی پارس خزر', code: 'P-5002', brand: 'پارس خزر', model: 'MG-2000', buyPrice: 2900000, sellPrice: 3750000, quantity: 6, minStock: 2, unit: 'عدد', note: '' },
  { name: 'مخلوط‌کن ۱۲۰۰ وات فیلیپس', code: 'P-5003', brand: 'فیلیپس', model: 'HR-2291', buyPrice: 2100000, sellPrice: 2850000, quantity: 11, minStock: 3, unit: 'عدد', note: '' },
  { name: 'چای‌ساز برقی ۱٫۸ لیتری', code: 'P-5004', brand: 'فلر', model: 'TS-18', buyPrice: 980000, sellPrice: 1390000, quantity: 18, minStock: 5, unit: 'عدد', note: '' },
  { name: 'سرخ‌کن بدون روغن ۵ لیتری', code: 'P-5005', brand: 'گوسونیک', model: 'AF-500', buyPrice: 3200000, sellPrice: 4250000, quantity: 5, minStock: 2, unit: 'عدد', note: '' },
  { name: 'سرویس غذاخوری ۲۴ پارچه چینی', code: 'P-6001', brand: 'زرین', model: 'ZR-24', buyPrice: 1450000, sellPrice: 1990000, quantity: 12, minStock: 4, unit: 'سرویس', note: '' },
  { name: 'سرویس قاشق و چنگال ۲۴ پارچه', code: 'P-6002', brand: 'یونیک', model: 'UN-24', buyPrice: 1150000, sellPrice: 1650000, quantity: 14, minStock: 4, unit: 'سرویس', note: '' },
  { name: 'جاروبرقی ۲۲۰۰ وات بوش', code: 'P-7001', brand: 'بوش', model: 'BGS-22', buyPrice: 6800000, sellPrice: 8400000, quantity: 4, minStock: 2, unit: 'عدد', note: '' },
  { name: 'جارو شارژی ایستاده', code: 'P-7002', brand: 'شیائومی', model: 'G10', buyPrice: 5200000, sellPrice: 6700000, quantity: 3, minStock: 2, unit: 'عدد', note: '' },
  { name: 'تلویزیون ۵۵ اینچ ایکس‌ویژن', code: 'P-8001', brand: 'ایکس‌ویژن', model: '55XK550', buyPrice: 17500000, sellPrice: 20900000, quantity: 3, minStock: 1, unit: 'عدد', note: '' },
  { name: 'ساندبار خانگی ۱۲۰ وات', code: 'P-8002', brand: 'جی‌بی‌ال', model: 'SB-120', buyPrice: 3400000, sellPrice: 4450000, quantity: 6, minStock: 2, unit: 'عدد', note: '' },
];

/** پر کردن دیتابیس با داده نمونه (فقط اگر خالی باشد) */
export async function seedIfEmpty(): Promise<boolean> {
  const count = await db.products.count();
  if (count > 0) return false;
  const today = todayKey();

  const catIds = new Map<string, number>();
  for (const c of CATEGORIES) {
    const id = (await db.categories.add({ ...c, sortOrder: CATEGORIES.indexOf(c) + 1, createdAt: today })) as number;
    catIds.set(c.name, id);
  }

  const mapCategory = (name: string, code: string) => {
    const prefix = code.split('-')[1]?.[0];
    const idx = Number(prefix) - 1;
    return catIds.get(CATEGORIES[idx]?.name);
  };

  await db.products.bulkAdd(
    PRODUCTS.map((p) => ({
      ...p,
      categoryId: mapCategory(p.name, p.code),
      archived: 0,
      createdAt: today,
      updatedAt: today,
    })),
  );

  await seedDemoTransactions();
  return true;
}

/** مشتریان، فاکتورها و اقساط نمونه تا داشبورد و گزارش‌ها از ابتدا معنادار باشند */
async function seedDemoTransactions(): Promise<void> {
  const today = todayKey();
  const products = await db.products.toArray();
  const byName = (n: string) => products.find((p) => p.name.includes(n));

  const c1 = await saveCustomer({ name: 'علی محمدی', phone: '09121234567', address: 'خیابان امام، پلاک ۱۲', openingBalance: 2400000, openingDate: addDays(today, -75), note: 'مشتری قدیمی' });
  const c2 = await saveCustomer({ name: 'زهرا رضایی', phone: '09123456789', address: 'بلوار شهید بهشتی', openingBalance: 0 });
  const c3 = await saveCustomer({ name: 'حسین کریمی', phone: '09351234567', openingBalance: -600000, note: 'پیش‌پرداخت دارد' });

  const fridge = byName('یخچال ساید');
  const washer = byName('لباسشویی ۹ کیلو');
  const pot = byName('قابلمه');
  const hood = byName('هود');
  const pan = byName('ماهیتابه');

  // فروش‌های روزمره (مشتری گذرا)
  if (pan) {
    await createSale({ date: addDays(today, -3), customerName: 'مشتری روزگذر', walkIn: true, items: [{ productId: pan.id, name: pan.name, qty: 2, price: pan.sellPrice, cost: pan.buyPrice }], paid: pan.sellPrice * 2, method: 'card' });
  }
  if (pot) {
    await createSale({ date: addDays(today, -1), customerName: 'خانم احمدی', walkIn: true, items: [{ productId: pot.id, name: pot.name, qty: 1, price: pot.sellPrice, cost: pot.buyPrice }], paid: pot.sellPrice, method: 'cash' });
  }
  if (hood) {
    await createSale({ date: today, customerName: 'آقای نوری', walkIn: true, items: [{ productId: hood.id, name: hood.name, qty: 1, price: hood.sellPrice, cost: hood.buyPrice }], paid: hood.sellPrice, method: 'card' });
  }

  // فروش نسیه به مشتری دارای پرونده + قسط‌بندی
  if (fridge) {
    const saleId = await createSale({
      date: addDays(today, -35), customerId: c1, customerName: 'علی محمدی', phone: '09121234567', walkIn: false,
      items: [{ productId: fridge.id, name: fridge.name, qty: 1, price: fridge.sellPrice, cost: fridge.buyPrice }],
      paid: 15000000, method: 'cheque', discount: 500000,
    });
    const sale = await db.sales.get(saleId);
    if (sale) {
      // قرارداد ۱۲ ماهه؛ اولین قسط امروز سررسید است
      const planId = await createPlan({
        customerId: c1, saleId, title: 'اقساط یخچال ساید', totalAmount: sale.debt,
        count: 6, startDate: addDays(today, -30), interval: 1, mode: 'months',
      });
      await db.installments.where('planId').equals(planId).modify((i: any) => {
        i.dueDate = i.idx === 1 ? today : addMonths(today, i.idx - 1);
      });
      await db.installments.where('planId').equals(planId).and((i) => i.idx === 1).modify({ amount: Math.round(sale.debt / 6) });
      await addPayment({ customerId: c1, amount: 3000000, date: addDays(today, -10), method: 'card', note: 'علی‌الحساب' });
    }
  }

  if (washer) {
    const saleId = await createSale({
      date: addDays(today, -60), customerId: c2, customerName: 'زهرا رضایی', phone: '09123456789', walkIn: false,
      items: [{ productId: washer.id, name: washer.name, qty: 1, price: washer.sellPrice, cost: washer.buyPrice }],
      paid: 5000000, method: 'cash',
    });
    const sale = await db.sales.get(saleId);
    if (sale) {
      const planId = await createPlan({
        customerId: c2, saleId, title: 'اقساط ماشین لباسشویی', totalAmount: sale.debt,
        count: 4, startDate: addDays(today, -55), interval: 1, mode: 'months',
      });
      // دو قسط اول پرداخت‌شده، قسط دوم عقب‌افتاده (معوق)
      await db.installments.where('planId').equals(planId).modify((i: any) => {
        i.dueDate = addDays(today, -55 + (i.idx - 1) * 30);
      });
      const rows = await db.installments.where('planId').equals(planId).sortBy('idx');
      await db.installments.update(rows[0].id!, { paidAmount: rows[0].amount, status: 'paid', paidDate: addDays(today, -55) });
      await db.payments.add({ customerId: c2, amount: rows[0].amount, date: addDays(today, -55), method: 'cash', installmentId: rows[0].id!, planId, note: 'قسط اول', smsSentAt: null, createdAt: addDays(today, -55) });
    }
  }

  // مانده قبلی مشتری سوم + یک واریزی
  await addPayment({ customerId: c3, amount: 600000, date: addDays(today, -5), method: 'transfer', note: 'تسویه بستانکاری' });
}

/** پاک کردن کامل داده‌های نمونه و واقعی */
export async function wipeAll(): Promise<void> {
  const tables = ['categories', 'products', 'customers', 'sales', 'saleItems', 'plans', 'installments', 'payments', 'stockMoves', 'smsLogs', 'notifications'];
  await db.transaction('rw', tables.map((t) => (db as any)[t]), async () => {
    for (const t of tables) await (db as any)[t].clear();
  });
}
