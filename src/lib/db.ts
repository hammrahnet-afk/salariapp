import Dexie, { type Table } from 'dexie';
import type { DateKey } from './jalali';

/* ---------------------------------- انواع --------------------------------- */

export interface Category {
  id?: number;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  createdAt: DateKey;
}

export interface Product {
  id?: number;
  name: string;
  code: string;
  categoryId?: number;
  brand: string;
  model: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  minStock: number;
  unit: string;
  image?: string; // dataURL فشرده
  note: string;
  /** 0 = فعال، 1 = بایگانی‌شده (برای ایندکس‌پذیری در IndexedDB) */
  archived: 0 | 1;
  createdAt: DateKey;
  updatedAt: DateKey;
}

export interface Customer {
  id?: number;
  name: string;
  phone: string;
  phone2?: string;
  address?: string;
  /** مانده از قبل: مثبت = مشتری بدهکار، منفی = مشتری بستانکار */
  openingBalance: number;
  openingDate?: DateKey;
  note?: string;
  archived: 0 | 1;
  createdAt: DateKey;
}

export interface SaleItemInput {
  productId?: number;
  name: string;
  qty: number;
  price: number;
  cost: number;
}

export interface SaleItem extends SaleItemInput {
  id?: number;
  saleId?: number;
  total: number;
}

export type PayMethod = 'cash' | 'card' | 'transfer' | 'cheque' | 'credit';

export interface Sale {
  id?: number;
  code: string;
  date: DateKey;
  /** null یعنی مشتری روزگذر (فروش نقدی روزانه) */
  customerId?: number | null;
  customerName: string;
  phone?: string;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  debt: number;
  profit: number;
  method: PayMethod;
  walkIn: boolean;
  note?: string;
  planId?: number | null;
  createdAt: DateKey;
}

export interface InstallmentPlan {
  id?: number;
  code: string;
  customerId: number;
  saleId?: number | null;
  title: string;
  totalAmount: number;
  downPayment: number;
  count: number;
  perInstallment: number;
  startDate: DateKey;
  intervalDays: number;
  /** 'days' = فاصله روزانه، 'months' = فاصله ماهانه (پیشنهادی برای قسط ماهیانه) */
  intervalMode: 'days' | 'months';
  note?: string;
  status: 'active' | 'done' | 'cancelled';
  createdAt: DateKey;
}

export interface Installment {
  id?: number;
  planId: number;
  planCode: string;
  customerId: number;
  idx: number;
  amount: number;
  dueDate: DateKey;
  paidAmount: number;
  paidDate?: DateKey | null;
  status: 'pending' | 'paid' | 'cancelled';
  notified?: boolean;
  smsSentAt?: string | null;
}

export interface Payment {
  id?: number;
  customerId: number;
  amount: number;
  date: DateKey;
  method: PayMethod;
  installmentId?: number | null;
  planId?: number | null;
  note?: string;
  smsSentAt?: string | null;
  createdAt: DateKey;
}

export type MoveType = 'in' | 'out' | 'adjust' | 'sale' | 'return';

export interface StockMove {
  id?: number;
  productId: number;
  productName: string;
  type: MoveType;
  qty: number;
  reason: string;
  date: DateKey;
  refId?: number | null;
  createdAt: DateKey;
}

export type SmsStatus = 'sent' | 'queued' | 'failed' | 'draft' | 'manual';

export interface SmsLog {
  id?: number;
  customerId?: number | null;
  customerName: string;
  phone: string;
  message: string;
  status: SmsStatus;
  provider: string;
  kind: string;
  installmentId?: number | null;
  error?: string;
  createdAt: string; // ISO
  date: DateKey;
}

export interface AppNotification {
  id?: number;
  date: DateKey;
  kind: 'due' | 'overdue' | 'stock' | 'backup' | 'info';
  title: string;
  body: string;
  refId?: number | null;
  read: 0 | 1;
  createdAt: string;
}

export interface BackupRecord {
  id?: number;
  createdAt: string;
  date: DateKey;
  source: 'auto' | 'manual' | 'drive';
  note?: string;
  size: number;
  data: unknown;
}

/* --------------------------------- دیتابیس -------------------------------- */

class SalariDB extends Dexie {
  categories!: Table<Category, number>;
  products!: Table<Product, number>;
  customers!: Table<Customer, number>;
  sales!: Table<Sale, number>;
  saleItems!: Table<SaleItem, number>;
  plans!: Table<InstallmentPlan, number>;
  installments!: Table<Installment, number>;
  payments!: Table<Payment, number>;
  stockMoves!: Table<StockMove, number>;
  smsLogs!: Table<SmsLog, number>;
  notifications!: Table<AppNotification, number>;
  backups!: Table<BackupRecord, number>;
  settings!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('salariapp');
    this.version(1).stores({
      categories: '++id, name, sortOrder, createdAt',
      products: '++id, categoryId, name, code, quantity, archived, createdAt, updatedAt',
      customers: '++id, name, phone, archived, createdAt',
      sales: '++id, code, date, customerId, walkIn, createdAt',
      saleItems: '++id, saleId, productId',
      plans: '++id, code, customerId, saleId, status, createdAt',
      installments: '++id, planId, customerId, dueDate, status, [customerId+dueDate], [status+dueDate]',
      payments: '++id, customerId, date, installmentId, planId, createdAt',
      stockMoves: '++id, productId, date, createdAt',
      smsLogs: '++id, customerId, status, date, createdAt',
      notifications: '++id, date, kind, read, createdAt',
      backups: '++id, createdAt, date, source',
      settings: 'key',
    });

    // نسخه ۲: تبدیل پرچم‌های بولین به عدد (IndexedDB بولین را ایندکس نمی‌کند)
    this.version(2)
      .stores({
        products: '++id, categoryId, name, code, quantity, archived, createdAt, updatedAt',
        customers: '++id, name, phone, archived, createdAt',
        notifications: '++id, date, kind, read, createdAt',
      })
      .upgrade(async (tx) => {
        await tx.table('products').toCollection().modify((p: any) => {
          p.archived = p.archived ? 1 : 0;
        });
        await tx.table('customers').toCollection().modify((c: any) => {
          c.archived = c.archived ? 1 : 0;
        });
        await tx.table('notifications').toCollection().modify((n: any) => {
          n.read = n.read ? 1 : 0;
        });
      });

    // نسخه ۳: ایندکس refId برای پاک‌سازی اسناد انبار هنگام حذف فاکتور
    this.version(3).stores({
      stockMoves: '++id, productId, date, refId, createdAt',
    });
  }
}

export const db = new SalariDB();

/* ------------------------------ تنظیمات کلید/مقدار ------------------------- */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const rows = await db.settings.toArray();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** شمارنده برای ساخت کد یکتا */
export async function nextSeq(key: string): Promise<number> {
  const n = (await getSetting<number>(key, 0)) + 1;
  await setSetting(key, n);
  return n;
}
