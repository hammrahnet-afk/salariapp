import { db, nextSeq, type PayMethod, type Product, type Sale, type SaleItem } from './db';
import { todayKey, type DateKey } from './jalali';
import { makeCode } from './format';

export interface NewSaleInput {
  date: DateKey;
  customerId?: number | null;
  customerName: string;
  phone?: string;
  items: { productId?: number; name: string; qty: number; price: number; cost: number }[];
  discount?: number;
  paid?: number;
  method?: PayMethod;
  walkIn?: boolean;
  note?: string;
}

export interface SaleTotals {
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  debt: number;
  profit: number;
}

export function computeTotals(
  items: { qty: number; price: number; cost: number }[],
  discount = 0,
  paid = 0,
  taxPercent = 0,
): SaleTotals {
  const subtotal = items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
  const cost = items.reduce((s, i) => s + Number(i.qty) * Number(i.cost), 0);
  const afterDiscount = Math.max(0, subtotal - (Number(discount) || 0));
  const total = Math.round(afterDiscount * (1 + (Number(taxPercent) || 0) / 100));
  const p = Math.min(total, Number(paid) || 0);
  return {
    subtotal: Math.round(subtotal),
    discount: Math.round(Number(discount) || 0),
    total,
    paid: p,
    debt: Math.max(0, total - p),
    profit: Math.round(afterDiscount - cost),
  };
}

/** ثبت فاکتور فروش + کسر موجودی + سند انبار در یک تراکنش اتمی */
export async function createSale(input: NewSaleInput, taxPercent = 0): Promise<number> {
  const items = (input.items || []).filter((i) => i.qty > 0 && i.price >= 0);
  if (items.length === 0) throw new Error('حداقل یک قلم کالا با مقدار معتبر وارد کنید.');

  // کنترل موجودی انبار قبل از ثبت
  for (const it of items) {
    if (!it.productId) continue;
    const p = await db.products.get(it.productId);
    if (!p) throw new Error(`کالای «${it.name}» یافت نشد.`);
    if (p.quantity < it.qty) throw new Error(`موجودی «${p.name}» کافی نیست (موجودی: ${p.quantity} ${p.unit}).`);
  }

  const totals = computeTotals(items, input.discount, input.paid, taxPercent);
  const code = makeCode('S', await nextSeq('saleSeq'));

  return db.transaction('rw', db.sales, db.saleItems, db.products, db.stockMoves, async () => {
    const saleId = (await db.sales.add({
      code,
      date: input.date,
      customerId: input.customerId ?? null,
      customerName: input.customerName || 'مشتری روزگذر',
      phone: input.phone || '',
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      paid: totals.paid,
      debt: totals.debt,
      profit: totals.profit,
      method: input.method || 'cash',
      walkIn: input.walkIn !== false && !input.customerId,
      note: input.note || '',
      planId: null,
      createdAt: todayKey(),
    } as Sale)) as number;

    await db.saleItems.bulkAdd(
      items.map((i) => ({
        saleId,
        productId: i.productId,
        name: i.name,
        qty: i.qty,
        price: i.price,
        cost: i.cost,
        total: i.qty * i.price,
      })),
    );

    for (const it of items) {
      if (!it.productId) continue;
      await db.products.where('id').equals(it.productId).modify((p: Product) => {
        p.quantity -= it.qty;
        p.updatedAt = input.date;
      });
      await db.stockMoves.add({
        productId: it.productId,
        productName: it.name,
        type: 'sale',
        qty: -it.qty,
        reason: `فروش ${code}`,
        date: input.date,
        refId: saleId,
        createdAt: new Date().toISOString(),
      });
    }
    return saleId;
  });
}

/** حذف فاکتور و بازگرداندن موجودی انبار */
export async function deleteSale(saleId: number): Promise<void> {
  await db.transaction('rw', db.sales, db.saleItems, db.products, db.stockMoves, async () => {
    const sale = await db.sales.get(saleId);
    if (!sale) return;
    const items = await db.saleItems.where('saleId').equals(saleId).toArray();
    for (const it of items) {
      if (!it.productId) continue;
      await db.products.where('id').equals(it.productId).modify((p: Product) => {
        p.quantity += it.qty;
      });
      await db.stockMoves.where('refId').equals(saleId).and((m) => m.productId === it.productId).delete();
    }
    await db.saleItems.where('saleId').equals(saleId).delete();
    await db.sales.delete(saleId);
  });
}

export interface FullSale {
  sale: Sale;
  items: SaleItem[];
}

export async function getFullSale(id: number): Promise<FullSale | undefined> {
  const sale = await db.sales.get(id);
  if (!sale) return undefined;
  const items = await db.saleItems.where('saleId').equals(id).toArray();
  return { sale, items };
}
