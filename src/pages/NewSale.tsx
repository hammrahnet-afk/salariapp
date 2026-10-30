import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PayMethod, type Product } from '../lib/db';
import { computeTotals, createSale } from '../lib/sales';
import { createPlan } from '../lib/plans';
import { formatDate, todayKey } from '../lib/jalali';
import { money, moneyInWords, toFa } from '../lib/format';
import { Badge, Button, Card, EmptyState, Field, Icon, IconButton, Input, MoneyInput, Modal, ProductThumb, SearchInput, SectionTitle, Select, cx, useToast } from '../components/ui';
import { useApp } from '../state';
import { UNIT_LABEL } from '../lib/settings';

interface Line { key: string; productId?: number; name: string; qty: number; price: number; cost: number; stock: number; unit: string }

const METHODS: { value: PayMethod; label: string }[] = [
  { value: 'cash', label: 'نقدی' },
  { value: 'card', label: 'کارتخوان' },
  { value: 'transfer', label: 'کارت‌به‌کارت' },
  { value: 'cheque', label: 'چک' },
  { value: 'credit', label: 'نسیه' },
];

export default function NewSale() {
  const nav = useNavigate();
  const toast = useToast();
  const { cfg, unit } = useApp();
  const [params] = useSearchParams();
  const preselect = params.get('customer') ? Number(params.get('customer')) : null;

  const [customerId, setCustomerId] = useState<number | null>(preselect);
  const [walkInName, setWalkInName] = useState('مشتری روزگذر');
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [saving, setSaving] = useState(false);
  const [planOpen, setPlanOpen] = useState<{ saleId: number; debt: number; code: string } | null>(null);

  const products = useLiveQuery(() => db.products.where('archived').equals(0).toArray(), []) ?? [];
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.customers.where('archived').equals(0).toArray(), []) ?? [];
  const customer = useLiveQuery(() => (customerId ? db.customers.get(customerId) : undefined), [customerId]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products
      .filter((p) => (!cat || p.categoryId === Number(cat)) && (!term || [p.name, p.brand, p.model, p.code].join(' ').toLowerCase().includes(term)))
      .slice(0, 40);
  }, [products, q, cat]);

  const totals = useMemo(() => computeTotals(lines, discount, paid, cfg.taxPercent), [lines, discount, paid, cfg.taxPercent]);

  function addProduct(p: Product) {
    setLines((ls) => {
      const found = ls.find((l) => l.productId === p.id);
      if (found) {
        return ls.map((l) => (l.key === found.key ? { ...l, qty: Math.min(l.stock, l.qty + 1) } : l));
      }
      return [...ls, { key: String(p.id), productId: p.id, name: p.name, qty: 1, price: p.sellPrice, cost: p.buyPrice, stock: p.quantity, unit: p.unit }];
    });
  }

  function setLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function submit() {
    if (!lines.length) { toast.push('حداقل یک کالا اضافه کنید', 'warn'); return; }
    if (!customerId && !walkInName.trim()) { toast.push('نام مشتری روزانه را وارد کنید', 'warn'); return; }
    for (const l of lines) {
      if (l.qty <= 0) { toast.push(`مقدار «${l.name}» نامعتبر است`, 'danger'); return; }
      if (l.productId && l.qty > l.stock) { toast.push(`موجودی «${l.name}» کافی نیست`, 'danger'); return; }
    }
    setSaving(true);
    try {
      const saleId = await createSale({
        date,
        customerId,
        customerName: customerId ? customer?.name || '' : walkInName.trim(),
        phone: customer?.phone,
        items: lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, price: l.price, cost: l.cost })),
        discount,
        paid: customerId ? paid : totals.total,
        method,
        walkIn: !customerId,
        note,
      }, cfg.taxPercent);
      toast.push('فاکتور ثبت و انبار به‌روز شد', 'ok');
      const debt = customerId ? Math.max(0, totals.total - paid) : 0;
      if (debt > 0 && customerId) {
        setPlanOpen({ saleId, debt, code: '' });
      } else {
        nav(`/sales/${saleId}`);
      }
    } catch (e: any) {
      toast.push(String(e?.message || e), 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4 max-w-6xl mx-auto items-start">
      <div className="space-y-4 min-w-0">
        {/* مشتری */}
        <Card>
          <SectionTitle icon="users" title="مشتری فاکتور" subtitle={customerId ? 'فروش اعتباری به مشتری ثبت‌شده' : 'فروش نقدی روزانه به مشتری گذرا'} />
          <div className="grid sm:grid-cols-2 gap-2.5">
            <Field label="مشتری ثبت‌شده" hint="برای مشتری روزانه خالی بگذارید">
              <Select value={customerId ? String(customerId) : ''} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— مشتری روزانه (گذرا) —</option>
                {customers.map((c) => <option key={c.id} value={String(c.id)}>{c.name}{c.phone ? ` • ${c.phone}` : ''}</option>)}
              </Select>
            </Field>
            {customerId ? (
              <div className="rounded-xl border border-line bg-surface2 p-2.5 min-w-0">
                <p className="text-[12px] font-medium truncate">{customer?.name}</p>
                <p className="text-[11px] text-muted nums truncate" dir="ltr">{customer?.phone || 'بدون شماره'}</p>
              </div>
            ) : (
              <Field label="نام مشتری روزانه"><Input value={walkInName} onChange={(e) => setWalkInName(e.target.value)} placeholder="مشتری روزگذر" /></Field>
            )}
          </div>
        </Card>

        {/* اقلام */}
        <Card>
          <SectionTitle icon="box" title="اقلام فاکتور" subtitle={`${toFa(lines.length)} قلم`}
            action={<Button size="sm" variant="outline" icon="plus" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>افزودن کالا</Button>} />
          {!lines.length ? (
            <EmptyState icon="card" title="هنوز کالایی اضافه نشده" hint="از فهرست پایین یا دکمه «افزودن کالا» انتخاب کنید." />
          ) : (
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="rounded-xl border border-line bg-surface2/50 p-2.5 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <ProductThumb name={l.name} size="sm" src={l.productId ? products.find((p) => p.id === l.productId)?.image : undefined} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate">{l.name}</p>
                      <p className="text-[10px] text-muted truncate">موجودی {toFa(l.stock)} {l.unit}</p>
                    </div>
                    <IconButton name="trash" label="حذف قلم" variant="danger" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <Field label="مقدار">
                      <div className="flex items-center gap-1">
                        <IconButton name="close" label="کم" variant="outline" className="rotate-45 w-8 h-8" onClick={() => setLine(l.key, { qty: Math.max(1, l.qty - 1) })} />
                        <Input value={toFa(l.qty)} onChange={(e) => setLine(l.key, { qty: Math.max(0, toNum(e.target.value)) })} className="text-center nums h-9" />
                        <IconButton name="plus" label="زیاد" variant="outline" className="w-8 h-8" onClick={() => setLine(l.key, { qty: Math.min(l.stock, l.qty + 1) })} />
                      </div>
                    </Field>
                    <Field label={`فی (${unit})`}><MoneyInput value={l.price} onChange={(n) => setLine(l.key, { price: n })} className="h-9" /></Field>
                    <Field label="جمع"><div className="h-9 px-2 rounded-xl bg-surface border border-line flex items-center justify-center nums text-[13px] font-semibold truncate">{money(l.qty * l.price)}</div></Field>
                  </div>
                  {l.qty > l.stock ? <p className="text-[11px] text-danger mt-1">بیش از موجودی انبار است.</p> : null}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* انتخاب کالا */}
        <Card>
          <SectionTitle icon="search" title="انتخاب کالا از انبار" subtitle="برای افزودن روی کالا بزنید" />
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[180px]"><SearchInput value={q} onChange={setQ} placeholder="جستجوی کالا…" /></div>
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto min-w-[130px]">
              <option value="">همه دسته‌ها</option>
              {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.icon} {c.name}</option>)}
            </Select>
          </div>
          {!shown.length ? <EmptyState icon="box" title="کالایی یافت نشد" /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
              {shown.map((p) => (
                <button key={p.id} type="button" disabled={p.quantity <= 0}
                  onClick={() => addProduct(p)}
                  className={cx('text-right rounded-xl border p-2 transition min-w-0', p.quantity <= 0 ? 'border-line opacity-50' : 'border-line hover:border-brand bg-surface2/50 active:scale-[.98]')}>
                  <div className="flex items-center gap-2 min-w-0">
                    <ProductThumb src={p.image} name={p.name} size="sm" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium truncate">{p.name}</p>
                      <p className="text-[11px] nums text-brand truncate">{money(p.sellPrice)}</p>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-1 min-w-0">
                    <Badge tone={p.quantity <= 0 ? 'danger' : p.quantity <= p.minStock ? 'warn' : 'ok'}>{toFa(p.quantity)} {p.unit}</Badge>
                    {p.brand ? <span className="text-[10px] text-muted truncate">{p.brand}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* جمع‌بندی */}
      <div className="lg:sticky lg:top-[70px] space-y-3 min-w-0">
        <Card>
          <SectionTitle icon="wallet" title="جمع‌بندی فاکتور" />
          <div className="space-y-2 text-[13px]">
            <Row label="جمع اقلام" value={money(totals.subtotal)} />
            {cfg.taxPercent ? <Row label={`مالیات ${toFa(cfg.taxPercent)}٪`} value={money(totals.total - (totals.subtotal - totals.discount))} /> : null}
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-muted truncate">تخفیف</span>
              <div className="w-32"><MoneyInput value={discount} onChange={setDiscount} className="h-9 text-right" /></div>
            </div>
            <div className="h-px bg-line my-1" />
            <Row label="مبلغ قابل پرداخت" value={money(totals.total)} bold />
            {customerId ? (
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-muted truncate">مبلغ دریافتی</span>
                <div className="w-32"><MoneyInput value={paid} onChange={setPaid} className="h-9 text-right" /></div>
              </div>
            ) : null}
            <Row label={customerId ? 'باقی‌مانده' : 'دریافت نقدی'} value={money(customerId ? totals.debt : totals.total)} tone={customerId && totals.debt > 0 ? 'danger' : 'ok'} bold />
            <Row label="سود فاکتور" value={money(totals.profit)} tone="ok" />
          </div>
          {totals.total > 0 ? <p className="text-[10px] text-muted mt-2 leading-5">{moneyInWords(totals.total)} {unit}</p> : null}

          <div className="grid grid-cols-2 gap-2 mt-3">
            <Field label="تاریخ"><Input value={date} onChange={(e) => setDate(e.target.value)} className="nums h-9" placeholder="1404-08-08" /></Field>
            <Field label="روش پرداخت">
              <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} className="h-9">
                {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="یادداشت فاکتور" className="mt-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="گارانتی، رنگ، تحویل و…" />
          </Field>

          <div className="flex gap-2 mt-3">
            <Button block icon="check" loading={saving} onClick={submit}>ثبت فاکتور</Button>
            <Button variant="outline" icon="refresh" onClick={() => { setLines([]); setDiscount(0); setPaid(0); setNote(''); }}>پاک کردن</Button>
          </div>
          <p className="text-[10px] text-muted mt-2 leading-5">
            {formatDate(date, true)} • با ثبت فاکتور، موجودی انبار به‌صورت خودکار کسر و سند انبار صادر می‌شود.
          </p>
        </Card>
      </div>

      {/* پیشنهاد قسط‌بندی */}
      {planOpen ? (
        <Modal open onClose={() => nav(`/sales/${planOpen.saleId}`)} title="مانده فاکتور را قسط‌بندی کنید؟" size="sm"
          footer={<>
            <Button variant="outline" onClick={() => nav(`/sales/${planOpen.saleId}`)}>بعداً</Button>
            <Button icon="calendar" onClick={async () => {
              if (!customerId) return;
              await createPlan({ customerId, saleId: planOpen.saleId, title: 'اقساط فاکتور', totalAmount: planOpen.debt, count: 6, startDate: todayKey(), interval: 1, mode: 'months' });
              toast.push('قرارداد اقساط ساخته شد', 'ok');
              nav(`/customers/${customerId}`);
            }}>قسط‌بندی ۶ ماهه</Button>
          </>}>
          <p className="text-sm text-muted leading-7">
            مانده این فاکتور <b className="nums text-danger">{money(planOpen.debt)}</b> {unit} است. می‌توانید همین حالا یک برنامه ۶ قسطه بسازید یا بعداً از صفحه مشتری اقدام کنید.
          </p>
        </Modal>
      ) : null}
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

function toNum(v: string): number {
  const n = Number(v.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
  return Number.isFinite(n) ? n : 0;
}
