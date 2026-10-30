import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Customer, type Installment } from '../lib/db';
import { addPayment } from '../lib/plans';
import { diffDays, dueLabel, formatDate, todayKey } from '../lib/jalali';
import { money, moneyShort, toFa } from '../lib/format';
import { Badge, Button, Card, EmptyState, Field, Icon, IconButton, Input, Modal, MoneyInput, SectionTitle, Segmented, Select, StatCard, cx, useToast } from '../components/ui';
import { useApp } from '../state';
import { dispatch, logSms, renderTemplate, smsUri } from '../lib/sms';
import { UNIT_LABEL } from '../lib/settings';

type Tab = 'today' | 'overdue' | 'upcoming' | 'all';

export default function Installments() {
  const nav = useNavigate();
  const { cfg, unit } = useApp();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const base = todayKey();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'today');
  const [newOpen, setNewOpen] = useState(!!params.get('new'));
  const [q, setQ] = useState('');

  const rows = useLiveQuery(async () => {
    const [installments, customers, plans] = await Promise.all([
      db.installments.toArray(),
      db.customers.toArray(),
      db.plans.toArray(),
    ]);
    const cMap = new Map(customers.map((c) => [c.id, c]));
    const pMap = new Map(plans.map((p) => [p.id, p]));
    return installments
      .filter((i) => i.status === 'pending' && i.paidAmount < i.amount)
      .map((i) => ({ ins: i, customer: cMap.get(i.customerId), plan: pMap.get(i.planId) }))
      .sort((a, b) => a.ins.dueDate.localeCompare(b.ins.dueDate));
  }, []) ?? [];

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(({ ins, customer }) => {
      if (tab === 'today' && ins.dueDate !== base) return false;
      if (tab === 'overdue' && ins.dueDate >= base) return false;
      if (tab === 'upcoming' && ins.dueDate <= base) return false;
      if (term && !(customer?.name || '').toLowerCase().includes(term) && !ins.planCode.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, tab, base, q]);

  const sums = useMemo(() => ({
    today: rows.filter((r) => r.ins.dueDate === base).reduce((a, r) => a + (r.ins.amount - r.ins.paidAmount), 0),
    overdue: rows.filter((r) => r.ins.dueDate < base).reduce((a, r) => a + (r.ins.amount - r.ins.paidAmount), 0),
    upcoming: rows.filter((r) => r.ins.dueDate > base).reduce((a, r) => a + (r.ins.amount - r.ins.paidAmount), 0),
    count: rows.length,
  }), [rows, base]);

  /** ارسال دسته‌جمعی پیامک برای فهرست جاری */
  async function bulkSend() {
    const targets = filtered.filter((r) => r.customer?.phone);
    if (!targets.length) { toast.push('شماره موبایل معتبری در این فهرست نیست', 'warn'); return; }
    let sent = 0, failed = 0;
    for (const { ins, customer } of targets) {
      const kind = ins.dueDate < base ? 'overdue' : 'due';
      const out = await dispatch(
        { cfg, unit, shopName: cfg.shop.name },
        {
          installmentId: ins.id!,
          phone: customer!.phone,
          customerId: ins.customerId,
          customerName: customer!.name,
          kind,
          vars: {
            name: customer!.name,
            amount: money(ins.amount - ins.paidAmount),
            unit,
            due: formatDate(ins.dueDate),
            idx: ins.idx,
            count: 1,
            debt: money(ins.amount - ins.paidAmount),
            late: Math.max(0, diffDays(ins.dueDate, base)),
            shop: cfg.shop.name,
            phone: cfg.shop.phone,
            date: formatDate(base),
          },
        },
      );
      if (out.status === 'sent') sent++;
      else failed++;
      await db.installments.update(ins.id!, { notified: true, smsSentAt: new Date().toISOString() });
    }
    toast.push(cfg.sms.mode === 'panel' ? `${toFa(sent)} پیامک ارسال شد` : `${toFa(targets.length)} پیامک در صف ارسال قرار گرفت`, sent ? 'ok' : 'warn');
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Card>
        <SectionTitle icon="calendar" title="مدیریت اقساط مشتریان" subtitle={`${toFa(sums.count)} قسط باز`}
          action={<Button size="sm" icon="plus" onClick={() => setNewOpen(true)}>قرارداد جدید</Button>} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <StatCard label="سررسید امروز" value={moneyShort(sums.today)} sub={unit} icon="calendar" tone="danger" onClick={() => setTab('today')} />
          <StatCard label="معوق" value={moneyShort(sums.overdue)} sub={unit} icon="alert" tone="warn" onClick={() => setTab('overdue')} />
          <StatCard label="آینده" value={moneyShort(sums.upcoming)} sub={unit} icon="clock" tone="info" onClick={() => setTab('upcoming')} />
          <StatCard label="کل مطالبات اقساطی" value={moneyShort(sums.today + sums.overdue + sums.upcoming)} sub={unit} icon="wallet" onClick={() => setTab('all')} />
        </div>
        <div className="flex flex-wrap gap-2 items-center mt-3">
          <Segmented value={tab} onChange={setTab} options={[
            { value: 'today', label: 'امروز' }, { value: 'overdue', label: 'معوق' },
            { value: 'upcoming', label: 'آینده' }, { value: 'all', label: 'همه' },
          ]} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی مشتری یا کد قرارداد…" className="w-auto min-w-[170px] flex-1" />
          <Button size="sm" variant="soft" icon="send" onClick={bulkSend}>ارسال پیامک این فهرست</Button>
        </div>
      </Card>

      {!filtered.length ? (
        <Card><EmptyState icon="calendar" title="قسطی در این بخش نیست" hint="با ساخت قرارداد اقساط برای مشتری، سررسیدها خودکار محاسبه و یادآوری می‌شود."
          action={<Button icon="plus" onClick={() => setNewOpen(true)}>قرارداد جدید</Button>} /></Card>
      ) : (
        <Card pad={false}>
          <div className="divide-y divide-line">
            {filtered.map(({ ins, customer, plan }) => {
              const l = dueLabel(ins.dueDate, base);
              return (
                <InstallmentRow key={ins.id} ins={ins} customer={customer} planCode={plan?.code} planTitle={plan?.title} label={l.text} tone={l.tone} base={base} />
              );
            })}
          </div>
        </Card>
      )}

      {newOpen ? <NewPlanDialog onClose={() => { setNewOpen(false); params.delete('new'); setParams(params, { replace: true }); }} /> : null}
    </div>
  );

  function InstallmentRow({ ins, customer, planCode, planTitle, label, tone, base }: { ins: Installment; customer?: Customer; planCode?: string; planTitle?: string; label: string; tone: 'ok' | 'warn' | 'danger' | 'muted'; base: string }) {
    const [expanded, setExpanded] = useState(false);
    const [amount, setAmount] = useState(ins.amount - ins.paidAmount);
    const remaining = ins.amount - ins.paidAmount;

    async function settle() {
      await addPayment({ customerId: ins.customerId, amount: Math.min(amount, remaining), date: base, method: 'cash', installmentId: ins.id });
      toast.push(`قسط ${toFa(ins.idx)} تسویه شد`, 'ok');
    }

    async function sendSms() {
      if (!customer?.phone) { toast.push('شماره موبایل مشتری ثبت نشده', 'warn'); return; }
      const kind = ins.dueDate < base ? 'overdue' : 'due';
      const tpl = kind === 'overdue' ? cfg.sms.templates.overdue : cfg.sms.templates.due;
      const vars = {
        name: customer.name, amount: money(remaining), unit, due: formatDate(ins.dueDate),
        idx: ins.idx, count: 1, debt: money(remaining), late: Math.max(0, diffDays(ins.dueDate, base)),
        shop: cfg.shop.name, phone: cfg.shop.phone, date: formatDate(base),
      };
      const message = renderTemplate(tpl, vars);
      if (cfg.sms.mode === 'panel' && cfg.sms.autoSend) {
        const out = await dispatch({ cfg, unit, shopName: cfg.shop.name }, {
          installmentId: ins.id!, phone: customer.phone, customerId: ins.customerId,
          customerName: customer.name, kind, vars,
        });
        toast.push(out.status === 'sent' ? 'پیامک ارسال شد' : 'ارسال ناموفق: ' + out.error, out.status === 'sent' ? 'ok' : 'danger');
      } else {
        await logSms({ phone: customer.phone, message, status: 'manual', provider: 'native', kind, customerId: ins.customerId, customerName: customer.name, installmentId: ins.id });
        window.location.href = smsUri(customer.phone, message);
      }
      await db.installments.update(ins.id!, { notified: true, smsSentAt: new Date().toISOString() });
    }

    return (
      <div className="p-3 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className={cx('w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold shrink-0', tone === 'danger' ? 'bg-danger-soft text-danger' : tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-surface2 text-muted')}>
            {toFa(ins.idx)}
          </span>
          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
            <p className="text-[13px] font-semibold truncate">{customer?.name || 'مشتری حذف‌شده'}</p>
            <p className="text-[11px] text-muted truncate">{planTitle || 'قرارداد'} {planCode ? `• ${planCode}` : ''} • سررسید {formatDate(ins.dueDate)}</p>
          </div>
          <div className="text-left shrink-0 min-w-0">
            <p className="text-[13px] font-bold nums text-danger">{money(remaining)}</p>
            <Badge tone={tone === 'muted' ? 'neutral' : tone}>{label}</Badge>
          </div>
        </div>
        {expanded ? (
          <div className="mt-2.5 pt-2.5 border-t border-line flex flex-wrap items-end gap-2">
            <Field label="مبلغ دریافتی"><MoneyInput value={amount} onChange={setAmount} size="sm" unit={unit} className="w-36" /></Field>
            <Button size="sm" icon="check" onClick={settle}>ثبت تسویه</Button>
            <Button size="sm" variant="soft" icon="message" onClick={sendSms}>یادآوری پیامکی</Button>
            <Button size="sm" variant="ghost" icon="users" onClick={() => nav(`/customers/${ins.customerId}`)}>پرونده مشتری</Button>
          </div>
        ) : null}
      </div>
    );
  }
}

