import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { addDays, formatDate, lastDays, monthRange, parseKey, todayKey } from '../lib/jalali';
import { money, moneyShort, percent, toFa } from '../lib/format';
import { customerDebtReport, installmentReport, paymentsReport, salesByDay, salesByCategory, salesByMonth, stockReport, summarize, topProducts } from '../lib/reports';
import { Badge, Button, Card, EmptyState, Field, Icon, Input, SectionTitle, Segmented, StatCard, cx } from '../components/ui';
import { BarChart, Donut, RankBars } from '../components/charts';
import { useApp } from '../state';

type Range = 'today' | 'week' | 'month' | 'quarter' | 'custom';

export default function Reports() {
  const { unit, cfg } = useApp();
  const [params] = useSearchParams();
  const base = todayKey();
  const [range, setRange] = useState<Range>((params.get('range') as Range) || 'month');
  const [from, setFrom] = useState(addDays(base, -29));
  const [to, setTo] = useState(base);

  const bounds = useMemo(() => {
    if (range === 'today') return { from: base, to: base, label: 'امروز' };
    if (range === 'week') return { from: addDays(base, -6), to: base, label: '۷ روز اخیر' };
    if (range === 'month') return { from: addDays(base, -29), to: base, label: '۳۰ روز اخیر' };
    if (range === 'quarter') return { from: addDays(base, -89), to: base, label: '۹۰ روز اخیر' };
    return { from, to, label: `${formatDate(from)} تا ${formatDate(to)}` };
  }, [range, from, to, base]);

  const sales = useLiveQuery(async () => db.sales.where('date').between(bounds.from, bounds.to, true, true).toArray(), [bounds.from, bounds.to]) ?? [];
  const summary = useMemo(() => summarize(sales), [sales]);
  const daily = useLiveQuery(() => salesByDay(bounds.from, bounds.to), [bounds.from, bounds.to]);
  const monthly = useLiveQuery(() => salesByMonth(6), []);
  const top = useLiveQuery(() => topProducts(bounds.from, bounds.to, 10), [bounds.from, bounds.to]);
  const byCat = useLiveQuery(() => salesByCategory(bounds.from, bounds.to), [bounds.from, bounds.to]);
  const debts = useLiveQuery(() => customerDebtReport(base), [base]);
  const ins = useLiveQuery(() => installmentReport(base, 30), [base]);
  const stock = useLiveQuery(() => stockReport(), []);
  const pays = useLiveQuery(() => paymentsReport(bounds.from, bounds.to), [bounds.from, bounds.to]);
  const moves = useLiveQuery(async () => {
    const rows = await db.stockMoves.where('date').between(bounds.from, bounds.to, true, true).toArray();
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [bounds.from, bounds.to]) ?? [];

  const walkIns = sales.filter((s) => s.walkIn);
  const named = sales.filter((s) => !s.walkIn);

  function exportCsv() {
    const header = ['تاریخ', 'کد فاکتور', 'مشتری', 'نوع', 'جمع', 'تخفیف', 'دریافتی', 'باقی', 'سود', 'روش'];
    const rows = [...sales].sort((a, b) => a.date.localeCompare(b.date)).map((s) => [
      s.date, s.code, s.customerName, s.walkIn ? 'روزانه' : 'ثبت‌شده',
      s.total, s.discount, s.paid, s.debt, s.profit, s.method,
    ]);
    const csv = '\ufeff' + [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `salari-sales-${bounds.from}_${bounds.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <Card>
        <SectionTitle icon="chart" title="گزارش‌های پیشرفته" subtitle={bounds.label}
          action={<div className="flex gap-2 no-print">
            <Button size="sm" variant="outline" icon="download" onClick={exportCsv}>خروجی CSV</Button>
            <Button size="sm" variant="outline" icon="print" onClick={() => window.print()}>چاپ</Button>
          </div>} />
        <div className="flex flex-wrap gap-2 items-center">
          <Segmented value={range} onChange={setRange} options={[
            { value: 'today', label: 'امروز' }, { value: 'week', label: '۷ روز' },
            { value: 'month', label: '۳۰ روز' }, { value: 'quarter', label: '۹۰ روز' }, { value: 'custom', label: 'بازه دلخواه' },
          ]} />
          {range === 'custom' ? (
            <div className="flex gap-2">
              <Input value={from} onChange={(e) => setFrom(e.target.value)} className="w-32 nums" />
              <Input value={to} onChange={(e) => setTo(e.target.value)} className="w-32 nums" />
            </div>
          ) : null}
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="جمع فروش" value={money(summary.total)} sub={`${toFa(summary.count)} فاکتور`} icon="cash" />
        <StatCard label="سود ناخالص" value={money(summary.profit)} sub={`${percent(summary.profit, summary.total)} حاشیه`} icon="chart" tone="ok" />
        <StatCard label="میانگین سبد" value={money(summary.avgTicket)} sub="هر فاکتور" icon="layers" tone="info" />
        <StatCard label="تخفیفات" value={money(summary.discount)} sub={percent(summary.discount, summary.subtotal) + ' از فروش'} icon="tag" tone="warn" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="فروش روزانه (گذرا)" value={moneyShort(summary.walkInTotal)} sub={`${toFa(walkIns.length)} فاکتور`} icon="users" tone="info" />
        <StatCard label="فروش مشتری‌دار" value={moneyShort(summary.customerTotal)} sub={`${toFa(named.length)} فاکتور`} icon="users" />
        <StatCard label="دریافتی دوره" value={moneyShort(summary.paid)} sub={`${toFa(pays?.rows.length || 0)} واریزی`} icon="wallet" tone="ok" />
        <StatCard label="باقی‌مانده دوره" value={moneyShort(summary.debt)} sub="مطالبات جدید" icon="alert" tone="danger" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon="chart" title="نمودار فروش روزانه" subtitle={bounds.label} />
          {!daily?.length ? <EmptyState icon="chart" title="داده‌ای نیست" /> : (
            <BarChart data={daily.map((d) => ({ label: toFa(Number(d.date.slice(8))), value: d.total, profit: d.profit }))} secondaryKey="profit" height={200} unit={unit} />
          )}
        </Card>
        <Card>
          <SectionTitle icon="layers" title="روند ۶ ماه اخیر" />
          <BarChart data={(monthly || []).map((m) => ({ label: m.label, value: m.total, profit: m.profit }))} secondaryKey="profit" height={200} unit={unit} />
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon="spark" title="پرفروش‌ترین کالاها" subtitle="بر اساس مبلغ فروش" />
          {!top?.length ? <EmptyState icon="box" title="فروشی در این بازه نیست" /> : <RankBars items={top.map((t) => ({ label: `${t.name} (${toFa(t.qty)} عدد)`, value: t.revenue }))} unit={unit} />}
        </Card>
        <Card>
          <SectionTitle icon="tag" title="سهم دسته‌بندی‌ها" />
          {!byCat?.length ? <EmptyState icon="tag" title="داده‌ای نیست" /> : <Donut items={byCat.map((c) => ({ label: c.name, value: c.revenue, color: c.color }))} centerLabel="فروش بازه" centerValue={moneyShort(summary.total) + ' ' + unit} />}
        </Card>
      </div>

      <Card>
        <SectionTitle icon="users" title="گزارش مطالبات مشتریان" subtitle="مانده حساب، اقساط باز و معوقات"
          action={<Button size="sm" variant="ghost" icon="download" onClick={() => downloadCsv('customers', [
            ['مشتری', 'موبایل', 'مانده', 'فاکتور', 'اقساط باز', 'معوق', 'سررسید بعدی'],
            ...(debts || []).map((d) => [d.customer.name, d.customer.phone, d.balance, d.salesCount, d.openInstallments, d.overdue, d.nextDue || '']),
          ])}>خروجی</Button>} />
        {!debts?.length ? <EmptyState icon="users" title="مشتری‌ای ثبت نشده" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[620px]">
              <thead className="bg-surface2 text-muted text-[11px]">
                <tr>
                  <th className="text-right font-medium p-2.5">مشتری</th>
                  <th className="text-left font-medium p-2.5">موبایل</th>
                  <th className="text-left font-medium p-2.5">مانده</th>
                  <th className="text-left font-medium p-2.5">فاکتور</th>
                  <th className="text-left font-medium p-2.5">اقساط باز</th>
                  <th className="text-left font-medium p-2.5">معوق</th>
                  <th className="text-left font-medium p-2.5">سررسید بعدی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {debts.map((d) => (
                  <tr key={d.customer.id} className="hover:bg-surface2/60">
                    <td className="p-2.5 truncate max-w-[160px]">{d.customer.name}</td>
                    <td className="p-2.5 text-left nums" dir="ltr">{d.customer.phone || '—'}</td>
                    <td className={cx('p-2.5 text-left nums font-semibold', d.balance > 0 ? 'text-danger' : 'text-ok')}>{money(d.balance)}</td>
                    <td className="p-2.5 text-left nums">{toFa(d.salesCount)}</td>
                    <td className="p-2.5 text-left nums">{toFa(d.openInstallments)}</td>
                    <td className="p-2.5 text-left nums text-danger">{d.overdue ? money(d.overdue) : '—'}</td>
                    <td className="p-2.5 text-left nums">{d.nextDue ? formatDate(d.nextDue) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon="calendar" title="گزارش اقساط" subtitle="۳۰ روز آینده" />
          <div className="grid grid-cols-2 gap-2.5">
            <Mini label="سررسید امروز" value={money(ins?.todayAmount || 0)} tone="danger" count={ins?.today.length} />
            <Mini label="معوق" value={money(ins?.overdueAmount || 0)} tone="warn" count={ins?.overdue.length} />
            <Mini label="۷ روز آینده" value={money(ins?.weekAmount || 0)} tone="info" />
            <Mini label="۳۰ روز آینده" value={money(ins?.monthAmount || 0)} tone="neutral" />
          </div>
          <div className="mt-3 space-y-1.5">
            {(ins?.overdue || []).slice(0, 5).map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 text-[12px] min-w-0">
                <span className="truncate">{i.planCode} • قسط {toFa(i.idx)}</span>
                <span className="nums text-danger shrink-0">{money(i.amount - i.paidAmount)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle icon="box" title="گزارش انبار" />
          <div className="grid grid-cols-2 gap-2.5">
            <Mini label="ارزش فروش انبار" value={money(stock?.atSell || 0)} tone="neutral" count={stock?.units} />
            <Mini label="ارزش خرید انبار" value={money(stock?.atCost || 0)} tone="neutral" />
            <Mini label="سود بالقوه" value={money(stock?.potentialProfit || 0)} tone="ok" />
            <Mini label="کالاهای فعال" value={stock?.products || 0} tone="info" count={undefined} plain />
          </div>
          <div className="mt-3">
            <RankBars items={(stock?.byCategory || []).map((c) => ({ label: c.name, value: c.value }))} unit={unit} />
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle icon="truck" title="گردش انبار در بازه" subtitle={`${toFa(moves.length)} سند انبار`} />
        {!moves.length ? <EmptyState icon="truck" title="حرکتی ثبت نشده" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[520px]">
              <thead className="bg-surface2 text-muted text-[11px]">
                <tr>
                  <th className="text-right font-medium p-2.5">تاریخ</th>
                  <th className="text-right font-medium p-2.5">کالا</th>
                  <th className="text-right font-medium p-2.5">نوع</th>
                  <th className="text-left font-medium p-2.5">مقدار</th>
                  <th className="text-right font-medium p-2.5">دلیل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {moves.slice(0, 60).map((m) => (
                  <tr key={m.id}>
                    <td className="p-2.5 nums">{formatDate(m.date)}</td>
                    <td className="p-2.5 truncate max-w-[180px]">{m.productName}</td>
                    <td className="p-2.5">{moveLabel(m.type)}</td>
                    <td className={cx('p-2.5 text-left nums', m.qty < 0 ? 'text-danger' : 'text-ok')}>{m.qty > 0 ? '+' : ''}{toFa(m.qty)}</td>
                    <td className="p-2.5 text-muted truncate max-w-[180px]">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Mini({ label, value, tone, count, plain }: { label: string; value: number | string; tone: 'danger' | 'warn' | 'ok' | 'info' | 'neutral'; count?: number; plain?: boolean }) {
  const tones = { danger: 'text-danger', warn: 'text-warn', ok: 'text-ok', info: 'text-info', neutral: '' };
  return (
    <div className="rounded-xl border border-line bg-surface2/60 p-2.5 min-w-0">
      <p className="text-[10px] text-muted truncate">{label}</p>
      <p className={cx('text-[14px] font-bold nums truncate', tones[tone])}>{typeof value === 'string' ? value : plain ? toFa(value) : money(value)}</p>
      {count !== undefined ? <p className="text-[10px] text-muted">{toFa(count)} مورد</p> : null}
    </div>
  );
}

function moveLabel(t: string) {
  return ({ in: 'ورود', out: 'خروج', adjust: 'اصلاح', sale: 'فروش', return: 'مرجوعی' } as Record<string, string>)[t] || t;
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = '\ufeff' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `salari-${name}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
