import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Customer } from '../lib/db';
import { deleteCustomer, saveCustomer } from '../lib/inventory';
import { customerDebtReport, type CustomerDebt } from '../lib/reports';
import { formatDate, todayKey } from '../lib/jalali';
import { isValidPhone, money, moneyShort, normalizePhone, toFa } from '../lib/format';
import { Badge, Button, Card, Confirm, EmptyState, Field, IconButton, Input, Modal, MoneyInput, SearchInput, SectionTitle, Select, Textarea, cx, useToast } from '../components/ui';
import { useApp } from '../state';
import { smsUri } from '../lib/sms';

type Sort = 'balance' | 'name' | 'recent';

const emptyForm = (): Partial<Customer> => ({
  name: '', phone: '', phone2: '', address: '', openingBalance: 0, note: '', openingDate: todayKey(),
});

export default function Customers() {
  const nav = useNavigate();
  const { unit } = useApp();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('balance');
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const base = todayKey();

  const report = useLiveQuery(() => customerDebtReport(base), [base]) ?? [];

  useEffect(() => {
    if (params.get('new')) {
      setEditing(emptyForm());
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = report.filter((r) => !term || [r.customer.name, r.customer.phone, r.customer.phone2].join(' ').toLowerCase().includes(term));
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.customer.name.localeCompare(b.customer.name, 'fa');
      if (sort === 'recent') return (b.lastSale || '').localeCompare(a.lastSale || '');
      return b.balance - a.balance;
    });
  }, [report, q, sort]);

  const totalDebt = filtered.reduce((a, r) => a + Math.max(0, r.balance), 0);
  const totalCredit = filtered.reduce((a, r) => a + Math.min(0, r.balance), 0);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Card>
        <SectionTitle
          icon="users"
          title="مدیریت مشتریان"
          subtitle={`${toFa(filtered.length)} مشتری • مطالبات ${moneyShort(totalDebt)} ${unit}`}
          action={<Button size="sm" icon="plus" onClick={() => setEditing(emptyForm())}>مشتری جدید</Button>}
        />
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex-1 min-w-[200px]"><SearchInput value={q} onChange={setQ} placeholder="جستجوی نام یا شماره تماس…" /></div>
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-auto min-w-[130px]">
            <option value="balance">بیشترین بدهی</option>
            <option value="name">نام مشتری</option>
            <option value="recent">آخرین خرید</option>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2 mt-2.5">
          <Badge tone="danger">مطالبات {moneyShort(totalDebt)} {unit}</Badge>
          <Badge tone="ok">بستانکاری ما {moneyShort(Math.abs(totalCredit))} {unit}</Badge>
          <Badge tone="warn">{toFa(filtered.filter((r) => r.overdue > 0).length)} مشتری دارای قسط معوق</Badge>
        </div>
      </Card>

      {!filtered.length ? (
        <Card>
          <EmptyState
            icon="users"
            title={report.length ? 'مشتری‌ای یافت نشد' : 'هنوز مشتری ثبت نشده'}
            hint="با ثبت مشتری می‌توانید مانده قبلی، قسط‌بندی و پیامک یادآوری را فعال کنید."
            action={<Button icon="plus" onClick={() => setEditing(emptyForm())}>افزودن مشتری</Button>}
          />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {filtered.map((r) => (
            <CustomerCard
              key={r.customer.id}
              r={r}
              unit={unit}
              onOpen={() => nav(`/customers/${r.customer.id}`)}
              onEdit={() => setEditing(r.customer)}
              onDelete={() => setConfirmId(r.customer.id!)}
            />
          ))}
        </div>
      )}

      {editing ? <CustomerForm c={editing} onClose={() => setEditing(null)} /> : null}

      <Confirm
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        title="حذف مشتری"
        message="مشتری فقط در صورتی حذف می‌شود که فاکتوری نداشته باشد؛ در غیر این صورت آن را بایگانی کنید."
        confirmLabel="حذف کن"
        danger
        onConfirm={async () => {
          try {
            if (confirmId) await deleteCustomer(confirmId);
            toast.push('مشتری حذف شد', 'ok');
          } catch (e: any) {
            toast.push(String(e?.message || e), 'danger');
          }
        }}
      />
    </div>
  );
}

/* ------------------------------ فرم مشتری ------------------------------- */

