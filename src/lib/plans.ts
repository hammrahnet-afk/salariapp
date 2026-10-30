import { db, nextSeq, type Installment, type InstallmentPlan, type PayMethod, type Payment } from './db';
import { addDays, addMonths, todayKey, type DateKey } from './jalali';
import { makeCode } from './format';

/** ساخت تقویم سررسیدها */
export function generateSchedule(
  startDate: DateKey,
  count: number,
  interval: number,
  mode: 'days' | 'months' = 'months',
): DateKey[] {
  const out: DateKey[] = [];
  for (let i = 1; i <= count; i++) {
    out.push(mode === 'months' ? addMonths(startDate, interval * i) : addDays(startDate, interval * i));
  }
  return out;
}

export interface NewPlanInput {
  customerId: number;
  saleId?: number | null;
  title?: string;
  totalAmount: number;
  downPayment?: number;
  count: number;
  startDate: DateKey;
  interval: number;
  mode: 'days' | 'months';
  note?: string;
}

/** ساخت قرارداد قسطی + زمان‌بندی اقساط.
 *  نکته حسابداری: قسط‌بندی فقط «زمان‌بندی» بدهی موجود است و بدهی جدید ایجاد نمی‌کند. */
export async function createPlan(input: NewPlanInput): Promise<number> {
  if (!input.customerId) throw new Error('مشتری را انتخاب کنید.');
  if (input.count < 1 || input.count > 240) throw new Error('تعداد اقساط باید بین ۱ تا ۲۴۰ باشد.');
  const financeable = Math.round(Number(input.totalAmount) - (Number(input.downPayment) || 0));
  if (financeable <= 0) throw new Error('مبلغ قابل تقسیط باید بیشتر از صفر باشد.');

  const per = Math.round(financeable / input.count);
  const code = makeCode('P', await nextSeq('planSeq'));
  const dueDates = generateSchedule(input.startDate, input.count, input.interval, input.mode);

  return db.transaction('rw', db.plans, db.installments, db.sales, async () => {
    const planId = (await db.plans.add({
      code,
      customerId: input.customerId,
      saleId: input.saleId ?? null,
      title: input.title || 'قرارداد اقساط',
      totalAmount: Number(input.totalAmount),
      downPayment: Number(input.downPayment) || 0,
      count: input.count,
      perInstallment: per,
      startDate: input.startDate,
      intervalDays: input.mode === 'months' ? Math.round(input.interval * 30.4) : input.interval,
      intervalMode: input.mode,
      note: input.note || '',
      status: 'active',
      createdAt: todayKey(),
    } as InstallmentPlan)) as number;

    const rows: Installment[] = dueDates.map((due, i) => ({
      planId,
      planCode: code,
      customerId: input.customerId,
      idx: i + 1,
      // گرد باقی‌مانده روی آخرین قسط تا جمع اقساط دقیقاً برابر مبلغ باشد
      amount: i === dueDates.length - 1 ? financeable - per * (dueDates.length - 1) : per,
      dueDate: due,
      paidAmount: 0,
      paidDate: null,
      status: 'pending',
      notified: false,
      smsSentAt: null,
    }));
    await db.installments.bulkAdd(rows);

    if (input.saleId) {
      await db.sales.update(input.saleId, { planId });
    }
    return planId;
  });
}

export async function deletePlan(planId: number): Promise<void> {
  await db.transaction('rw', db.plans, db.installments, db.sales, async () => {
    await db.installments.where('planId').equals(planId).delete();
    const plan = await db.plans.get(planId);
    if (plan?.saleId) await db.sales.update(plan.saleId, { planId: null });
    await db.plans.delete(planId);
  });
}

/** ثبت واریزی مشتری و تخصیص خودکار به قدیمی‌ترین اقساط باز (FIFO) */
export async function addPayment(input: {
  customerId: number;
  amount: number;
  date: DateKey;
  method?: PayMethod;
  installmentId?: number | null;
  note?: string;
}): Promise<number> {
  const amount = Math.round(Number(input.amount) || 0);
  if (amount <= 0) throw new Error('مبلغ واریزی باید بیشتر از صفر باشد.');

  return db.transaction('rw', db.payments, db.installments, db.plans, async () => {
    const paymentId = (await db.payments.add({
      customerId: input.customerId,
      amount,
      date: input.date,
      method: input.method || 'cash',
      installmentId: input.installmentId ?? null,
      planId: null,
      note: input.note || '',
      smsSentAt: null,
      createdAt: todayKey(),
    } as Payment)) as number;

    let remaining = amount;

    if (input.installmentId) {
      remaining -= await applyToInstallment(input.installmentId, remaining);
    } else {
      // تخصیص خودکار: قدیمی‌ترین قسط سررسیدشده/باز اول
      const open = await db.installments
        .where('customerId')
        .equals(input.customerId)
        .and((i) => i.status === 'pending' && i.paidAmount < i.amount)
        .sortBy('dueDate');
      for (const ins of open) {
        if (remaining <= 0) break;
        remaining -= await applyToInstallment(ins.id!, remaining);
      }
    }
    return paymentId;
  });
}

/** اعمال مبلغ روی یک قسط؛ مبلغ اعمال‌شده را برمی‌گرداند */
async function applyToInstallment(installmentId: number, maxAmount: number): Promise<number> {
  const ins = await db.installments.get(installmentId);
  if (!ins || ins.status === 'cancelled') return 0;
  const need = ins.amount - ins.paidAmount;
  if (need <= 0) return 0;
  const apply = Math.min(need, maxAmount);
  const paidAmount = ins.paidAmount + apply;
  const done = paidAmount >= ins.amount;
  await db.installments.update(installmentId, {
    paidAmount,
    status: done ? 'paid' : 'pending',
    paidDate: done ? todayKey() : ins.paidDate ?? null,
  });
  if (done) await refreshPlanStatus(ins.planId);
  return apply;
}

async function refreshPlanStatus(planId: number): Promise<void> {
  const all = await db.installments.where('planId').equals(planId).toArray();
  const open = all.filter((i) => i.status === 'pending');
  await db.plans.update(planId, { status: open.length === 0 ? 'done' : 'active' });
}

export async function deletePayment(paymentId: number): Promise<void> {
  const p = await db.payments.get(paymentId);
  if (!p) return;
  await db.transaction('rw', db.payments, db.installments, async () => {
    if (p.installmentId) {
      const ins = await db.installments.get(p.installmentId);
      if (ins) {
        await db.installments.update(ins.id!, {
          paidAmount: Math.max(0, ins.paidAmount - p.amount),
          status: 'pending',
          paidDate: null,
        });
      }
    }
    await db.payments.delete(paymentId);
  });
}

export interface PlanStats {
  paid: number;
  remaining: number;
  paidCount: number;
  openCount: number;
  overdue: number;
  nextDue?: Installment;
}

export function planStats(installments: Installment[], base = todayKey()): PlanStats {
  const paid = installments.reduce((s, i) => s + i.paidAmount, 0);
  const total = installments.reduce((s, i) => s + i.amount, 0);
  const open = installments.filter((i) => i.status === 'pending');
  const overdue = open.filter((i) => i.dueDate < base);
  const nextDue = [...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  return {
    paid,
    remaining: total - paid,
    paidCount: installments.filter((i) => i.status === 'paid').length,
    openCount: open.length,
    overdue: overdue.reduce((s, i) => s + (i.amount - i.paidAmount), 0),
    nextDue,
  };
}
