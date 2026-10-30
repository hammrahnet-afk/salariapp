import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { addPayment, deletePayment } from '../lib/plans';
import { addDays, formatDate, todayKey } from '../lib/jalali';
import { money, moneyShort, toFa } from '../lib/format';
import { paymentsReport } from '../lib/reports';
import { Badge, Button, Card, Confirm, EmptyState, Field, Icon, IconButton, Input, ListRow, MoneyInput, SectionTitle, Segmented, Select, StatCard, useToast } from '../components/ui';
import { useApp } from '../state';

const METHOD_LABEL: Record<string, string> = { cash: 'نقدی', card: 'کارتخوان', transfer: 'کارت‌به‌کارت', cheque: 'چک', credit: 'نسیه' };
type Range = 'today' | 'week' | 'month' | 'all';

export default function Payments() {
  const toast = useToast();
  const { unit } = useApp();
  const [range, setRange] = useState<Range>('month');
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const base = todayKey();

  const bounds = useMemo(() => {
    if (range === 'today') return { from: base, to: base };
    if (range === 'week') return { from: addDays(base, -6), to: base };
    if (range === 'month') return { from: addDays(base, -29), to: base };
    return { from: '0000-00-00', to: '9999-99-99' };
  }, [range, base]);

  const data = useLiveQuery(() => paymentsReport(bounds.from, bounds.to), [bounds.from, bounds.to]);
  const names = useLiveQuery(async () => {
    const cs = await db.customers.toArray();
    return new Map(cs.map((c) => [c.id, c.name]));
  }, []) ?? new Map<number, string>();

  const rows = [...(data?.rows || [])].sort((a, b) => b.date.localeCompare(a.date) || (b.id! - a.id!));

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Card>
        <SectionTitle icon="wallet" title="واریزی‌های مشتریان" subtitle="ثبت دریافت وجه و تسویه اقساط"
          action={<Button size="sm" icon="plus" onClick={() => setOpen(true)}>واریزی جدید</Button>} />
        <Segmented value={range} onChange={setRange} options={[
          { value: 'today', label: 'امروز' }, { value: 'week', label: '۷ روز' },
          { value: 'month', label: '۳۰ روز' }, { value: 'all', label: 'همه' },
        ]} />
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
        <StatCard label="جمع واریزی" value={moneyShort(data?.total || 0)} sub={unit} icon="wallet" tone="ok" />
        <StatCard label="تعداد پرداخت" value={toFa(rows.length)} sub="فیش ثبت‌شده" icon="layers" tone="info" />
        <StatCard label="میانگین هر پرداخت" value={moneyShort(rows.length ? Math.round((data?.total || 0) / rows.length) : 0)} sub={unit} icon="chart" />
      </div>

      {data?.byMethod.length ? (
        <Card>
          <SectionTitle icon="card" title="تفکیک بر اساس روش دریافت" />
          <div className="flex flex-wrap gap-2">
            {data.byMethod.map((m) => (
              <Badge key={m.method} tone="neutral">{METHOD_LABEL[m.method] || m.method}: {moneyShort(m.amount)} {unit}</Badge>
            ))}
          </div>
        </Card>
      ) : null}

      <Card pad={false}>
        {!rows.length ? <EmptyState icon="wallet" title="واریزی‌ای در این بازه ثبت نشده" action={<Button icon="plus" onClick={() => setOpen(true)}>ثبت واریزی</Button>} /> : (
          <div className="divide-y divide-line">
            {rows.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-ok-soft text-ok flex items-center justify-center shrink-0"><Icon name="wallet" className="w-4 h-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate">{names.get(p.customerId) || 'مشتری حذف‌شده'}</p>
                  <p className="text-[11px] text-muted truncate">{formatDate(p.date)} • {METHOD_LABEL[p.method]}{p.installmentId ? ' • تسویه قسط' : ''}{p.note ? ` • ${p.note}` : ''}</p>
                </div>
                {p.smsSentAt ? <Badge tone="ok">رسید پیامک شد</Badge> : null}
                <span className="text-sm font-bold nums text-ok shrink-0">{money(p.amount)}</span>
                <IconButton name="trash" label="حذف" variant="danger" onClick={() => setConfirmId(p.id!)} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {open ? <QuickPayment onClose={() => setOpen(false)} /> : null}
      <Confirm open={confirmId !== null} onClose={() => setConfirmId(null)} danger confirmLabel="حذف"
        title="حذف واریزی" message="با حذف واریزی، مبلغ از قسط مرتبط کسر و قسط دوباره باز می‌شود."
        onConfirm={async () => { if (confirmId) { await deletePayment(confirmId); toast.push('واریزی حذف شد', 'ok'); } }} />
    </div>
  );
}

function QuickPayment({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { unit } = useApp();
  const customers = useLiveQuery(() => db.customers.where('archived').equals(0).toArray(), []) ?? [];
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayKey());
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer' | 'cheque' | 'credit'>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <Card className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl anim-sheet sm:anim-pop max-h-[90vh] overflow-y-auto">
        <SectionTitle icon="wallet" title="ثبت واریزی سریع" action={<IconButton name="close" label="بستن" onClick={onClose} />} />
        <div className="space-y-3">
          <Field label="مشتری" required>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">انتخاب کنید…</option>
              {customers.map((c) => <option key={c.id} value={String(c.id)}>{c.name}{c.phone ? ` • ${c.phone}` : ''}</option>)}
            </Select>
          </Field>
          <Field label={`مبلغ (${unit})`} required><MoneyInput value={amount} onChange={setAmount} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="تاریخ"><Input value={date} onChange={(e) => setDate(e.target.value)} className="nums" /></Field>
            <Field label="روش">
              <Select value={method} onChange={(e) => setMethod(e.target.value as any)}>
                {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="یادداشت"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <p className="text-[11px] text-muted leading-6">مبلغ به‌صورت خودکار به قدیمی‌ترین قسط باز این مشتری تخصیص می‌یابد.</p>
          <Button block icon="check" loading={busy} onClick={async () => {
            if (!customerId) { toast.push('مشتری را انتخاب کنید', 'warn'); return; }
            if (amount <= 0) { toast.push('مبلغ را وارد کنید', 'warn'); return; }
            setBusy(true);
            try {
              await addPayment({ customerId: Number(customerId), amount, date, method, note });
              toast.push('واریزی ثبت شد', 'ok');
              onClose();
            } catch (e: any) {
              toast.push(String(e?.message || e), 'danger');
            } finally { setBusy(false); }
          }}>ثبت واریزی</Button>
        </div>
      </Card>
    </div>
  );
}
