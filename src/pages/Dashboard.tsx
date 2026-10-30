import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useApp } from '../state';
import { Badge, Button, Card, EmptyState, Icon, ListRow, SectionTitle, StatCard, cx } from '../components/ui';
import { BarChart, Donut, Sparkline } from '../components/charts';
import { addDays, formatDate, lastMonths, monthRange, relativeDay, todayKey } from '../lib/jalali';
import { money, moneyShort, percent, toFa } from '../lib/format';
import { customerDebtReport, dailyReport, installmentReport, salesByDay, salesByMonth, stockReport, topProducts } from '../lib/reports';
import { addPayment } from '../lib/plans';
import { scheduler } from '../lib/scheduler';
import { useEffect, useState } from 'react';
import { useToast } from '../components/ui';
import { exactAlarmAccess, notificationAccess, onAccessChange, requestNotificationAccess, type AccessState } from '../lib/permissions';
import { isNativeApp, openAppSettings, syncNativeReminders } from '../lib/native';

export default function Dashboard() {
  const nav = useNavigate();
  // وضعیت دسترسی اعلان به‌صورت غیرهمگام خوانده می‌شود؛ در اپ اندروید مجوز بومی مبنا است
  const [notifyState, setNotifyState] = useState<AccessState | null>(null);
  const [alarmState, setAlarmState] = useState<AccessState | null>(null);
  const native = isNativeApp();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [n, a] = await Promise.all([notificationAccess(), exactAlarmAccess()]);
      if (!alive) return;
      setNotifyState(n);
      setAlarmState(a);
    };
    void load();
    const off = onAccessChange(() => { void load(); });
    return () => { alive = false; off(); };
  }, []);
  const { unit, cfg } = useApp();
  const toast = useToast();
  const base = todayKey();
  const months = lastMonths(6);
  const { start: mStart, end: mEnd } = monthRange(months[months.length - 1].jy, months[months.length - 1].jm);

  const today = useLiveQuery(() => dailyReport(base), [base]);
  const week = useLiveQuery(async () => salesByDay(addDays(base, -6), base), [base]);
  const monthly = useLiveQuery(() => salesByMonth(6), []);
  const ins = useLiveQuery(() => installmentReport(base, 7), [base]);
  const stock = useLiveQuery(() => stockReport(), []);
  const top = useLiveQuery(() => topProducts(mStart, mEnd, 5), [mStart, mEnd]);
  const cats = useLiveQuery(async () => {
    const rows = await stockReport();
    return rows.byCategory.slice(0, 5);
  }, []);
  const debts = useLiveQuery(() => customerDebtReport(base), [base]);

  const totals = useMemo(() => {
    const t = today?.summary;
    return {
      sales: t?.total ?? 0,
      profit: t?.profit ?? 0,
      paid: today?.payments.total ?? 0,
      due: ins?.todayAmount ?? 0,
      count: t?.count ?? 0,
      month: monthly?.reduce((a, m) => a + m.total, 0) ?? 0,
      monthProfit: monthly?.reduce((a, m) => a + m.profit, 0) ?? 0,
    };
  }, [today, ins, monthly]);

  const receivable = (debts || []).reduce((a, d) => a + Math.max(0, d.balance), 0);

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {notifyState && notifyState !== 'granted' ? (
        <Card className="border-warn/40 bg-warn-soft/40">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-warn-soft text-warn flex items-center justify-center shrink-0">
              <Icon name={notifyState === 'unsupported' ? 'bellOff' : 'bell'} className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold truncate">
                {notifyState === 'denied' ? 'اجازه اعلان رد شده است' : 'یادآوری خودکار را فعال کنید'}
              </p>
              <p className="text-[11px] text-muted leading-6">
                {notifyState === 'unsupported'
                  ? 'این مرورگر اعلان سیستمی ندارد؛ اپ اندروید یا نسخه نصب‌شده (PWA) را باز کنید.'
                  : notifyState === 'denied'
                    ? (native
                      ? 'اجازه را از تنظیمات همین اپ روشن کنید تا اعلان سررسید اقساط نمایش داده شود.'
                      : 'از قفل آدرس مرورگر → مجوزهای سایت، اعلان را روی «اجازه» بگذارید.')
                    : 'برای اینکه سررسید اقساط در همان روز اعلان و پیامک شوند، اجازه اعلان و اجرای پس‌زمینه لازم است.'}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              {notifyState !== 'denied' && notifyState !== 'unsupported' ? (
                <Button
                  size="sm"
                  icon="bell"
                  onClick={async () => {
                    const p = await requestNotificationAccess();
                    setNotifyState(p);
                    setAlarmState(await exactAlarmAccess());
                    try {
                      if (native) await syncNativeReminders(180);
                      else await scheduler.registerPeriodic();
                    } catch { /* اختیاری */ }
                    toast.push(
                      p === 'granted' ? 'اعلان‌ها فعال شد' : p === 'denied' ? 'اجازه اعلان رد شد' : 'برای اجازه اعلان تأیید کنید',
                      p === 'granted' ? 'ok' : 'warn',
                    );
                  }}
                >
                  فعال‌سازی
                </Button>
              ) : null}
              {native ? (
                <Button size="sm" variant="outline" icon="settings" onClick={() => { void openAppSettings(); }}>تنظیمات اپ</Button>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {notifyState === 'granted' && native && alarmState && alarmState !== 'granted' ? (
        <Card className="border-warn/30 bg-warn-soft/30">
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon name="clock" className="w-[18px] h-[18px] text-warn shrink-0" />
            <p className="text-[11px] text-muted leading-6 flex-1 min-w-0">
              اعلان فعال است، اما «آلارم و یادآور دقیق» روشن نیست؛ یادآوری‌ها ممکن است با تأخیر اجرا شوند.
            </p>
            <Button size="sm" variant="outline" icon="clock" onClick={() => nav('/settings')}>تنظیم</Button>
          </div>
        </Card>
      ) : null}

      {/* کارت خوش‌آمد */}
      <Card className="overflow-hidden relative">
        <div className="absolute -left-10 -top-10 w-40 h-40 rounded-full bg-brand/10 blur-2xl" />
        <div className="relative flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <p className="text-xs text-muted">گزارش روزانه</p>
            <h2 className="text-lg sm:text-xl font-bold truncate">{formatDate(base, true)}</h2>
            <p className="text-[11px] text-muted mt-1 truncate">
              {toFa(totals.count)} فاکتور ثبت شده • {toFa(today?.walkInCount ?? 0)} مشتری روزگذر
            </p>
          </div>
          <Button icon="plus" onClick={() => nav('/sales/new')} size="sm">ثبت فروش</Button>
        </div>
      </Card>

      {/* آمار امروز */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="فروش امروز" value={`${money(totals.sales)}`} sub={unit} icon="cash" tone="brand" onClick={() => nav('/reports?range=today')} />
        <StatCard label="سود امروز" value={`${money(totals.profit)}`} sub={percent(totals.profit, totals.sales) + ' حاشیه'} icon="chart" tone="ok" onClick={() => nav('/reports?range=today')} />
        <StatCard label="واریزی امروز" value={`${money(totals.paid)}`} sub={`${toFa(today?.payments.count ?? 0)} پرداخت`} icon="wallet" tone="info" onClick={() => nav('/payments')} />
        <StatCard label="سررسید امروز" value={`${money(totals.due)}`} sub={`${toFa(ins?.today.length ?? 0)} قسط`} icon="calendar" tone="danger" onClick={() => nav('/installments')} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="فروش ۶ ماه اخیر" value={moneyShort(totals.month)} sub={unit} icon="layers" tone="neutral" onClick={() => nav('/reports')} />
        <StatCard label="مطالبات از مشتریان" value={moneyShort(receivable)} sub={`${toFa((debts || []).filter((d) => d.balance > 0).length)} مشتری بدهکار`} icon="users" tone="warn" onClick={() => nav('/customers')} />
        <StatCard label="ارزش انبار" value={moneyShort(stock?.atSell ?? 0)} sub={`${toFa(stock?.units ?? 0)} قلم موجود`} icon="box" tone="info" onClick={() => nav('/products')} />
        <StatCard label="اقساط معوق" value={moneyShort(ins?.overdueAmount ?? 0)} sub={`${toFa(ins?.overdue.length ?? 0)} قسط گذشته`} icon="alert" tone="danger" onClick={() => nav('/installments?tab=overdue')} />
      </div>

      {/* اقساط سررسید امروز */}
      <Card>
        <SectionTitle
          icon="calendar"
          title="اقساط سررسید امروز"
          subtitle={ins?.today.length ? `${toFa(ins.today.length)} قسط به مجموع ${money(ins.todayAmount)} ${unit}` : 'امروز سررسیدی ندارید'}
          action={<Button size="sm" variant="outline" iconRight="chevLeft" onClick={() => nav('/installments')}>همه</Button>}
        />
        {!ins?.today.length ? (
          <EmptyState icon="check" title="همه‌چیز مرتب است" hint="هیچ قسطی برای امروز ثبت نشده است." />
        ) : (
          <div className="rounded-xl border border-line divide-y divide-line overflow-hidden">
            {ins.today.slice(0, 6).map((i) => (
              <ListRow
                key={i.id}
                onClick={() => nav(`/customers/${i.customerId}`)}
                title={<CustomerName id={i.customerId} />}
                sub={`قسط ${toFa(i.idx)} • سررسید ${formatDate(i.dueDate)}`}
                left={
                  <div className="text-left">
                    <div className="text-sm font-bold nums text-danger">{money(i.amount - i.paidAmount)}</div>
                    <button
                      className="text-[11px] text-brand mt-0.5 whitespace-nowrap"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await addPayment({ customerId: i.customerId, amount: i.amount - i.paidAmount, date: base, method: 'cash', installmentId: i.id });
                        toast.push('واریزی ثبت و قسط تسویه شد', 'ok');
                      }}
                    >
                      ثبت تسویه
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* روند ۷ روز */}
        <Card>
          <SectionTitle icon="chart" title="روند فروش ۷ روز اخیر" subtitle={`${moneyShort(week?.reduce((a, d) => a + d.total, 0) ?? 0)} ${unit}`} />
          <Sparkline values={(week || []).map((d) => d.total)} height={70} />
          <div className="mt-3">
            <BarChart
              data={(week || []).map((d) => ({ label: toFa(Number(d.date.slice(8))), value: d.total }))}
              height={130}
              unit={unit}
            />
          </div>
        </Card>

        {/* فروش ماهانه */}
        <Card>
          <SectionTitle icon="layers" title="فروش ۶ ماه اخیر" subtitle={`سود تجمعی ${moneyShort(totals.monthProfit)} ${unit}`} />
          <BarChart
            data={(monthly || []).map((m) => ({ label: m.label, value: m.total, profit: m.profit }))}
            secondaryKey="profit"
            height={190}
            unit={unit}
          />
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* پرفروش‌ها */}
        <Card>
          <SectionTitle icon="spark" title="پرفروش‌ترین کالاهای ماه" subtitle={formatDate(mStart) + ' تا ' + formatDate(mEnd)}
            action={<Button size="sm" variant="ghost" onClick={() => nav('/reports')}>جزئیات</Button>} />
          {!top?.length ? <EmptyState icon="box" title="هنوز فروشی ثبت نشده" /> : (
            <ul className="space-y-2 min-w-0">
              {top.map((t, i) => (
                <li key={i} className="flex items-center gap-2.5 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-brand-soft text-brand text-[11px] font-bold flex items-center justify-center shrink-0">{toFa(i + 1)}</span>
                  <span className="flex-1 text-[13px] truncate">{t.name}</span>
                  <span className="text-[11px] text-muted nums shrink-0">{toFa(t.qty)} عدد</span>
                  <span className="text-[12px] font-semibold nums w-24 text-left shrink-0">{money(t.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* سهم دسته‌ها */}
        <Card>
          <SectionTitle icon="tag" title="سهم دسته‌بندی‌ها از فروش ماه" />
          {!cats?.length ? <EmptyState icon="tag" title="داده‌ای نیست" /> : (
            <Donut items={cats.map((c) => ({ label: c.name, value: c.value, color: c.color }))} centerLabel="فروش ماه" centerValue={moneyShort(totals.month) + ' ' + unit} />
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* هشدار موجودی */}
        <Card>
          <SectionTitle icon="alert" title="هشدار موجودی انبار"
            subtitle={stock ? `${toFa(stock.outOfStock.length)} ناموجود • ${toFa(stock.lowStock.length)} روبه‌اتمام` : ''}
            action={<Button size="sm" variant="outline" onClick={() => nav('/products?filter=low')}>مدیریت</Button>} />
          {!stock?.lowStock.length && !stock?.outOfStock.length ? (
            <EmptyState icon="check" title="موجودی انبار سالم است" />
          ) : (
            <div className="rounded-xl border border-line divide-y divide-line overflow-hidden">
              {[...stock.outOfStock, ...stock.lowStock].slice(0, 6).map((p) => (
                <ListRow
                  key={p.id}
                  title={p.name}
                  sub={`${p.brand || '—'} • نقطه سفارش ${toFa(p.minStock)}`}
                  left={<Badge tone={p.quantity <= 0 ? 'danger' : 'warn'}>{p.quantity <= 0 ? 'ناموجود' : `${toFa(p.quantity)} ${p.unit}`}</Badge>}
                  onClick={() => nav('/products?edit=' + p.id)}
                />
              ))}
            </div>
          )}
        </Card>

        {/* دسترسی سریع */}
        <Card>
          <SectionTitle icon="menu" title="دسترسی سریع" />
          <div className="grid grid-cols-3 gap-2">
            {[
              { to: '/sales/new', label: 'فروش جدید', icon: 'card' },
              { to: '/products?new=1', label: 'کالای جدید', icon: 'plus' },
              { to: '/customers?new=1', label: 'مشتری جدید', icon: 'users' },
              { to: '/installments?new=1', label: 'قسط‌بندی', icon: 'calendar' },
              { to: '/sms', label: 'پیامک انبوه', icon: 'send' },
              { to: '/backup', label: 'پشتیبان‌گیری', icon: 'database' },
            ].map((q) => (
              <button key={q.to} onClick={() => nav(q.to)} className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-line bg-surface2 hover:border-brand/40 transition text-[11px] text-muted min-w-0">
                <Icon name={q.icon} className="w-5 h-5 text-brand" />
                <span className="truncate w-full text-center">{q.label}</span>
              </button>
            ))}
          </div>
          {cfg.sms.autoSend && cfg.sms.mode === 'panel' ? (
            <div className="mt-3 rounded-xl bg-ok-soft text-ok text-[11px] px-3 py-2 leading-6">
              <Icon name="shield" className="w-4 h-4 inline-block ml-1" />
              ارسال خودکار پیامک سررسید فعال است.
            </div>
          ) : (
            <div className="mt-3 rounded-xl bg-warn-soft text-warn text-[11px] px-3 py-2 leading-6">
              ارسال خودکار فعال نیست — از «تنظیمات → پیامک» فعال کنید.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function CustomerName({ id }: { id: number }) {
  const c = useLiveQuery(() => db.customers.get(id), [id]);
  return <span className={cx('truncate', !c && 'text-muted')}>{c?.name || 'مشتری حذف‌شده'}</span>;
}
