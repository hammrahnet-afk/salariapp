import { db, nextSeq, type Category, type Customer, type Product, type StockMove, type MoveType } from './db';
import { todayKey, type DateKey } from './jalali';
import { makeCode } from './format';

/* -------------------------------- دسته‌بندی ------------------------------- */

export async function saveCategory(c: Partial<Category> & { name: string }): Promise<number> {
  const now = todayKey();
  if (c.id) {
    await db.categories.update(c.id, { ...c, name: c.name.trim() } as Partial<Category>);
    return c.id;
  }
  const count = await db.categories.count();
  return (await db.categories.add({
    name: c.name.trim(),
    color: c.color || '#0d9488',
    icon: c.icon || '📦',
    sortOrder: c.sortOrder ?? count + 1,
    createdAt: now,
  })) as number;
}

export async function deleteCategory(id: number): Promise<void> {
  const used = await db.products.where('categoryId').equals(id).count();
  if (used > 0) throw new Error(`این دسته ${used} کالا دارد؛ ابتدا کالاها را منتقل یا حذف کنید.`);
  await db.categories.delete(id);
}

/* ---------------------------------- کالا ---------------------------------- */

export async function saveProduct(p: Partial<Product>): Promise<number> {
  if (!p.name?.trim()) throw new Error('نام کالا الزامی است.');
  const now = todayKey();
  const payload: Partial<Product> = {
    name: p.name!.trim(),
    code: p.code?.trim() || (await makeCode('P', (await db.products.count()) + 1)),
    categoryId: p.categoryId,
    brand: p.brand?.trim() || '',
    model: p.model?.trim() || '',
    buyPrice: Number(p.buyPrice) || 0,
    sellPrice: Number(p.sellPrice) || 0,
    quantity: Number(p.quantity) || 0,
    minStock: Number(p.minStock) || 0,
    unit: p.unit || 'عدد',
    image: p.image,
    note: p.note || '',
    archived: p.archived ? 1 : 0,
    updatedAt: now,
  };
  if (p.id) {
    const old = await db.products.get(p.id);
    await db.products.update(p.id, payload);
    // اگر موجودی اولیه تغییر کرد، یک سند اصلاح انبار ثبت کن
    if (old && old.quantity !== payload.quantity) {
      await addStockMove({
        productId: p.id,
        productName: payload.name!,
        type: 'adjust',
        qty: (payload.quantity ?? 0) - old.quantity,
        reason: 'اصلاح دستی موجودی',
        date: now,
      });
    }
    return p.id;
  }
  const id = (await db.products.add({ ...payload, createdAt: now } as Product)) as number;
  if ((payload.quantity ?? 0) > 0) {
    await addStockMove({
      productId: id,
      productName: payload.name!,
      type: 'in',
      qty: payload.quantity!,
      reason: 'موجودی ابتدایی',
      date: now,
      refId: id,
    });
  }
  return id;
}

export async function deleteProduct(id: number): Promise<void> {
  await db.transaction('rw', db.products, db.stockMoves, db.saleItems, async () => {
    await db.stockMoves.where('productId').equals(id).delete();
    await db.products.delete(id);
  });
}

export async function addStockMove(m: Omit<StockMove, 'id' | 'createdAt'>): Promise<number> {
  return (await db.stockMoves.add({ ...m, createdAt: new Date().toISOString() } as StockMove)) as number;
}

/** تغییر موجودی با ثبت سند انبار (برای خرید، مرجوعی، اصلاح) */
export async function changeStock(productId: number, delta: number, type: MoveType, reason: string, date: DateKey = todayKey(), refId?: number): Promise<void> {
  const p = await db.products.get(productId);
  if (!p) return;
  await db.products.update(productId, { quantity: p.quantity + delta, updatedAt: date });
  await addStockMove({ productId, productName: p.name, type, qty: delta, reason, date, refId });
}

/** کالاهای زیر نقطه سفارش */
export async function lowStockProducts(): Promise<Product[]> {
  const all = await db.products.where('archived').equals(0).toArray();
  return all.filter((p) => p.quantity <= p.minStock).sort((a, b) => a.quantity - b.quantity);
}

/** ارزش ریالی انبار */
export function stockValuation(list: Product[]): { atCost: number; atSell: number; count: number; units: number } {
  return list.reduce(
    (a, p) => ({
      atCost: a.atCost + p.buyPrice * Math.max(0, p.quantity),
      atSell: a.atSell + p.sellPrice * Math.max(0, p.quantity),
      count: a.count + 1,
      units: a.units + Math.max(0, p.quantity),
    }),
    { atCost: 0, atSell: 0, count: 0, units: 0 },
  );
}

/* --------------------------------- مشتری --------------------------------- */

export async function saveCustomer(c: Partial<Customer>): Promise<number> {
  if (!c.name?.trim()) throw new Error('نام مشتری الزامی است.');
  const now = todayKey();
  const payload: Partial<Customer> = {
    name: c.name!.trim(),
    phone: c.phone?.trim() || '',
    phone2: c.phone2?.trim() || '',
    address: c.address || '',
    openingBalance: Number(c.openingBalance) || 0,
    openingDate: c.openingDate || now,
    note: c.note || '',
    archived: c.archived ? 1 : 0,
  };
  if (c.id) {
    await db.customers.update(c.id, payload);
    return c.id;
  }
  return (await db.customers.add({ ...payload, createdAt: now } as Customer)) as number;
}

export async function deleteCustomer(id: number): Promise<void> {
  const sales = await db.sales.where('customerId').equals(id).count();
  if (sales > 0) throw new Error('این مشتری دارای فاکتور فروش است؛ به‌جای حذف، آن را بایگانی کنید.');
  await db.transaction('rw', db.customers, db.installments, db.plans, db.payments, db.notifications, async () => {
    await db.installments.where('customerId').equals(id).delete();
    await db.plans.where('customerId').equals(id).delete();
    await db.payments.where('customerId').equals(id).delete();
    await db.customers.delete(id);
  });
}

/** مانده حساب مشتری: مثبت = بدهکار */
export function balanceOf(
  c: Pick<Customer, 'openingBalance'>,
  sales: { total: number; paid: number }[],
  payments: { amount: number }[],
): number {
  const debt = sales.reduce((s, x) => s + (x.total - x.paid), 0);
  const pay = payments.reduce((s, x) => s + x.amount, 0);
  return (c.openingBalance || 0) + debt - pay;
}

export async function nextSaleCode(): Promise<string> {
  return makeCode('S', await nextSeq('saleSeq'));
}
