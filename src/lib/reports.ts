import { db, type Customer, type Installment, type Product, type Sale } from './db';
import { addDays, lastDays, lastMonths, monthRange, parseKey, todayKey, type DateKey } from './jalali';
import { balanceOf } from './inventory';

export interface Summary {
  count: number;
  subtotal: number;
  total: number;
  paid: number;
  debt: number;
  profit: number;
  discount: number;
  walkInTotal: number;
  customerTotal: number;
  avgTicket: number;
}

const empty: Summary = {
  count: 0, subtotal: 0, total: 0, paid: 0, debt: 0, profit: 0, discount: 0,
  walkInTotal: 0, customerTotal: 0, avgTicket: 0,
};

export async function salesInRange(from: DateKey, to: DateKey): Promise<Sale[]> {
  return db.sales.where('date').between(from, to, true, true).toArray();
}

export function summarize(sales: Sale[]): Summary {
  const s = sales.reduce<Summary>((a, x) => {
    a.count += 1;
    a.subtotal += x.subtotal;
    a.total += x.total;
    a.paid += x.paid;
    a.debt += x.debt;
    a.profit += x.profit;
    a.discount += x.discount;
    if (x.walkIn) a.walkInTotal += x.total;
    else a.customerTotal += x.total;
    return a;
  }, { ...empty });
  s.avgTicket = s.count ? Math.round(s.total / s.count) : 0;
  return s;
}

export async function summaryOf(from: DateKey, to: DateKey): Promise<Summary> {
  return summarize(await salesInRange(from, to));
}

/** فروش روزانه برای نمودار */
export async function salesByDay(from: DateKey, to: DateKey): Promise<{ date: DateKey; total: number; profit: number; count: number }[]> {
  const sales = await salesInRange(from, to);
  const map = new Map<string, { total: number; profit: number; count: number }>();
  let d = from;
  while (d <= to) {
    map.set(d, { total: 0, profit: 0, count: 0 });
    d = addDays(d, 1);
  }
  for (const s of sales) {
    const e = map.get(s.date);
    if (e) {
      e.total += s.total;
      e.profit += s.profit;
      e.count += 1;
    }
  }
  return [...map.entries()].map(([date, v]) => ({ date, ...v }));
}

/** فروش ماهانه (n ماه آخر) */
export async function salesByMonth(n = 6): Promise<{ label: string; total: number; profit: number; count: number }[]> {
  const sales = await db.sales.toArray();
  const months = lastMonths(n);
  return months.map((m) => {
    const { start, end } = monthRange(m.jy, m.jm);
    const inMonth = sales.filter((s) => s.date >= start && s.date <= end);
    return {
      label: m.label,
      total: inMonth.reduce((a, s) => a + s.total, 0),
      profit: inMonth.reduce((a, s) => a + s.profit, 0),
      count: inMonth.length,
    };
  });
}

export interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
  profit: number;
}

