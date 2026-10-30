import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PayMethod } from '../lib/db';
import { addPayment, createPlan, deletePlan } from '../lib/plans';
import { balanceOf } from '../lib/inventory';
import { dueLabel, formatDate, relativeDay, todayKey } from '../lib/jalali';
import { money, moneyInWords, toFa } from '../lib/format';
import { Badge, Button, Card, Confirm, EmptyState, Field, Icon, IconButton, Input, ListRow, Modal, MoneyInput, Progress, SectionTitle, Segmented, Select, Textarea, cx, useToast } from '../components/ui';
import { useApp } from '../state';
import { copyToClipboard, logSms, renderTemplate, smsParts, smsUri } from '../lib/sms';
import { UNIT_LABEL } from '../lib/settings';

type Tab = 'ledger' | 'installments' | 'sales' | 'sms';

const METHOD_LABEL: Record<PayMethod, string> = { cash: 'نقدی', card: 'کارتخوان', transfer: 'کارت‌به‌کارت', cheque: 'چک', credit: 'نسیه' };

export default function CustomerDetail() {
  const { id } = useParams();
  const cid = Number(id);
  const nav = useNavigate();
  const { cfg } = useApp();
  const toast = useToast();
  const base = todayKey();
  const [tab, setTab] = useState<Tab>('ledger');
  const [payOpen, setPayOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState<number | null>(null);

  const customer = useLiveQuery(() => db.customers.get(cid), [cid]);
  const sales = useLiveQuery(async () => (await db.sales.where('customerId').equals(cid).toArray()).sort((a, b) => b.date.localeCompare(a.date)), [cid]) ?? [];
  const payments = useLiveQuery(async () => (await db.payments.where('customerId').equals(cid).toArray()).sort((a, b) => b.date.localeCompare(a.date)), [cid]) ?? [];
  const plans = useLiveQuery(() => db.plans.where('customerId').equals(cid).toArray(), [cid]) ?? [];
  const installments = useLiveQuery(() => db.installments.where('customerId').equals(cid).sortBy('dueDate'), [cid]) ?? [];
  const sms = useLiveQuery(async () => (await db.smsLogs.where('customerId').equals(cid).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [cid]) ?? [];

  const balance = useMemo(() => (customer ? balanceOf(customer, sales, payments) : 0), [customer, sales, payments]);
  const openIns = installments.filter((i) => i.status === 'pending' && i.paidAmount < i.amount);
  const overdue = openIns.filter((i) => i.dueDate < base);

  const ledger = useMemo(() => {
    const rows: { date: string; title: string; sub?: string; debit: number; credit: number; running: number }[] = [];
    if (!customer) return rows;
    if (customer.openingBalance) {
      rows.push({
        date: customer.openingDate || customer.createdAt,
        title: 'مانده از قبل',
        sub: customer.openingBalance > 0 ? 'بدهکار به فروشگاه' : 'بستانکار از فروشگاه',
        debit: Math.max(0, customer.openingBalance),
        credit: Math.max(0, -customer.openingBalance),
        running: 0,
      });
    }
    for (const s of sales) rows.push({ date: s.date, title: `فاکتور ${s.code}`, sub: `${s.walkIn ? 'روزگذر' : 'فروش'} • ${METHOD_LABEL[s.method]}`, debit: s.total, credit: s.paid, running: 0 });
    for (const p of payments) rows.push({ date: p.date, title: 'واریزی مشتری', sub: METHOD_LABEL[p.method] + (p.note ? ` • ${p.note}` : ''), debit: 0, credit: p.amount, running: 0 });
    rows.sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    return rows.map((r) => {
      running += r.debit - r.credit;
      return { ...r, running };
    });
  }, [customer, sales, payments]);

  if (!customer) {
    return <Card><EmptyState icon="users" title="مشتری یافت نشد" action={<Button onClick={() => nav('/customers')}>بازگشت</Button>} /></Card>;
  }

  const unit = UNIT_LABEL(cfg);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <button onClick={() => nav('/customers')} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink no-print">
        <Icon name="chevRight" className="w-4 h-4" /> بازگشت به مشتریان
      </button>

      <Card>
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-12 h-12 rounded-2xl bg-brand text-brand-ink flex items-center justify-center text-lg font-bold shrink-0">{customer.name.slice(0, 1)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold truncate">{customer.name}</h2>
            <p className="text-[12px] text-muted nums truncate" dir="ltr">{customer.phone || 'بدون شماره تماس'}</p>
            {customer.address ? <p className="text-[11px] text-muted truncate mt-0.5">{customer.address}</p> : null}
          </div>
          <div className="text-left shrink-0 min-w-0">
            <p className="text-[10px] text-muted">مانده حساب</p>
            <p className={cx('text-lg font-bold nums truncate', balance > 0 ? 'text-danger' : balance < 0 ? 'text-ok' : '')}>
              {money(Math.abs(balance))}
            </p>
            <p className="text-[10px] text-muted">{balance === 0 ? 'تسویه' : balance > 0 ? `${unit} بدهکار` : `${unit} بستانکار`}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <MiniStat label="اقساط باز" value={toFa(openIns.length)} tone="info" />
          <MiniStat label="معوق" value={money(overdue.reduce((a, i) => a + (i.amount - i.paidAmount), 0))} tone="danger" />
          <MiniStat label="فاکتورها" value={toFa(sales.length)} tone="neutral" />
        </div>

        <div className="flex flex-wrap gap-2 mt-3 no-print">
          <Button size="sm" icon="wallet" onClick={() => setPayOpen(true)}>ثبت واریزی</Button>
          <Button size="sm" variant="outline" icon="calendar" onClick={() => setPlanOpen(true)}>قسط‌بندی</Button>
          <Button size="sm" variant="outline" icon="card" onClick={() => nav(`/sales/new?customer=${cid}`)}>فروش جدید</Button>
          {customer.phone ? (
            <Button size="sm" variant="soft" icon="message" onClick={async () => {
              const msg = renderTemplate(cfg.sms.templates.due, {
                name: customer.name, amount: money(openIns[0]?.amount || 0), unit, due: formatDate(openIns[0]?.dueDate),
                idx: openIns[0]?.idx ?? 1, count: 1, debt: money(balance), late: 0, shop: cfg.shop.name, phone: cfg.shop.phone, date: formatDate(base),
              });
              await logSms({ phone: customer.phone, message: msg, status: 'manual', provider: 'native', kind: 'manual', customerId: cid, customerName: customer.name });
              window.location.href = smsUri(customer.phone, msg);
            }}>ارسال پیامک</Button>
          ) : null}
          {customer.phone ? (
            <IconButton name="phone" label="تماس" variant="outline" onClick={() => { window.location.href = `tel:${customer.phone}`; }} />
          ) : null}
        </div>
      </Card>

      <Segmented value={tab} onChange={setTab} options={[
        { value: 'ledger', label: 'گردش حساب', icon: 'layers' },
        { value: 'installments', label: 'اقساط', icon: 'calendar' },
        { value: 'sales', label: 'فاکتورها', icon: 'card' },
        { value: 'sms', label: 'پیامک‌ها', icon: 'message' },
      ]} />

      {tab === 'ledger' ? (
        <Card pad={false}>
          {!ledger.length ? <EmptyState icon="layers" title="تراکنشی ثبت نشده" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] min-w-[560px]">
                <thead className="bg-surface2 text-muted text-[11px]">
                  <tr>
                    <th className="text-right font-medium p-2.5 w-28">تاریخ</th>
                    <th className="text-right font-medium p-2.5">شرح</th>
                    <th className="text-left font-medium p-2.5 w-28">بدهکار</th>
                    <th className="text-left font-medium p-2.5 w-28">بستانکار</th>
                    <th className="text-left font-medium p-2.5 w-28">مانده</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ledger.map((r, i) => (
                    <tr key={i} className="hover:bg-surface2/60">
                      <td className="p-2.5 nums whitespace-nowrap text-muted">{formatDate(r.date)}</td>
                      <td className="p-2.5 min-w-0">
                        <span className="block truncate">{r.title}</span>
                        {r.sub ? <span className="block text-[10px] text-muted truncate">{r.sub}</span> : null}
                      </td>
                      <td className="p-2.5 text-left nums text-danger whitespace-nowrap">{r.debit ? money(r.debit) : '—'}</td>
                      <td className="p-2.5 text-left nums text-ok whitespace-nowrap">{r.credit ? money(r.credit) : '—'}</td>
                      <td className={cx('p-2.5 text-left nums font-semibold whitespace-nowrap', r.running > 0 ? 'text-danger' : 'text-ok')}>{money(r.running)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'installments' ? (
        <div className="space-y-3">
          {plans.map((p) => {
            const items = installments.filter((i) => i.planId === p.id);
            const paid = items.reduce((a, i) => a + i.paidAmount, 0);
            const total = items.reduce((a, i) => a + i.amount, 0);
            return (
              <Card key={p.id}>
                <SectionTitle
                  icon="calendar"
                  title={`${p.title} • ${p.code}`}
                  subtitle={`${toFa(p.count)} قسط • هر قسط ${money(p.perInstallment)} ${unit}`}
                  action={<>
                    <Badge tone={p.status === 'done' ? 'ok' : p.status === 'cancelled' ? 'neutral' : 'brand'}>{p.status === 'done' ? 'تسویه شده' : p.status === 'cancelled' ? 'لغو شده' : 'فعال'}</Badge>
                    <IconButton name="trash" label="حذف قرارداد" variant="danger" className="mr-1" onClick={() => setConfirmPlan(p.id!)} />
                  </>}
                />
                <Progress value={paid} max={total} tone="ok" />
                <p className="text-[11px] text-muted mt-1.5">پرداخت‌شده {money(paid)} از {money(total)} {unit} {p.downPayment ? `• پیش‌پرداخت ${money(p.downPayment)}` : ''}</p>
                <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {items.map((i) => {
                    const l = dueLabel(i.dueDate, base);
                    const done = i.status === 'paid';
                    return (
                      <div key={i.id} className={cx('rounded-xl border p-2.5 min-w-0', done ? 'border-ok/30 bg-ok-soft/40' : i.dueDate < base ? 'border-danger/30 bg-danger-soft/40' : 'border-line bg-surface2/50')}>
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <span className="text-[12px] font-semibold truncate">قسط {toFa(i.idx)}</span>
                          <span className="text-[12px] font-bold nums shrink-0">{money(i.amount - i.paidAmount)}</span>
                        </div>
                        <p className="text-[10px] text-muted truncate mt-0.5">{formatDate(i.dueDate)}</p>
                        <div className="flex items-center justify-between gap-2 mt-1.5">
                          {done ? <Badge tone="ok">تسویه</Badge> : <Badge tone={l.tone}>{l.text}</Badge>}
                          {!done ? (
                            <button className="text-[11px] text-brand whitespace-nowrap" onClick={async () => {
                              await addPayment({ customerId: cid, amount: i.amount - i.paidAmount, date: base, method: 'cash', installmentId: i.id });
                              toast.push(`قسط ${toFa(i.idx)} تسویه شد`, 'ok');
                            }}>ثبت تسویه</button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
          {!plans.length ? <Card><EmptyState icon="calendar" title="قرارداد اقساطی نیست" hint="با دکمه «قسط‌بندی» برای این مشتری برنامه اقساط بسازید." action={<Button icon="plus" onClick={() => setPlanOpen(true)}>قسط‌بندی جدید</Button>} /></Card> : null}
        </div>
      ) : null}

      {tab === 'sales' ? (
        <Card pad={false}>
          {!sales.length ? <EmptyState icon="card" title="فاکتوری ثبت نشده" /> : (
            <div className="divide-y divide-line">
              {sales.map((s) => (
                <ListRow key={s.id} onClick={() => nav(`/sales/${s.id}`)}
                  title={<span className="nums">{s.code}</span>}
                  sub={`${formatDate(s.date)} • ${METHOD_LABEL[s.method]}${s.discount ? ` • تخفیف ${money(s.discount)}` : ''}`}
                  left={<div className="text-left"><span className="block text-sm font-bold nums">{money(s.total)}</span>{s.debt > 0 ? <span className="block text-[10px] text-danger nums">باقی {money(s.debt)}</span> : <span className="block text-[10px] text-ok">تسویه</span>}</div>} />
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'sms' ? (
        <Card pad={false}>
          {!sms.length ? <EmptyState icon="message" title="پیامکی ارسال نشده" /> : (
            <div className="divide-y divide-line">
              {sms.map((s) => (
                <div key={s.id} className="p-3 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 mb-1">
                    <Badge tone={s.status === 'sent' ? 'ok' : s.status === 'failed' ? 'danger' : s.status === 'queued' ? 'warn' : 'neutral'}>
                      {s.status === 'sent' ? 'ارسال شد' : s.status === 'failed' ? 'ناموفق' : s.status === 'queued' ? 'در صف' : 'دستی'}
                    </Badge>
                    <span className="text-[11px] text-muted nums truncate" dir="ltr">{s.phone}</span>
                    <span className="text-[10px] text-muted mr-auto shrink-0">{formatDate(s.date)}</span>
                  </div>
                  <p className="text-[12px] leading-6 whitespace-pre-wrap">{s.message}</p>
                  {s.error ? <p className="text-[11px] text-danger mt-1">{s.error}</p> : null}
                  <div className="flex gap-2 mt-1.5 no-print">
                    <button className="text-[11px] text-brand" onClick={async () => { await copyToClipboard(s.message); toast.push('متن کپی شد', 'ok'); }}>کپی متن</button>
                    <button className="text-[11px] text-brand" onClick={() => { window.location.href = smsUri(s.phone, s.message); }}>باز کردن در اپ پیامک</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {payOpen ? <PaymentModal customerId={cid} onClose={() => setPayOpen(false)} openInstallments={openIns} /> : null}
      {planOpen ? <PlanModal customerId={cid} customerName={customer.name} debt={balance} onClose={() => setPlanOpen(false)} /> : null}
      <Confirm open={confirmPlan !== null} onClose={() => setConfirmPlan(null)} title="حذف قرارداد اقساط" danger confirmLabel="حذف کن"
        message="قرارداد و زمان‌بندی اقساط آن حذف می‌شود. اصل بدهی در گردش حساب باقی می‌ماند."
        onConfirm={async () => { if (confirmPlan) { await deletePlan(confirmPlan); toast.push('قرارداد حذف شد', 'ok'); } }} />
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: 'danger' | 'ok' | 'info' | 'neutral' }) {
  const tones = { danger: 'text-danger', ok: 'text-ok', info: 'text-info', neutral: '' };
  return (
    <div className="rounded-xl bg-surface2 border border-line p-2.5 min-w-0">
      <p className="text-[10px] text-muted truncate">{label}</p>
      <p className={cx('text-[14px] font-bold nums truncate', tones[tone])}>{value}</p>
    </div>
  );
}

export function PaymentModal({ customerId, onClose, openInstallments, defaultInstallment }: { customerId: number; onClose: () => void; openInstallments: { id?: number; idx: number; amount: number; paidAmount: number; dueDate: string }[]; defaultInstallment?: number }) {
  const { cfg } = useApp();
  const toast = useToast();
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayKey());
  const [method, setMethod] = useState<PayMethod>('cash');
  const [insId, setInsId] = useState<string>(defaultInstallment ? String(defaultInstallment) : '');
  const [note, setNote] = useState('');
  const [sendSms, setSendSms] = useState(true);
  const [busy, setBusy] = useState(false);
  const customer = useLiveQuery(() => db.customers.get(customerId), [customerId]);
  const balance = useLiveQuery(async () => {
    const [s, p] = await Promise.all([db.sales.where('customerId').equals(customerId).toArray(), db.payments.where('customerId').equals(customerId).toArray()]);
    const c = await db.customers.get(customerId);
    return c ? balanceOf(c, s, p) : 0;
  }, [customerId]) ?? 0;

  async function submit() {
    if (amount <= 0) { toast.push('مبلغ واریزی را وارد کنید', 'warn'); return; }
    setBusy(true);
    try {
      const pid = await addPayment({ customerId, amount, date, method, installmentId: insId ? Number(insId) : null, note });
      if (sendSms && customer?.phone) {
        const msg = renderTemplate(cfg.sms.templates.receipt, {
          name: customer.name, amount: money(amount), unit: UNIT_LABEL(cfg),
          date: formatDate(date), debt: money(Math.max(0, balance - amount)), shop: cfg.shop.name, phone: cfg.shop.phone,
        });
        await db.payments.update(pid, { smsSentAt: new Date().toISOString() });
        await logSms({ phone: customer.phone, message: msg, status: 'manual', provider: 'native', kind: 'receipt', customerId, customerName: customer.name });
        window.location.href = smsUri(customer.phone, msg);
      }
      toast.push('واریزی ثبت شد', 'ok');
      onClose();
    } catch (e: any) {
      toast.push(String(e?.message || e), 'danger');
    } finally { setBusy(false); }
  }

  const nextIns = openInstallments.find((i) => String(i.id) === insId) || openInstallments[0];

  return (
    <Modal open onClose={onClose} title="ثبت واریزی مشتری" size="md"
      footer={<><Button variant="outline" onClick={onClose}>انصراف</Button><Button icon="check" loading={busy} onClick={submit}>ثبت واریزی</Button></>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="مبلغ واریزی" required className="sm:col-span-2">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        {amount > 0 ? <p className="sm:col-span-2 -mt-1 text-[11px] text-muted">{moneyInWords(amount)} {UNIT_LABEL(cfg)}</p> : null}
        <Field label="تاریخ"><Input value={date} onChange={(e) => setDate(e.target.value)} className="nums" placeholder="1404-08-08" /></Field>
        <Field label="روش دریافت">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
            {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="تخصیص به قسط" hint="خالی بگذارید تا به قدیمی‌ترین قسط باز تخصیص یابد" className="sm:col-span-2">
          <Select value={insId} onChange={(e) => setInsId(e.target.value)}>
            <option value="">تخصیص خودکار (FIFO)</option>
            {openInstallments.map((i) => <option key={i.id} value={String(i.id)}>قسط {toFa(i.idx)} — {money(i.amount - i.paidAmount)} ({formatDate(i.dueDate)})</option>)}
          </Select>
        </Field>
        <Field label="یادداشت" className="sm:col-span-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً کارت‌به‌کارت از بانک ملی" /></Field>

        <div className="sm:col-span-2 rounded-xl border border-line bg-surface2 p-3 space-y-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} className="w-4 h-4 accent-teal-600" />
            ارسال پیامک رسید واریز به مشتری
          </label>
          {customer?.phone ? (
            <p className="text-[11px] text-muted leading-6 whitespace-pre-wrap">{renderTemplate(cfg.sms.templates.receipt, {
              name: customer.name, amount: money(amount || 0), unit: UNIT_LABEL(cfg), date: formatDate(date),
              debt: money(Math.max(0, balance - amount)), shop: cfg.shop.name, phone: cfg.shop.phone,
            })}</p>
          ) : <p className="text-[11px] text-warn">شماره موبایل مشتری ثبت نشده است.</p>}
          {nextIns && !insId ? <p className="text-[11px] text-info">به قسط {toFa(nextIns.idx)} سررسید {formatDate(nextIns.dueDate)} تخصیص می‌یابد.</p> : null}
          {smsParts(renderTemplate(cfg.sms.templates.receipt, { name: '', amount: '', unit: '', date: '', debt: '', shop: '', phone: '' })) > 1 ? <p className="text-[10px] text-muted">این پیام بیش از یک پیامک است.</p> : null}
        </div>
      </div>
    </Modal>
  );
}

export function PlanModal({ customerId, customerName, debt, onClose, saleId, saleTotal }: { customerId: number; customerName: string; debt: number; onClose: () => void; saleId?: number; saleTotal?: number }) {
  const toast = useToast();
  const [title, setTitle] = useState(saleId ? 'اقساط فاکتور' : 'قرارداد اقساط');
  const [total, setTotal] = useState(saleTotal ?? Math.max(0, debt));
  const [down, setDown] = useState(0);
  const [count, setCount] = useState(6);
  const [interval, setInterval] = useState(1);
  const [mode, setMode] = useState<'days' | 'months'>('months');
  const [start, setStart] = useState(todayKey());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const financeable = Math.max(0, total - down);
  const per = count > 0 ? Math.round(financeable / count) : 0;

  async function submit() {
    setBusy(true);
    try {
      await createPlan({ customerId, saleId: saleId ?? null, title, totalAmount: total, downPayment: down, count, startDate: start, interval, mode, note });
      toast.push('قرارداد اقساط ساخته شد', 'ok');
      onClose();
    } catch (e: any) {
      toast.push(String(e?.message || e), 'danger');
    } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`قسط‌بندی برای ${customerName}`} size="md"
      footer={<><Button variant="outline" onClick={onClose}>انصراف</Button><Button icon="check" loading={busy} onClick={submit}>ساخت قرارداد</Button></>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="عنوان قرارداد" className="sm:col-span-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="مبلغ کل"><MoneyInput value={total} onChange={setTotal} /></Field>
        <Field label="پیش‌پرداخت"><MoneyInput value={down} onChange={setDown} /></Field>
        <Field label="تعداد اقساط">
          <div className="flex items-center gap-2">
            <IconButton name="close" label="کم" variant="outline" onClick={() => setCount(Math.max(1, count - 1))} className="rotate-45" />
            <Input value={toFa(count)} onChange={(e) => setCount(Math.max(1, Number(e.target.value.replace(/[^\d۰-۹]/g, '')) || 1))} className="text-center nums" />
            <IconButton name="plus" label="زیاد" variant="outline" onClick={() => setCount(Math.min(240, count + 1))} />
          </div>
        </Field>
        <Field label="فاصله سررسید">
          <div className="flex gap-2">
            <Input value={toFa(interval)} onChange={(e) => setInterval(Math.max(1, Number(e.target.value.replace(/[^\d۰-۹]/g, '')) || 1))} className="w-16 text-center nums" />
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'days' | 'months')}>
              <option value="months">ماه</option>
              <option value="days">روز</option>
            </Select>
          </div>
        </Field>
        <Field label="تاریخ شروع"><Input value={start} onChange={(e) => setStart(e.target.value)} className="nums" placeholder="1404-08-08" /></Field>
        <Field label="یادداشت"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="sm:col-span-2 rounded-xl bg-brand-soft text-brand p-3 text-[12px] leading-7">
          مبلغ قابل تقسیط: <b className="nums">{money(financeable)}</b> • هر قسط: <b className="nums">{money(per)}</b>
          <br />اولین سررسید تقریباً {mode === 'months' ? `${interval} ماه` : `${interval} روز`} پس از تاریخ شروع است.
        </div>
      </div>
    </Modal>
  );
}
