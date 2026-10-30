/**
 * تست یکدستی فرم‌ها: کنترل‌های شمارنده/مبلغ باید هم‌اندازه و هم‌آیکون باشند
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Combobox, MoneyInput, Stepper, CONTROL_HEIGHT } from '../src/components/ui';
import { notificationAccess } from '../src/lib/permissions';

beforeAll(() => {
  if (!window.matchMedia) {
    // @ts-expect-error افزودن برای تست
    window.matchMedia = () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => cleanup());

describe('کنترل‌های یکسان فرم', () => {
  it('شمارنده مقدار دو دکمه هم‌اندازه با آیکون + و − دارد و در بازه می‌ماند', () => {
    let value = 3;
    const { rerender } = render(<Stepper value={value} min={1} max={5} onChange={(n) => { value = n; }} />);
    const dec = screen.getByLabelText('کاهش');
    const inc = screen.getByLabelText('افزایش');
    // هر دو دکمه از یک اندازه و یک ساختار آیکون استفاده می‌کنند
    for (const btn of [dec, inc]) {
      expect(btn.className).toContain('w-10');
      expect(btn.querySelector('svg')?.getAttribute('class')).toContain('w-4 h-4');
    }
    fireEvent.click(inc);
    expect(value).toBe(4);
    fireEvent.click(dec);
    expect(value).toBe(2);
    rerender(<Stepper value={1} min={1} max={5} onChange={(n) => { value = n; }} />);
    expect((screen.getByLabelText('کاهش') as HTMLButtonElement).disabled).toBe(true);
    rerender(<Stepper value={5} min={1} max={5} onChange={(n) => { value = n; }} />);
    expect((screen.getByLabelText('افزایش') as HTMLButtonElement).disabled).toBe(true);
  });

  it('همه کنترل‌ها ارتفاع پایه یکسان دارند', () => {
    expect(CONTROL_HEIGHT.md).toBe('h-11');
    expect(CONTROL_HEIGHT.sm).toBe('h-10');
    const { container } = render(<MoneyInput value={1500} onChange={() => undefined} unit="تومان" />);
    const input = container.querySelector('input')!;
    expect(input.className).toContain(CONTROL_HEIGHT.md);
    expect(input.className).not.toContain('h-9');
    expect(container.textContent).toContain('تومان');
  });
});

describe('فرم ثبت فروش', () => {
  it('پس از افزودن کالا، مقدار با شمارنده یکسان و بدون آیکون چرخیده نمایش داده می‌شود', async () => {
    const { seedIfEmpty } = await import('../src/lib/seed');
    const { db } = await import('../src/lib/db');
    const App = (await import('../src/App')).default;
    await db.open();
    await seedIfEmpty();
    window.location.hash = '#/sales/new';
    render(<App />);
    // انتخاب کالا از لیست کشویی جستجوپذیر (نه فهرست کالاهای پایین صفحه)
    const picker = await screen.findByRole('combobox', { name: /انتخاب کالا/ }, { timeout: 8000 });
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: 'یخچال ساید' } });
    const option = await screen.findByRole('option', { name: /یخچال ساید بای ساید اسنوا/ }, { timeout: 5000 });
    fireEvent.click(option);
    await screen.findByLabelText('کاهش', {}, { timeout: 5000 });
    expect(screen.getByLabelText('افزایش')).toBeTruthy();
    expect(document.querySelector('.rotate-45')).toBeNull();
    // کنترل‌های داخل ردیف قلم هم‌ارتفاع هستند
    const qty = screen.getByLabelText('کاهش').parentElement!;
    expect(qty.className).toContain('h-11');
  }, 20000);
});

describe('لیست کشویی جستجوپذیر کالا', () => {
  it('با تایپ، فهرست فیلتر می‌شود و انتخاب مقدار درست را برمی‌گرداند', () => {
    const picked: string[] = [];
    render(
      <Combobox
        label="انتخاب کالا"
        options={[
          { value: '1', label: 'یخچال ساید بای ساید اسنوا', hint: 'اسنوا • P-1001' },
          { value: '2', label: 'ماشین لباسشویی ۹ کیلو اسنوا', hint: 'اسنوا • P-2001' },
          { value: '3', label: 'ماهیتابه گرانیتی ۲۸ سانتی', hint: 'زینوم • P-4002' },
        ]}
        onSelect={(v) => picked.push(v)}
      />,
    );
    const input = screen.getByRole('combobox', { name: 'انتخاب کالا' });
    fireEvent.focus(input);
    expect(screen.getAllByRole('option')).toHaveLength(3);

    fireEvent.change(input, { target: { value: 'لباسشویی' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('ماشین لباسشویی');

    fireEvent.click(options[0]);
    expect(picked).toEqual(['2']);
    // پس از انتخاب، جستجو پاک و لیست بسته می‌شود
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('option')).toBeNull();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'کالای ناموجود' } });
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.getByText('موردی یافت نشد')).toBeTruthy();
  });
});

describe('چینش کالاها', () => {
  it('نمای «بدون عکس» نام کامل کالا را نمایش می‌دهد و انتخاب کاربر ذخیره می‌شود', async () => {
    const { seedIfEmpty } = await import('../src/lib/seed');
    const { db } = await import('../src/lib/db');
    const App = (await import('../src/App')).default;
    await db.open();
    await seedIfEmpty();
    window.location.hash = '#/products';
    render(<App />);
    await screen.findByText(/مدیریت کالاها/, {}, { timeout: 8000 });

    fireEvent.click(screen.getByRole('button', { name: /بدون عکس/ }));
    const name = await screen.findByText('یخچال ساید بای ساید اسنوا');
    // در این نما نام کامل و چندخطی است (بریده نمی‌شود)
    expect(name.className).toContain('break-words');
    expect(localStorage.getItem('salari.products.view')).toBe('compact');
  }, 20000);
});

describe('وضعیت اجازه اعلان', () => {
  it('در مرورگر بدون API اعلان، وضعیت unsupported برمی‌گردد (نه denied)', async () => {
    vi.stubGlobal('Notification', undefined);
    await expect(notificationAccess()).resolves.toBe('unsupported');
    vi.unstubAllGlobals();
  });

  it('وقتی کاربر اجازه داده باشد، وضعیت granted است و بنر داشبورد پنهان می‌شود', async () => {
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: async () => 'granted' });
    await expect(notificationAccess()).resolves.toBe('granted');
    vi.unstubAllGlobals();
  });

  it('تا وقتی کاربر تصمیم نگرفته وضعیت prompt و پس از رد کردن denied است', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: async () => 'denied' });
    await expect(notificationAccess()).resolves.toBe('prompt');
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: async () => 'denied' });
    await expect(notificationAccess()).resolves.toBe('denied');
    vi.unstubAllGlobals();
  });
});