export async function topProducts(from: DateKey, to: DateKey, limit = 8): Promise<TopProduct[]> {
  const sales = await salesInRange(from, to);
  const ids = sales.map((s) => s.id!);
  if (!ids.length) return [];
  const items = await db.saleItems.where('saleId').anyOf(ids).toArray();
  const map = new Map<string, TopProduct>();
  for (const it of items) {
    const cur = map.get(it.name) || { name: it.name, qty: 0, revenue: 0, profit: 0 };
    cur.qty += it.qty;
    cur.revenue += it.qty * it.price;
    cur.profit += it.qty * (it.price - it.cost);
    map.set(it.name, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export interface CategoryStat {
  name: string;
  color: string;
  revenue: number;
  qty: number;
}

export async function salesByCategory(from: DateKey, to: DateKey): Promise<CategoryStat[]> {
  const sales = await salesInRange(from, to);
  const ids = sales.map((s) => s.id!);
  const cats = await db.categories.toArray();
  const products = await db.products.toArray();
  const prodCat = new Map(products.map((p) => [p.id!, p.categoryId]));
  const items = ids.length ? await db.saleItems.where('saleId').anyOf(ids).toArray() : [];
  const map = new Map<number | undefined, CategoryStat>();
  for (const it of items) {
    const cid = it.productId ? prodCat.get(it.productId) : undefined;
    const cat = cats.find((c) => c.id === cid);
    const key = cat?.id;
    const cur = map.get(key) || { name: cat?.name || 'بدون دسته', color: cat?.color || '#64748b', revenue: 0, qty: 0 };
    cur.revenue += it.qty * it.price;
    cur.qty += it.qty;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

/* ----------------------------- گزارش مشتریان ----------------------------- */

export interface CustomerDebt {
  customer: Customer;
  balance: number;
  salesCount: number;
  lastSale?: DateKey;
  openInstallments: number;
  overdue: number;
  nextDue?: DateKey;
}

export async function customerDebtReport(base = todayKey()): Promise<CustomerDebt[]> {
  const [customers, sales, payments, installments] = await Promise.all([
    db.customers.where('archived').equals(0).toArray(),
    db.sales.toArray(),
    db.payments.toArray(),
    db.installments.toArray(),
  ]);
  return customers
    .map((c) => {
      const mySales = sales.filter((s) => s.customerId === c.id);
      const myPay = payments.filter((p) => p.customerId === c.id);
      const myIns = installments.filter((i) => i.customerId === c.id && i.status === 'pending');
      const open = myIns.filter((i) => i.paidAmount < i.amount);
      return {
        customer: c,
        balance: balanceOf(c, mySales, myPay),
        salesCount: mySales.length,
        lastSale: mySales.map((s) => s.date).sort().pop(),
        openInstallments: open.length,
        overdue: open.filter((i) => i.dueDate < base).reduce((a, i) => a + (i.amount - i.paidAmount), 0),
        nextDue: open.map((i) => i.dueDate).sort()[0],
      };
    })
    .sort((a, b) => b.balance - a.balance);
}

/* ------------------------------- گزارش اقساط ------------------------------ */

export interface InstallmentBucket {
  today: Installment[];
  overdue: Installment[];
  upcoming: Installment[];
  todayAmount: number;
  overdueAmount: number;
  upcomingAmount: number;
  weekAmount: number;
  monthAmount: number;
}

const remaining = (i: Installment) => Math.max(0, i.amount - i.paidAmount);

export async function installmentReport(base = todayKey(), aheadDays = 7): Promise<InstallmentBucket> {
  const open = await db.installments.where('status').equals('pending').toArray();
  const live = open.filter((i) => i.paidAmount < i.amount);
  const inRange = (i: Installment, from: DateKey, to: DateKey) => i.dueDate >= from && i.dueDate <= to;

  const today = live.filter((i) => i.dueDate === base);
  const overdue = live.filter((i) => i.dueDate < base);
  const upcoming = live.filter((i) => i.dueDate > base && i.dueDate <= addDays(base, aheadDays));

  const monthStart = base.slice(0, 8) + '01';
  const { jy, jm } = parseKey(base);
  const mEnd = monthRange(jy, jm).end;

  return {
    today,
    overdue: overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    upcoming: upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    todayAmount: today.reduce((a, i) => a + remaining(i), 0),
    overdueAmount: overdue.reduce((a, i) => a + remaining(i), 0),
    upcomingAmount: upcoming.reduce((a, i) => a + remaining(i), 0),
    weekAmount: live.filter((i) => inRange(i, base, addDays(base, 7))).reduce((a, i) => a + remaining(i), 0),
    monthAmount: live.filter((i) => inRange(i, monthStart, mEnd)).reduce((a, i) => a + remaining(i), 0),
  };
}

/* ------------------------------ گزارش انبار ------------------------------ */

export interface StockReport {
  products: number;
  units: number;
  atCost: number;
  atSell: number;
  potentialProfit: number;
  lowStock: Product[];
  outOfStock: Product[];
  byCategory: { name: string; color: string; units: number; value: number }[];
}

export async function stockReport(): Promise<StockReport> {
  const [products, categories] = await Promise.all([
    db.products.where('archived').equals(0).toArray(),
    db.categories.toArray(),
  ]);
  const byCat = new Map<number | undefined, { name: string; color: string; units: number; value: number }>();
  let units = 0, atCost = 0, atSell = 0;
  for (const p of products) {
    const q = Math.max(0, p.quantity);
    units += q;
    atCost += p.buyPrice * q;
    atSell += p.sellPrice * q;
    const cat = categories.find((c) => c.id === p.categoryId);
    const key = cat?.id;
    const cur = byCat.get(key) || { name: cat?.name || 'بدون دسته', color: cat?.color || '#64748b', units: 0, value: 0 };
    cur.units += q;
    cur.value += p.sellPrice * q;
    byCat.set(key, cur);
  }
  return {
    products: products.length,
    units,
    atCost,
    atSell,
    potentialProfit: atSell - atCost,
    lowStock: products.filter((p) => p.quantity > 0 && p.quantity <= p.minStock).sort((a, b) => a.quantity - b.quantity),
    outOfStock: products.filter((p) => p.quantity <= 0),
    byCategory: [...byCat.values()].sort((a, b) => b.value - a.value),
  };
}

/* ---------------------------- گزارش واریزی‌ها ---------------------------- */

export async function paymentsReport(from: DateKey, to: DateKey) {
  const rows = await db.payments.where('date').between(from, to, true, true).toArray();
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const byMethod = new Map<string, number>();
  for (const r of rows) byMethod.set(r.method, (byMethod.get(r.method) || 0) + r.amount);
  return { rows, total, byMethod: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })) };
}

/* ------------------------------ گزارش روزانه ----------------------------- */

export interface DailyReport {
  date: DateKey;
  sales: Sale[];
  summary: Summary;
  payments: { count: number; total: number };
  installmentsDue: Installment[];
  installmentsPaidToday: number;
  walkInCount: number;
}

export async function dailyReport(date: DateKey = todayKey()): Promise<DailyReport> {
  const [sales, payments, installments] = await Promise.all([
    salesInRange(date, date),
    db.payments.where('date').equals(date).toArray(),
    db.installments.where('dueDate').equals(date).toArray(),
  ]);
  const summary = summarize(sales);
  return {
    date,
    sales: sales.sort((a, b) => b.id! - a.id!),
    summary,
    payments: { count: payments.length, total: payments.reduce((a, p) => a + p.amount, 0) },
    installmentsDue: installments,
    installmentsPaidToday: installments.filter((i) => i.paidDate === date).length,
    walkInCount: sales.filter((s) => s.walkIn).length,
  };
}

/** روند ۷ روز اخیر برای داشبورد */
export async function weekTrend() {
  const days = lastDays(7);
  const from = days[0];
  const to = days[days.length - 1];
  return salesByDay(from, to);
}
