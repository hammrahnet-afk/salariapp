/**
 * تست یکدستی فرم‌ها: کنترل‌های شمارنده/مبلغ باید هم‌اندازه و هم‌آیکون باشند
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { MoneyInput, Stepper, CONTROL_HEIGHT } from '../src/components/ui';

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
    const products = await screen.findAllByText('یخچال ساید بای ساید اسنوا', {}, { timeout: 8000 });
    fireEvent.click(products[0].closest('button')!);
    await screen.findByLabelText('کاهش', {}, { timeout: 5000 });
    expect(screen.getByLabelText('افزایش')).toBeTruthy();
    expect(document.querySelector('.rotate-45')).toBeNull();
    // کنترل‌های داخل ردیف قلم هم‌ارتفاع هستند
    const qty = screen.getByLabelText('کاهش').parentElement!;
    expect(qty.className).toContain('h-11');
  }, 20000);
});
