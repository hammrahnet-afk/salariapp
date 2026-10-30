import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { deleteSale, getFullSale } from '../lib/sales';
import { formatDate } from '../lib/jalali';
import { money, moneyInWords, toFa } from '../lib/format';
import { Badge, Button, Card, Confirm, EmptyState, IconButton, SectionTitle, cx, useToast } from '../components/ui';
import { useApp } from '../state';
import { PlanModal } from './CustomerDetail';

const METHOD_LABEL: Record<string, string> = { cash: 'نقدی', card: 'کارتخوان', transfer: 'کارت‌به‌کارت', cheque: 'چک', credit: 'نسیه' };

export default function SaleDetail() {
  const { id } = useParams();
  const sid = Number(id);
  const nav = useNavigate();
  const toast = useToast();
  const { cfg, unit } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  const data = useLiveQuery(() => getFullSale(sid), [sid]);
  const customer = useLiveQuery(() => (data?.sale.customerId ? db.customers.get(data.sale.customerId) : undefined), [data?.sale.customerId]);

  if (!data) return <Card><EmptyState icon="card" title="فاکتور یافت نشد" action={<Button onClick={() => nav('/sales')}>بازگشت</Button>} /></Card>;
  const { sale, items } = data;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2 no-print">
        <button onClick={() => nav('/sales')} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <IconButton name="chevRight" label="بازگشت" /> بازگشت
        </button>
        <div className="flex gap-2">
          <IconButton name="print" label="چاپ فاکتور" variant="outline" onClick={() => window.print()} />
          <IconButton name="trash" label="حذف فاکتور" variant="danger" onClick={() => setConfirm(true)} />
        </div>
      </div>

      <Card>
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold nums">{sale.code}</h2>
            <p className="text-[12px] text-muted truncate">{formatDate(sale.date, true)}</p>
          </div>
          <div className="text-left min-w-0">
            <p className="text-[12px] font-semibold truncate">{sale.customerName}</p>
            {customer?.phone ? <p className="text-[11px] text-muted nums" dir="ltr">{customer.phone}</p> : null}
            <Badge tone={sale.walkIn ? 'info' : 'brand'} className="mt-1">{sale.walkIn ? 'مشتری روزانه' : 'مشتری ثبت‌شده'}</Badge>
          </div>
        </div>

        <div className="overflow-x-auto mt-3">
          <table className="w-full text-[13px] min-w-[420px]">
            <thead className="bg-surface2 text-muted text-[11px]">
              <tr>
                <th className="text-right font-medium p-2">ردیف</th>
                <th className="text-right font-medium p-2">کالا</th>
                <th className="text-left font-medium p-2">مقدار</th>
                <th className="text-left font-medium p-2">فی</th>
                <th className="text-left font-medium p-2">جمع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((it, i) => (
                <tr key={it.id}>
                  <td className="p-2 nums text-muted">{toFa(i + 1)}</td>
                  <td className="p-2 min-w-0"><span className="block truncate">{it.name}</span></td>
                  <td className="p-2 text-left nums">{toFa(it.qty)}</td>
                  <td className="p-2 text-left nums">{money(it.price)}</td>
                  <td className="p-2 text-left nums font-semibold">{money(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 space-y-1.5 text-[13px] border-t border-line pt-3">
          <Row label="جمع اقلام" value={money(sale.subtotal)} />
          {sale.discount ? <Row label="تخفیف" value={money(sale.discount)} tone="ok" /> : null}
          <Row label="مبلغ کل" value={money(sale.total)} bold />
          <Row label={`دریافتی (${METHOD_LABEL[sale.method]})`} value={money(sale.paid)} tone="ok" />
          <Row label="باقی‌مانده" value={money(sale.debt)} tone={sale.debt > 0 ? 'danger' : 'ok'} bold />
          <Row label="سود فاکتور" value={money(sale.profit)} />
        </div>
        <p className="text-[11px] text-muted mt-2 leading-6">{moneyInWords(sale.total)} {unit}</p>
        {sale.note ? <p className="text-[11px] text-muted mt-2 leading-6 border-t border-line pt-2">یادداشت: {sale.note}</p> : null}
        {cfg.invoiceFooter ? <p className="text-[10px] text-muted mt-2 text-center">{cfg.invoiceFooter}</p> : null}

        {sale.debt > 0 && sale.customerId && !sale.planId ? (
          <Button block icon="calendar" className="mt-3 no-print" onClick={() => setPlanOpen(true)}>قسط‌بندی مانده فاکتور</Button>
        ) : null}
        {sale.planId ? <p className="text-[11px] text-info mt-3">این فاکتور به یک قرارداد اقساط متصل است.</p> : null}
      </Card>

      {planOpen && sale.customerId ? (
        <PlanModal customerId={sale.customerId} customerName={sale.customerName} debt={sale.debt} saleId={sale.id} saleTotal={sale.debt} onClose={() => setPlanOpen(false)} />
      ) : null}

      <Confirm open={confirm} onClose={() => setConfirm(false)} danger confirmLabel="حذف فاکتور"
        title="حذف فاکتور فروش"
        message="با حذف فاکتور، موجودی کالاهای آن به انبار برمی‌گردد و سند انبار مرتبط حذف می‌شود."
        onConfirm={async () => { await deleteSale(sid); toast.push('فاکتور حذف و انبار اصلاح شد', 'ok'); nav('/sales'); }} />
    </div>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'ok' | 'danger' }) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className={cx('truncate', bold ? 'font-semibold' : 'text-muted')}>{label}</span>
      <span className={cx('nums truncate', bold && 'text-base font-bold', tone === 'ok' && 'text-ok', tone === 'danger' && 'text-danger')}>{value}</span>
    </div>
  );
}