function CustomerForm({ c, onClose }: { c: Partial<Customer>; onClose: () => void }) {
  const toast = useToast();
  const { unit } = useApp();
  const [form, setForm] = useState<Partial<Customer>>({ ...emptyForm(), ...c });
  const [sign, setSign] = useState<'debt' | 'credit'>((c.openingBalance ?? 0) < 0 ? 'credit' : 'debt');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const amount = Math.abs(Number(form.openingBalance) || 0);
  const set = (p: Partial<Customer>) => setForm((f) => ({ ...f, ...p }));

  async function submit() {
    if (!form.name?.trim()) { setErr('نام مشتری الزامی است.'); return; }
    if (form.phone && !isValidPhone(form.phone)) { setErr('شماره موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷).'); return; }
    setBusy(true);
    try {
      await saveCustomer({
        ...form,
        phone: normalizePhone(form.phone || ''),
        phone2: normalizePhone(form.phone2 || ''),
        openingBalance: sign === 'credit' ? -amount : amount,
      });
      toast.push(form.id ? 'مشتری به‌روزرسانی شد' : 'مشتری اضافه شد', 'ok');
      onClose();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={form.id ? 'ویرایش مشتری' : 'مشتری جدید'}
      size="md"
      footer={<>
        <Button variant="outline" onClick={onClose}>انصراف</Button>
        <Button icon="check" loading={busy} onClick={submit}>{form.id ? 'ذخیره تغییرات' : 'افزودن مشتری'}</Button>
      </>}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="نام و نام خانوادگی" required className="sm:col-span-2">
          <Input value={form.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="مثلاً علی محمدی" />
        </Field>
        <Field label="موبایل" hint="برای پیامک یادآوری لازم است">
          <Input value={form.phone || ''} onChange={(e) => set({ phone: e.target.value })} placeholder="09121234567" inputMode="tel" className="nums text-left" />
        </Field>
        <Field label="موبایل دوم">
          <Input value={form.phone2 || ''} onChange={(e) => set({ phone2: e.target.value })} className="nums text-left" inputMode="tel" />
        </Field>

        <Field label={`مانده از قبل (${unit})`} hint="بدهی یا بستانکاری مشتری پیش از شروع کار با سامانه" className="sm:col-span-2">
          <div className="flex gap-2">
            <Select value={sign} onChange={(e) => setSign(e.target.value as 'debt' | 'credit')} className="w-[130px] shrink-0">
              <option value="debt">بدهکار به ما</option>
              <option value="credit">بستانکار از ما</option>
            </Select>
            <MoneyInput value={amount} onChange={(n) => set({ openingBalance: sign === 'credit' ? -n : n })} className="flex-1" />
          </div>
        </Field>

        <Field label="آدرس" className="sm:col-span-2">
          <Input value={form.address || ''} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <Field label="یادداشت" className="sm:col-span-2">
          <Textarea value={form.note || ''} onChange={(e) => set({ note: e.target.value })} />
        </Field>
        {err ? <p className="sm:col-span-2 text-[12px] text-danger">{err}</p> : null}
      </div>
    </Modal>
  );
}

/* ------------------------------- کارت مشتری ------------------------------ */

function CustomerCard({ r, unit, onOpen, onEdit, onDelete }: { r: CustomerDebt; unit: string; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const c = r.customer;
  const tone = r.balance > 0 ? 'danger' : r.balance < 0 ? 'ok' : 'neutral';
  return (
    <Card className="min-w-0">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand flex items-center justify-center font-bold shrink-0">{c.name.slice(0, 1)}</span>
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onOpen}>
          <p className="text-sm font-semibold truncate">{c.name}</p>
          <p className="text-[11px] text-muted nums truncate" dir="ltr">{c.phone || 'بدون شماره'}</p>
        </div>
        <div className="flex gap-0.5 shrink-0">
          <IconButton name="edit" label="ویرایش" onClick={onEdit} />
          <IconButton name="trash" label="حذف" variant="danger" onClick={onDelete} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 min-w-0">
        <div className="min-w-0">
          <p className="text-[10px] text-muted truncate">مانده حساب</p>
          <p className={cx('text-[13px] font-bold nums truncate', r.balance > 0 ? 'text-danger' : r.balance < 0 ? 'text-ok' : '')}>
            {money(Math.abs(r.balance))}{' '}
            <span className="text-[10px] font-normal">{r.balance === 0 ? '' : r.balance > 0 ? 'بدهکار' : 'بستانکار'}</span>
          </p>
        </div>
        <div className="min-w-0 text-left">
          <p className="text-[10px] text-muted truncate">سررسید بعدی</p>
          <p className="text-[13px] font-semibold truncate">{r.nextDue ? formatDate(r.nextDue) : '—'}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        <Badge tone={tone}>{toFa(r.salesCount)} فاکتور</Badge>
        {r.openInstallments ? <Badge tone="info">{toFa(r.openInstallments)} قسط باز</Badge> : null}
        {r.overdue > 0 ? <Badge tone="danger">معوق {moneyShort(r.overdue)}</Badge> : null}
      </div>
      <div className="flex gap-1.5 mt-3">
        <Button size="sm" variant="outline" block icon="eye" onClick={onOpen}>جزئیات</Button>
        {c.phone ? (
          <Button size="sm" variant="soft" icon="message" onClick={() => { window.location.href = smsUri(c.phone, `سلام ${c.name} عزیز`); }}>پیامک</Button>
        ) : null}
      </div>
      <p className="sr-only">{unit}</p>
    </Card>
  );
}
