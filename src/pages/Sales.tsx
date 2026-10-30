import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { formatDate, todayKey, addDays } from '../lib/jalali';
import { money, moneyShort, toFa } from '../lib/format';
import { summarize } from '../lib/reports';
import { Badge, Button, Card, EmptyState, Field, Icon, Input, ListRow, SectionTitle, Segmented, Select, StatCard, cx } from '../components/ui';
import { useApp } from '../state';

type Range = 'today' | 'week' | 'month' | 'all' | 'custom';

const METHOD_LABEL: Record<string, string> = { cash: 'نقدی', card: 'کارتخوان', transfer: 'کارت‌به‌کارت', cheque: 'چک', credit: 'نسیه' };

export default function Sales() {
  const nav = useNavigate();
  const { unit } = useApp();
  const [range, setRange] = useState<Range>('week');
  const [from, setFrom] = useState(addDays(todayKey(), -30));
  const [to, setTo] = useState(todayKey());
  const [onlyWalkIn, setOnlyWalkIn] = useState(false);
  const [q, setQ] = useState('');

  const bounds = useMemo(() => {
    const base = todayKey();
    if (range === 'today') return { from: base, to: base };
    if (range === 'week') return { from: addDays(base, -6), to: base };
    if (range === 'month') return { from: addDays(base, -29), to: base };
    if (range === 'all') return { from: '0000-00-00', to: '9999-99-99' };
    return { from, to };
  }, [range, from, to]);

  const sales = useLiveQuery(async () => {
    const rows = (await db.sales.where('date').between(bounds.from, bounds.to, true, true).toArray())
      .sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0));
    const term = q.trim().toLowerCase();
    return rows.filter((s) => (!onlyWalkIn || s.walkIn) && (!term || [s.code, s.customerName].join(' ').toLowerCase().includes(term)));
  }, [bounds.from, bounds.to, q, onlyWalkIn]) ?? [];

  const s = useMemo(() => summarize(sales), [sales]);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Card>
        <SectionTitle icon="card" title="فاکتورهای فروش" subtitle={`${toFa(s.count)} فاکتور در بازه انتخابی`}
          action={<Button size="sm" icon="plus" onClick={() => nav('/sales/new')}>فروش جدید</Button>} />
        <div className="flex flex-wrap gap-2 items-center">
          <Segmented value={range} onChange={setRange} options={[
            { value: 'today', label: 'امروز' }, { value: 'week', label: '۷ روز' },
            { value: 'month', label: '۳۰ روز' }, { value: 'all', label: 'همه' }, { value: 'custom', label: 'بازه دلخواه' },
          ]} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی کد یا مشتری…" className="w-auto min-w-[150px] flex-1" />
          <label className="flex items-center gap-1.5 text-[12px] text-muted whitespace-nowrap">
            <input type="checkbox" checked={onlyWalkIn} onChange={(e) => setOnlyWalkIn(e.target.checked)} className="accent-teal-600 w-4 h-4" />
            فقط مشتریان روزانه
          </label>
        </div>
        {range === 'custom' ? (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Field label="از تاریخ"><Input value={from} onChange={(e) => setFrom(e.target.value)} className="nums" /></Field>
            <Field label="تا تاریخ"><Input value={to} onChange={(e) => setTo(e.target.value)} className="nums" /></Field>
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="جمع فروش" value={money(s.total)} sub={unit} icon="cash" />
        <StatCard label="سود" value={money(s.profit)} sub={`${toFa(s.count ? Math.round((s.profit / s.total) * 100) : 0)}٪ حاشیه`} icon="chart" tone="ok" />
        <StatCard label="دریافتی" value={money(s.paid)} sub="نقد و کارت" icon="wallet" tone="info" />
        <StatCard label="باقی‌مانده" value={money(s.debt)} sub="مطالبات این بازه" icon="alert" tone="danger" />
      </div>

      <Card pad={false}>
        {!sales.length ? (
          <EmptyState icon="card" title="فاکتوری در این بازه نیست" action={<Button icon="plus" onClick={() => nav('/sales/new')}>ثبت فروش</Button>} />
        ) : (
          <div className="divide-y divide-line">
            {sales.map((sale) => (
              <ListRow
                key={sale.id}
                onClick={() => nav(`/sales/${sale.id}`)}
                right={<span className={cx('w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold', sale.walkIn ? 'bg-info-soft text-info' : 'bg-brand-soft text-brand')}>{sale.walkIn ? 'روز' : 'مش'}</span>}
                title={<span className="nums">{sale.code}</span>}
                sub={`${formatDate(sale.date)} • ${sale.customerName} • ${METHOD_LABEL[sale.method]}`}
                left={
                  <div className="text-left min-w-0">
                    <span className="block text-sm font-bold nums">{money(sale.total)}</span>
                    {sale.debt > 0 ? <span className="block text-[10px] text-danger nums">باقی {money(sale.debt)}</span> : <span className="block text-[10px] text-ok">تسویه</span>}
                  </div>
                }
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
