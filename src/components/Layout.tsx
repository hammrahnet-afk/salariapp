import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useApp } from '../state';
import { Badge, Icon, IconButton, cx } from './ui';
import { todayKey, formatDate } from '../lib/jalali';
import { toFa } from '../lib/format';
import { scheduler } from '../lib/scheduler';

const NAV = [
  { to: '/', label: 'داشبورد', icon: 'home' },
  { to: '/sales/new', label: 'ثبت فروش', icon: 'card' },
  { to: '/products', label: 'کالاها', icon: 'box' },
  { to: '/customers', label: 'مشتریان', icon: 'users' },
  { to: '/installments', label: 'اقساط', icon: 'calendar' },
];

const NAV_MORE = [
  { to: '/sales', label: 'فاکتورها', icon: 'layers' },
  { to: '/categories', label: 'دسته‌بندی', icon: 'tag' },
  { to: '/payments', label: 'واریزی‌ها', icon: 'wallet' },
  { to: '/reports', label: 'گزارش‌ها', icon: 'chart' },
  { to: '/sms', label: 'مرکز پیامک', icon: 'message' },
  { to: '/backup', label: 'پشتیبان‌گیری', icon: 'database' },
  { to: '/settings', label: 'تنظیمات', icon: 'settings' },
];

export default function Layout() {
  const { cfg, toggleTheme } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [engineOn, setEngineOn] = useState(false);

  const unread = useLiveQuery(() => db.notifications.where('read').equals(0).count(), [], 0) ?? 0;
  const dueToday = useLiveQuery(async () => {
    const base = todayKey();
    const rows = await db.installments.where('status').equals('pending').toArray();
    return rows.filter((i) => i.dueDate <= base && i.paidAmount < i.amount).length;
  }, [], 0) ?? 0;

  useEffect(() => setMoreOpen(false), [loc.pathname]);

  useEffect(() => {
    const onTick = () => setEngineOn(scheduler.active);
    const t = setInterval(onTick, 2000);
    onTick();
    return () => clearInterval(t);
  }, []);

  const isMoreActive = NAV_MORE.some((m) => loc.pathname.startsWith(m.to));

  return (
    <div className="min-h-dvh bg-bg text-ink">
      {/* نوار بالا */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line no-print">
        <div className="lg:mr-64 px-3 sm:px-5 h-14 flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-brand text-brand-ink flex items-center justify-center font-bold shrink-0">س</div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold truncate leading-5">{cfg.shop.name}</h1>
            <p className="text-[10px] text-muted truncate leading-4">{formatDate(todayKey(), true)}</p>
          </div>

          <span className="hidden sm:flex items-center gap-1.5 px-2 h-7 rounded-lg bg-surface2 border border-line text-[11px] text-muted whitespace-nowrap">
            <span className={cx('w-1.5 h-1.5 rounded-full', engineOn ? 'bg-ok animate-pulse' : 'bg-muted')} />
            {engineOn ? 'موتور فعال' : 'موتور متوقف'}
          </span>

          <IconButton name={cfg.theme === 'dark' ? 'sun' : 'moon'} label={cfg.theme === 'dark' ? 'پوسته روشن' : 'پوسته تاریک'} onClick={toggleTheme} />
          <button onClick={() => nav('/notifications')} className="relative w-9 h-9 rounded-lg hover:bg-surface2 flex items-center justify-center text-muted" aria-label="اعلان‌ها">
            <Icon name="bell" className="w-[18px] h-[18px]" />
            {unread > 0 ? <span className="absolute top-1 left-1 min-w-4 h-4 px-1 rounded-full bg-danger text-white text-[9px] flex items-center justify-center font-bold">{toFa(unread)}</span> : null}
          </button>
        </div>
      </header>

      {/* سایدبار دسکتاپ/تبلت */}
      <aside className="hidden lg:block fixed top-0 right-0 bottom-0 w-64 bg-surface border-l border-line z-40 overflow-y-auto no-print">
        <div className="h-14 flex items-center gap-2 px-4 border-b border-line">
          <div className="w-9 h-9 rounded-xl bg-brand text-brand-ink flex items-center justify-center font-bold">س</div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">سالاری‌اپ</p>
            <p className="text-[10px] text-muted truncate">حسابداری لوازم خانگی</p>
          </div>
        </div>
        <nav className="p-3 space-y-1">
          {[...NAV, ...NAV_MORE].map((n) => (
            <SideLink key={n.to} {...n} badge={n.to === '/installments' && dueToday ? dueToday : undefined} />
          ))}
        </nav>
        <div className="p-3 mt-auto">
          <div className="rounded-xl border border-line bg-surface2 p-3 text-[11px] text-muted leading-6">
            <p className="font-medium text-ink text-xs mb-1">حالت آفلاین</p>
            تمام داده‌ها روی همین دستگاه ذخیره می‌شود. برای نصب روی گوشی، از منوی مرورگر «افزودن به صفحه اصلی» را بزنید.
          </div>
        </div>
      </aside>

      {/* محتوا */}
      <main className="lg:mr-64 pb-24 lg:pb-8 px-3 sm:px-5 pt-4">
        <Outlet />
      </main>

      {/* دکمه شناور ثبت فروش (موبایل) */}
      {loc.pathname !== '/sales/new' ? (
        <button
          onClick={() => nav('/sales/new')}
          className="lg:hidden fixed bottom-[84px] left-4 z-40 w-14 h-14 rounded-2xl bg-brand text-brand-ink shadow-xl shadow-brand/30 flex items-center justify-center active:scale-95 transition no-print"
          aria-label="ثبت فروش جدید"
        >
          <Icon name="plus" className="w-6 h-6" stroke={2.4} />
        </button>
      ) : null}

      {/* نوار پایین موبایل */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line no-print">
        <div className="grid grid-cols-6 h-[68px]">
          {NAV.map((n) => (
            <BottomLink key={n.to} {...n} badge={n.to === '/installments' && dueToday ? dueToday : undefined} />
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className={cx('flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition', isMoreActive ? 'text-brand' : 'text-muted')}
          >
            <Icon name="menu" className="w-[20px] h-[20px]" />
            <span className="whitespace-nowrap text-[9.5px] sm:text-[10px]">بیشتر</span>
            {unread > 0 ? <span className="absolute top-2 w-2 h-2 rounded-full bg-danger" /> : null}
          </button>
        </div>
      </nav>

      {/* شیت «بیشتر» */}
      {moreOpen ? (
        <div className="lg:hidden fixed inset-0 z-50 no-print">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 bg-surface border-t border-line rounded-t-2xl p-3 pb-6 anim-sheet">
            <div className="w-10 h-1 rounded-full bg-line mx-auto mb-3" />
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {NAV_MORE.map((m) => (
                <button key={m.to} onClick={() => nav(m.to)} className={cx('flex flex-col items-center gap-1.5 p-3 rounded-xl border transition text-[11px]', loc.pathname.startsWith(m.to) ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface2 text-muted')}>
                  <Icon name={m.icon} className="w-5 h-5" />
                  <span className="truncate w-full text-center">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SideLink({ to, label, icon, badge }: { to: string; label: string; icon: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => cx('flex items-center gap-2.5 h-10 px-3 rounded-xl text-[13px] font-medium transition', isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface2 hover:text-ink')}
    >
      <Icon name={icon} className="w-[18px] h-[18px] shrink-0" />
      <span className="truncate flex-1">{label}</span>
      {badge ? <Badge tone="danger">{toFa(badge)}</Badge> : null}
    </NavLink>
  );
}

function BottomLink({ to, label, icon, badge }: { to: string; label: string; icon: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => cx('relative flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition', isActive ? 'text-brand' : 'text-muted')}
    >
      <Icon name={icon} className="w-[20px] h-[20px]" />
      <span className="whitespace-nowrap max-w-full px-0.5 text-[9.5px] sm:text-[10px]">{label}</span>
      {badge ? <span className="absolute top-2 left-1/2 min-w-4 h-4 px-1 rounded-full bg-danger text-white text-[9px] flex items-center justify-center font-bold">{toFa(badge)}</span> : null}
    </NavLink>
  );
}
