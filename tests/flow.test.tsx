/** تست جریان‌های اصلی رابط کاربری: افزودن کالا، ثبت فروش، ثبت واریزی */
import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App';
import { db } from '../src/lib/db';
import { seedIfEmpty } from '../src/lib/seed';

const READY = { timeout: 12000 };

beforeAll(async () => {
  await db.open();
  await seedIfEmpty();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

beforeEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

async function open(path: string) {
  window.location.hash = '#' + path;
  render(<App />);
}

describe('جریان افزودن کالا', () => {
  it('کالای جدید از فرم ثبت و در انبار ظاهر می‌شود', async () => {
    const before = await db.products.count();
    await open('/products');
    await screen.findByText(/مدیریت کالاها/, undefined, READY);

    fireEvent.click(screen.getByRole('button', { name: /کالای جدید/ }));
    // فرم ثبت کالا اکنون به‌صورت بخش ورودی داخل همان صفحه باز می‌شود (نه مودال)
    const nameInput = await screen.findByPlaceholderText('مثلاً یخچال ساید بای ساید اسنوا', undefined, READY);
    fireEvent.change(nameInput, { target: { value: 'توستر تست دوکاره' } });
    fireEvent.click(screen.getByRole('button', { name: /ثبت کالا/ }));

    await waitFor(async () => expect(await db.products.count()).toBe(before + 1), { timeout: 8000 });
    const created = (await db.products.toArray()).find((p) => p.name === 'توستر تست دوکاره');
    expect(created).toBeTruthy();
    expect(created?.sellPrice).toBe(0);
    expect(created?.archived).toBe(0);
  }, 30000);
});

describe('جریان ثبت فروش', () => {
  it('انتخاب کالا، محاسبه جمع و کسر موجودی', async () => {
    const product = (await db.products.toArray()).find((p) => p.quantity > 2 && p.sellPrice > 0)!;
    const stockBefore = product.quantity;
    const salesBefore = await db.sales.count();

    await open('/sales/new');
    await screen.findByText(/اقلام فاکتور/, undefined, READY);

    // کالا از لیست کشویی جستجوپذیر انتخاب می‌شود
    const picker = await screen.findByRole('combobox', { name: /انتخاب کالا/ }, READY);
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: product.name.slice(0, 12) } });
    const option = await screen.findByRole('option', { name: new RegExp(product.name.slice(0, 12)) }, READY);
    fireEvent.click(option);
    await waitFor(() => expect(screen.getAllByText(/جمع‌بندی فاکتور/).length).toBeGreaterThan(0), READY);

    fireEvent.click(screen.getByRole('button', { name: /ثبت فاکتور/ }));

    await waitFor(async () => expect(await db.sales.count()).toBe(salesBefore + 1), { timeout: 8000 });
    const after = await db.products.get(product.id!);
    expect(after?.quantity).toBe(stockBefore - 1);
    const sale = (await db.sales.toArray()).sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
    expect(sale.total).toBe(product.sellPrice);
    expect(sale.walkIn).toBe(true);
    expect(sale.debt).toBe(0);
  }, 40000);
});

describe('جریان ثبت واریزی', () => {
  it('واریزی از صفحه پرداخت‌ها ثبت می‌شود', async () => {
    const customer = (await db.customers.toArray())[0];
    const before = await db.payments.count();

    await open('/payments');
    await screen.findByText(/واریزی‌های مشتریان/, undefined, READY);
    // صبر تا فهرست واریزی‌ها از دیتابیس بارگذاری شود
    await waitFor(() => expect(document.body.textContent).toMatch(/کارتخوان|نقدی|کارت‌به‌کارت/), READY);
    fireEvent.click(screen.getByRole('button', { name: /واریزی جدید/ }));

    const select = (await screen.findAllByRole('combobox', undefined, READY))[0];
    // صبر تا گزینه‌های مشتریان از دیتابیس پر شوند
    await waitFor(() => expect(document.querySelectorAll('select option').length).toBeGreaterThan(1), READY);
    fireEvent.change(select, { target: { value: String(customer.id) } });
    expect((select as HTMLSelectElement).value).toBe(String(customer.id));

    const amountInput = Array.from(document.querySelectorAll('input')).find((i) => i.inputMode === 'numeric')!;
    fireEvent.change(amountInput, { target: { value: '250000' } });

    fireEvent.click(screen.getByRole('button', { name: /^ثبت واریزی$/ }));
    await new Promise((r) => setTimeout(r, 300));
    if ((await db.payments.count()) === before) console.log('DEBUG BODY:', document.body.textContent?.slice(-600));

    await waitFor(async () => expect(await db.payments.count()).toBe(before + 1), { timeout: 8000 });
    const last = (await db.payments.toArray()).sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
    expect(last.customerId).toBe(customer.id);
    expect(last.amount).toBe(250000);
  }, 40000);
});

describe('منوی پایین و مسیرها', () => {
  it('لینک اقساط از نوار پایین کار می‌کند', async () => {
    await open('/');
    await screen.findByText(/گزارش روزانه/, undefined, READY);
    expect(screen.getAllByRole('link', { name: /اقساط/ }).length).toBeGreaterThan(0);
  }, 30000);
});
