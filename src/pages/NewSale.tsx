import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PayMethod, type Product } from '../lib/db';
import { computeTotals, createSale } from '../lib/sales';
import { createPlan } from '../lib/plans';
import { formatDate, todayKey } from '../lib/jalali';
import { money, moneyInWords, toFa } from '../lib/format';
import {
  AmountRow, Badge, Button, Card, Combobox, EmptyState, Field, Icon, IconButton, Input, MoneyInput,
  Modal, ProductThumb, SectionTitle, Select, Stepper, cx, useToast,
} from '../components/ui';
import { useApp } from '../state';

interface Line { key: string; productId?: number; name: string; qty: number; price: number; cost: number; stock: number; unit: string; image?: string }

const METHODS: { value: PayMethod; label: string; icon: string }[] = [
  { value: 'cash', label: 'نقدی', icon: 'cash' },
  { value: 'card', label: 'کارتخوان', icon: 'card' },
  { value: 'transfer', label: 'کارت‌به‌کارت', icon: 'wallet' },
  { value: 'cheque', label: 'چک', icon: 'edit' },
  { value: 'credit', label: 'نسیه', icon: 'clock' },
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
  const [cat, setCat] = useState('');
  const [saving, setSaving] = useState(false);
  const [planOpen, setPlanOpen] = useState<{ saleId: number; debt: number } | null>(null);

  const products = useLiveQuery(() => db.products.where('archived').equals(0).toArray(), []) ?? [];
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.customers.where('archived').equals(0).toArray(), []) ?? [];
  const customer = useLiveQuery(() => (customerId ? db.customers.get(customerId) : undefined), [customerId]);

  /** گزینه‌های لیست کشویی کالا (جستجوپذیر) */
  const productOptions = useMemo(
    () => products
      .filter((p) => !cat || p.categoryId === Number(cat))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'))
      .map((p) => ({
        value: String(p.id),
        label: p.name,
        hint: [p.brand, p.model ? `مدل ${p.model}` : '', p.code].filter(Boolean).join(' • '),
        keywords: `${p.code} ${p.brand || ''} ${p.model || ''}`,
        disabled: p.quantity <= 0,
        trailing: (
          <span className="flex flex-col items-end gap-1">
            <span className="text-[11px] font-bold nums whitespace-nowrap">{money(p.sellPrice)}</span>
            <Badge tone={p.quantity <= 0 ? 'danger' : p.quantity <= p.minStock ? 'warn' : 'ok'}>{p.quantity <= 0 ? 'ناموجود' : `${toFa(p.quantity)} ${p.unit}`}</Badge>
          </span>
        ),
      })),
    [products, cat],
  );

  const totals = useMemo(() => computeTotals(lines, discount, paid, cfg.taxPercent), [lines, discount, paid, cfg.taxPercent]);
  const qty = lines.reduce((a, l) => a + l.qty, 0);

  function addLine(p?: Product) {
    if (!p) return;
    if (p.quantity <= 0) { toast.push(`«${p.name}» موجود نیست`, 'warn'); return; }
    setLines((ls) => {
      const found = ls.find((l) => l.productId === p.id);
      if (found) {
        if (found.qty >= found.stock) { toast.push('بیشتر از موجودی انبار نمی‌توانید بفروشید', 'warn'); return ls; }
        return ls.map((l) => (l.key === found.key ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...ls, {
        key: String(p.id), productId: p.id, name: p.name, qty: 1,
        price: p.sellPrice, cost: p.buyPrice, stock: p.quantity, unit: p.unit, image: p.image,
      }];
    });
  }

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

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
      if (debt > 0 && customerId) setPlanOpen({ saleId, debt });
      else nav(`/sales/${saleId}`);
    } catch (e: any) {
      toast.push(String(e?.message || e), 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4 max-w-6xl mx-auto items-start">
      <div className="space-y-4 min-w-0">
        {/* ---------------------------- ۱) مشتری ---------------------------- */}
        <Card>
          <SectionTitle
            icon="users"
            title="۱) مشتری فاکتور"
            subtitle={customerId ? 'فروش اعتباری به مشتری ثبت‌شده' : 'فروش نقدی روزانه به مشتری گذرا'}
          />
          <div className="grid sm:grid-cols-2 gap-3 items-end">
            <Field label="مشتری" hint="برای فروش روزانه خالی بگذارید">
              <Select value={customerId ? String(customerId) : ''} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— مشتری روزانه (گذرا) —</option>
                {customers.map((c) => <option key={c.id} value={String(c.id)}>{c.name}{c.phone ? ` • ${c.phone}` : ''}</option>)}
              </Select>
            </Field>
            {customerId ? (
              <div className="h-11 px-3 rounded-xl border border-line bg-surface2 flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-lg bg-brand-soft text-brand text-[11px] font-bold grid place-items-center shrink-0">
                  {customer?.name?.slice(0, 1) || 'م'}
                </span>
                <span className="text-[13px] font-medium truncate">{customer?.name || 'در حال بارگذاری…'}</span>
                <span className="text-[11px] text-muted nums mr-auto shrink-0" dir="ltr">{customer?.phone || 'بدون شماره'}</span>
              </div>
            ) : (
              <Field label="نام مشتری روزانه">
                <Input value={walkInName} onChange={(e) => setWalkInName(e.target.value)} placeholder="مشتری روزگذر" />
              </Field>
            )}
          </div>
        </Card>

        {/* -------------------------- ۲) افزودن کالا -------------------------- */}
        <Card className="border-brand/30">
          <SectionTitle
            icon="search"
            title="۲) افزودن کالا"
            subtitle="نام یا کد کالا را بنویسید و از لیست کشویی انتخاب کنید"
            action={(
              <Select value={cat} onChange={(e) => setCat(e.target.value)} size="sm" className="w-auto min-w-[110px]">
                <option value="">همه دسته‌ها</option>
                {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.icon} {c.name}</option>)}
              </Select>
            )}
          />
          <Combobox
            options={productOptions}
            label="انتخاب کالا"
            placeholder={products.length ? 'جستجوی نام، برند، مدل یا کد کالا…' : 'هنوز کالایی ثبت نشده است'}
            emptyText={products.length ? 'کالایی با این مشخصات پیدا نشد' : 'ابتدا از بخش کالاها، کالای خود را ثبت کنید'}
            hint={`${toFa(productOptions.filter((o) => !o.disabled).length)} کالای موجود • با جستجو فیلتر می‌شود`}
            disabled={!products.length}
            onSelect={(v) => addLine(products.find((p) => String(p.id) === v))}
          />
          <div className="flex items-center gap-2 mt-2.5 min-w-0">
            <Icon name="box" className="w-3.5 h-3.5 text-muted shrink-0" />
            <p className="text-[11px] text-muted truncate flex-1 min-w-0">
              {lines.length ? `${toFa(lines.length)} قلم در فاکتور • ${toFa(qty)} عدد` : 'با هر انتخاب، یک ردیف به فاکتور اضافه می‌شود'}
            </p>
            {!products.length ? (
              <Button size="sm" variant="outline" icon="plus" className="mr-auto" onClick={() => nav('/products?new=1')}>ثبت کالا</Button>
            ) : null}
            {lines.length ? (
              <Button size="sm" variant="ghost" icon="refresh" className="mr-auto" onClick={() => { setLines([]); setDiscount(0); setPaid(0); }}>پاک کردن فاکتور</Button>
            ) : null}
          </div>
        </Card>

        {/* ---------------------------- ۳) اقلام ---------------------------- */}
        <Card>
          <SectionTitle icon="list" title="۳) اقلام فاکتور" subtitle={lines.length ? `${toFa(lines.length)} قلم • ${toFa(qty)} عدد` : 'کالایی اضافه نشده'} />
          {!lines.length ? (
            <EmptyState icon="card" title="فاکتور خالی است" hint="از کادر بالا کالا را جستجو و انتخاب کنید تا اینجا فهرست شود." />
          ) : (
            <div className="space-y-2.5">
              {lines.map((l) => (
                <div key={l.key} className="rounded-xl border border-line bg-surface p-3 min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ProductThumb name={l.name} size="sm" src={l.image} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold break-words leading-6">{l.name}</p>
                      <p className="text-[11px] text-muted truncate">موجودی انبار: {toFa(l.stock)} {l.unit}</p>
                    </div>
                    <IconButton name="trash" label="حذف قلم" variant="danger" size="sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-[132px_1fr_1fr] gap-2.5 mt-2.5 items-end">
                    <Field label="مقدار">
                      <Stepper
                        value={l.qty}
                        min={1}
                        max={Math.max(1, l.stock)}
                        onChange={(n) => setLine(l.key, { qty: n })}
                        suffix={l.unit}
                      />
                    </Field>
                    <Field label={`قیمت واحد (${unit})`}>
                      <MoneyInput value={l.price} onChange={(n) => setLine(l.key, { price: n })} />
                    </Field>
                    <Field label="جمع قلم">
                      <div className="h-11 px-3 rounded-xl border border-line bg-surface2 flex items-center justify-start nums text-sm font-bold tabular-nums truncate">
                        {money(l.qty * l.price)}
                      </div>
                    </Field>
                  </div>
                  {l.qty > l.stock ? <p className="text-[11px] text-danger mt-1.5">مقدار وارد‌شده بیش از موجودی انبار است.</p> : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ---------------------------- جمع‌بندی ---------------------------- */}
      <div className="lg:sticky lg:top-[70px] space-y-3 min-w-0">
        <Card>
          <SectionTitle icon="wallet" title="جمع‌بندی فاکتور" subtitle={formatDate(date, true)} />

          <div className="rounded-xl bg-surface2/70 border border-line px-3 py-2.5 space-y-1">
            <AmountRow label="جمع اقلام" value={money(totals.subtotal)} />
            {cfg.taxPercent ? (
              <AmountRow label={`مالیات ${toFa(cfg.taxPercent)}٪`} value={money(totals.total - (totals.subtotal - totals.discount))} />
            ) : null}
            <AmountRow label="تخفیف" value={money(totals.discount)} tone={totals.discount ? 'ok' : 'muted'} />
            <div className="h-px bg-line my-1.5" />
            <AmountRow label="مبلغ قابل پرداخت" value={money(totals.total)} strong />
            {customerId ? <AmountRow label="دریافت‌شده" value={money(totals.paid)} /> : null}
            <AmountRow
              label={customerId ? 'باقی‌مانده' : 'دریافت نقدی'}
              value={money(customerId ? totals.debt : totals.total)}
              tone={customerId && totals.debt > 0 ? 'danger' : 'ok'}
              strong
            />
            <AmountRow label="سود فاکتور" value={money(totals.profit)} tone="ok" />
          </div>
          {totals.total > 0 ? (
            <p className="text-[10.5px] text-muted mt-2 leading-5">{moneyInWords(totals.total)} {unit}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label={`تخفیف (${unit})`}>
              <MoneyInput value={discount} onChange={setDiscount} />
            </Field>
            {customerId ? (
              <Field label={`دریافتی (${unit})`}>
                <MoneyInput value={paid} onChange={setPaid} />
              </Field>
            ) : (
              <Field label="دریافت">
                <div className="h-11 px-3 rounded-xl border border-line bg-surface2 flex items-center justify-between gap-2">
                  <span className="text-[12px] text-muted truncate">نقدی کامل</span>
                  <span className="text-[12px] font-semibold nums truncate">{money(totals.total)}</span>
                </div>
              </Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="تاریخ فاکتور">
              <Input value={date} onChange={(e) => setDate(e.target.value)} className="nums" placeholder="1404-08-08" />
            </Field>
            <Field label="روش پرداخت">
              <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
                {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="یادداشت فاکتور" className="mt-3">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="گارانتی، رنگ، تحویل و…" />
          </Field>

          <div className="flex items-stretch gap-2 mt-3">
            <Button block icon="check" loading={saving} onClick={submit} disabled={!lines.length}>ثبت فاکتور</Button>
            <IconButton
              name="refresh"
              label="پاک کردن فرم"
              variant="outline"
              size="lg"
              onClick={() => { setLines([]); setDiscount(0); setPaid(0); setNote(''); }}
            />
          </div>
          <p className="text-[10.5px] text-muted mt-2 leading-5 flex items-start gap-1">
            <Icon name="shield" className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            با ثبت فاکتور، موجودی انبار کسر و سند انبار صادر می‌شود.
          </p>
        </Card>
      </div>

      {planOpen ? (
        <Modal
          open
          onClose={() => nav(`/sales/${planOpen.saleId}`)}
          title="مانده فاکتور را قسط‌بندی می‌کنید؟"
          size="sm"
          footer={<>
            <Button variant="outline" onClick={() => nav(`/sales/${planOpen.saleId}`)}>بعداً</Button>
            <Button icon="calendar" onClick={async () => {
              if (!customerId) return;
              await createPlan({ customerId, saleId: planOpen.saleId, title: 'اقساط فاکتور', totalAmount: planOpen.debt, count: 6, startDate: todayKey(), interval: 1, mode: 'months' });
              toast.push('قرارداد اقساط ساخته شد', 'ok');
              nav(`/customers/${customerId}`);
            }}>قسط‌بندی ۶ ماهه</Button>
          </>}
        >
          <p className="text-sm text-muted leading-7">
            مانده این فاکتور <b className="nums text-danger">{money(planOpen.debt)}</b> {unit} است. می‌توانید همین حالا یک برنامه ۶ قسطه بسازید یا بعداً از صفحه مشتری اقدام کنید.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