function NewPlanDialog({ onClose }: { onClose: () => void }) {
  const customers = useLiveQuery(() => db.customers.where('archived').equals(0).toArray(), []) ?? [];
  const [customerId, setCustomerId] = useState<string>('');
  const [total, setTotal] = useState(0);
  const [down, setDown] = useState(0);
  const [count, setCount] = useState(6);
  const [interval, setInterval] = useState(1);
  const [mode, setMode] = useState<'days' | 'months'>('months');
  const [start, setStart] = useState(todayKey());
  const [title, setTitle] = useState('قرارداد اقساط');
  const toast = useToast();
  const { unit } = useApp();

  const financeable = Math.max(0, total - down);
  const per = count > 0 ? Math.round(financeable / count) : 0;
  const selected = customers.find((c) => String(c.id) === customerId);

  return (
    <Modal open onClose={onClose} title="قرارداد اقساط جدید" size="md"
      footer={<>
        <Button variant="outline" onClick={onClose}>انصراف</Button>
        <Button icon="check" onClick={async () => {
          if (!customerId) { toast.push('مشتری را انتخاب کنید', 'warn'); return; }
          if (financeable <= 0) { toast.push('مبلغ قابل تقسیط نامعتبر است', 'warn'); return; }
          const { createPlan } = await import('../lib/plans');
          await createPlan({ customerId: Number(customerId), title, totalAmount: total, downPayment: down, count, startDate: start, interval, mode });
          toast.push('قرارداد اقساط ساخته شد', 'ok');
          onClose();
        }}>ساخت قرارداد</Button>
      </>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="مشتری" required className="sm:col-span-2">
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">انتخاب کنید…</option>
            {customers.map((c) => <option key={c.id} value={String(c.id)}>{c.name}{c.phone ? ` • ${c.phone}` : ''}</option>)}
          </Select>
        </Field>
        {selected && !selected.phone ? <p className="sm:col-span-2 text-[11px] text-warn">این مشتری شماره موبایل ندارد؛ پیامک یادآوری ارسال نمی‌شود.</p> : null}
        <Field label="عنوان"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="تاریخ شروع"><Input value={start} onChange={(e) => setStart(e.target.value)} className="nums" placeholder="1404-08-08" /></Field>
        <Field label="مبلغ کل"><MoneyInput value={total} onChange={setTotal} /></Field>
        <Field label="پیش‌پرداخت"><MoneyInput value={down} onChange={setDown} /></Field>
        <Field label="تعداد اقساط"><MoneyInput value={count} onChange={(n) => setCount(Math.max(1, Math.min(240, n)))} /></Field>
        <Field label="فاصله سررسید">
          <div className="flex gap-2">
            <MoneyInput value={interval} onChange={(n) => setInterval(Math.max(1, n))} className="w-20" />
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'days' | 'months')}>
              <option value="months">ماه</option><option value="days">روز</option>
            </Select>
          </div>
        </Field>
        <div className="sm:col-span-2 rounded-xl bg-brand-soft text-brand p-3 text-[12px] leading-7">
          مبلغ قابل تقسیط <b className="nums">{money(financeable)}</b> {unit} • هر قسط <b className="nums">{money(per)}</b>
        </div>
      </div>
    </Modal>
  );
}
