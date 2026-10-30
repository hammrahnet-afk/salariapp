import React, { Suspense, lazy, useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { AppProvider } from './state';
import { Spinner, ToastProvider } from './components/ui';
import { db } from './lib/db';
import { seedIfEmpty } from './lib/seed';
import { bindSystemEvents, scheduler } from './lib/scheduler';
import { useApp } from './state';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Products = lazy(() => import('./pages/Products'));
const Categories = lazy(() => import('./pages/Categories'));
const Customers = lazy(() => import('./pages/Customers'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const NewSale = lazy(() => import('./pages/NewSale'));
const Sales = lazy(() => import('./pages/Sales'));
const SaleDetail = lazy(() => import('./pages/SaleDetail'));
const Installments = lazy(() => import('./pages/Installments'));
const Payments = lazy(() => import('./pages/Payments'));
const SmsCenter = lazy(() => import('./pages/SmsCenter'));
const Reports = lazy(() => import('./pages/Reports'));
const BackupPage = lazy(() => import('./pages/BackupPage'));
const Settings = lazy(() => import('./pages/Settings'));
const Notifications = lazy(() => import('./pages/Notifications'));

function Boot() {
  const { ready } = useApp();
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      await db.open();
      await seedIfEmpty();
      if (alive) setBooted(true);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!booted || !ready) return;
    void scheduler.start();
    const unbind = bindSystemEvents();
    return () => { unbind(); void scheduler.stop(); };
  }, [booted, ready]);

  if (!booted || !ready) {
    return (
      <div className="min-h-dvh grid place-items-center bg-bg">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-brand text-brand-ink grid place-items-center text-2xl font-bold">س</div>
          <Spinner className="w-5 h-5 text-brand mx-auto" />
          <p className="text-xs text-muted">در حال آماده‌سازی سالاری‌اپ…</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="grid place-items-center py-24"><Spinner className="w-6 h-6 text-brand" /></div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="categories" element={<Categories />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          <Route path="sales" element={<Sales />} />
          <Route path="sales/new" element={<NewSale />} />
          <Route path="sales/:id" element={<SaleDetail />} />
          <Route path="installments" element={<Installments />} />
          <Route path="payments" element={<Payments />} />
          <Route path="sms" element={<SmsCenter />} />
          <Route path="reports" element={<Reports />} />
          <Route path="backup" element={<BackupPage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <HashRouter>
          <Boot />
        </HashRouter>
      </ToastProvider>
    </AppProvider>
  );
}
