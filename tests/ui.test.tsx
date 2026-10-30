/**
 * تست دودی رابط کاربری: هر صفحه باید بدون خطا رندر شود
 * (بدون مرورگر واقعی، با jsdom و IndexedDB شبیه‌سازی‌شده)
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import App from '../src/App';
import { seedIfEmpty } from '../src/lib/seed';
import { db } from '../src/lib/db';

beforeAll(async () => {
  // محیط jsdom امکانات مرورگری را که تست لازم دارد فراهم کن
  if (!window.matchMedia) {
    // @ts-expect-error افزودن برای تست
    window.matchMedia = () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
  }
  await db.open();
  await seedIfEmpty();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => cleanup());

const routes: [string, RegExp][] = [
  ['/', /گزارش روزانه/],
  ['/products', /مدیریت کالاها/],
  ['/categories', /دسته‌بندی محصولات/],
  ['/customers', /مدیریت مشتریان/],
  ['/sales', /فاکتورهای فروش/],
  ['/sales/new', /مشتری فاکتور/],
  ['/installments', /مدیریت اقساط/],
  ['/payments', /واریزی‌های مشتریان/],
  ['/sms', /مرکز پیامک/],
  ['/reports', /گزارش‌های پیشرفته/],
  ['/backup', /پشتیبان‌گیری/],
  ['/settings', /مشخصات فروشگاه/],
  ['/notifications', /اعلان‌ها/],
];

describe('رندر صفحه‌ها', () => {
  for (const [path, matcher] of routes) {
    it(`صفحه ${path} بدون خطا رندر می‌شود`, async () => {
      window.location.hash = '#' + path;
      render(<App />);
      await waitFor(() => expect(document.body.textContent || '').toMatch(matcher), { timeout: 8000 });
      expect(document.querySelectorAll('script[src=""]').length).toBe(0);
    }, 20000);
  }
});
