import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product } from '../lib/db';
import { deleteProduct, saveProduct, stockValuation } from '../lib/inventory';
import { compressImage } from '../lib/image';
import { todayKey } from '../lib/jalali';
import { money, moneyShort, toFa } from '../lib/format';
import { Badge, Button, Card, Confirm, EmptyState, Field, Icon, IconButton, Input, MoneyInput, Modal, SearchInput, SectionTitle, Segmented, Select, Textarea, cx, useToast } from '../components/ui';
import { useApp } from '../state';

type Sort = 'new' | 'name' | 'qty' | 'value';
/** چینش فهرست کالا: با عکس / بدون عکس (نام کامل) / ردیفی */
type View = 'grid' | 'compact' | 'list';
const VIEW_KEY = 'salari.products.view';

const readView = (): View => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'grid' || v === 'compact' || v === 'list') return v;
  } catch { /* حالت خصوصی */ }
  return 'grid';
};

const empty = (): Partial<Product> => ({
  name: '', code: '', brand: '', model: '', buyPrice: 0, sellPrice: 0,
  quantity: 0, minStock: 2, unit: 'عدد', note: '', image: undefined, archived: 0,
});

export default function Products() {
  const { unit } = useApp();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>(params.get('cat') || '');
  const [sort, setSort] = useState<Sort>('new');
  const [view, setView] = useState<View>(readView);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [creating, setCreating] = useState(false);

  const changeView = (v: View) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* بی‌اثر */ }
  };
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const lowOnly = params.get('filter') === 'low';

  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []) ?? [];
  const products = useLiveQuery(async () => {
    const all = await db.products.toArray();
    return all.filter((p) => (showArchived ? true : !p.archived));
  }, [showArchived]) ?? [];

  useEffect(() => {
    if (params.get('new')) {
      setCreating(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
    if (params.get('edit')) {
      const id = Number(params.get('edit'));
      db.products.get(id).then((p) => p && setEditing(p));
      params.delete('edit');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = products.filter((p) => {
      if (cat && p.categoryId !== Number(cat)) return false;
      if (lowOnly && p.quantity > p.minStock) return false;
      if (!term) return true;
      return [p.name, p.brand, p.model, p.code].join(' ').toLowerCase().includes(term);
    });
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'fa');
      if (sort === 'qty') return a.quantity - b.quantity;
      if (sort === 'value') return b.sellPrice * b.quantity - a.sellPrice * a.quantity;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
    return list;
  }, [products, q, cat, sort, lowOnly]);

  const val = useMemo(() => stockValuation(products.filter((p) => !p.archived)), [products]);
  const lowCount = products.filter((p) => !p.archived && p.quantity <= p.minStock).length;

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <Card>
        <SectionTitle
          icon="box"
          title="مدیریت کالاها و انبار"
          subtitle={`${toFa(filtered.length)} کالا • ارزش انبار ${moneyShort(val.atSell)} ${unit}`}
          action={<Button size="sm" icon="plus" onClick={() => { setCreating((c) => !c); setEditing(null); }}>{creating ? 'بستن فرم' : 'کالای جدید'}</Button>}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[180px]"><SearchInput value={q} onChange={setQ} placeholder="جستجوی نام، برند، مدل یا کد کالا…" /></div>
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto min-w-[130px]">
            <option value="">همه دسته‌ها</option>
            {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.icon} {c.name}</option>)}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-auto min-w-[120px]">
            <option value="new">جدیدترین</option>
            <option value="name">نام کالا</option>
            <option value="qty">کمترین موجودی</option>
            <option value="value">بیشترین ارزش</option>
          </Select>
          <Segmented<View>
            value={view}
            onChange={changeView}
            options={[
              { value: 'grid', label: 'با عکس', icon: 'image' },
              { value: 'compact', label: 'بدون عکس', icon: 'box' },
              { value: 'list', label: 'ردیفی', icon: 'menu' },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <Badge tone={lowOnly ? 'danger' : 'neutral'}>{toFa(lowCount)} کالا زیر نقطه سفارش</Badge>
          <Badge tone="neutral">{toFa(val.units)} قلم موجودی</Badge>
          <Badge tone="info">ارزش خرید {moneyShort(val.atCost)} {unit}</Badge>
          <button onClick={() => setShowArchived((s) => !s)} className="text-[11px] text-brand mr-auto whitespace-nowrap">
            {showArchived ? 'پنهان کردن بایگانی' : 'نمایش بایگانی‌شده‌ها'}
          </button>
        </div>
      </Card>

      {creating ? (
        <ProductForm
          inline
          product={empty()}
          categories={categories}
          onClose={() => setCreating(false)}
        />
      ) : null}

      {!filtered.length ? (
        <Card><EmptyState icon="box" title={products.length ? 'کالایی با این مشخصات یافت نشد' : 'هنوز کالایی ثبت نشده'}
          hint="اولین کالای فروشگاه خود را اضافه کنید تا انبار و فروش فعال شود."
          action={<Button icon="plus" onClick={() => setCreating(true)}>افزودن کالا</Button>} /></Card>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
          {filtered.map((p) => (
            <Card key={p.id} pad={false} className="overflow-hidden group">
              <div className="relative">
                {p.image ? (
                  <img src={p.image} alt={p.name} loading="lazy" className="w-full aspect-square object-cover bg-surface2" />
                ) : (
                  <div className="w-full aspect-square bg-surface2 flex items-center justify-center text-muted"><Icon name="box" className="w-10 h-10" /></div>
                )}
                {p.quantity <= 0 ? <span className="absolute top-2 right-2"><Badge tone="danger">ناموجود</Badge></span>
                  : p.quantity <= p.minStock ? <span className="absolute top-2 right-2"><Badge tone="warn">روبه‌اتمام</Badge></span> : null}
              </div>
              <div className="p-2.5 min-w-0">
                <p className="text-[13px] font-semibold leading-5 line-clamp-2 break-words" title={p.name}>{p.name}</p>
                <p className="text-[11px] text-muted truncate mt-0.5">{p.brand || '—'}{p.model ? ` • ${p.model}` : ''}</p>
                <div className="flex items-center justify-between gap-2 mt-1.5 min-w-0">
                  <span className="text-[13px] font-bold nums truncate">{money(p.sellPrice)}</span>
                  <Badge tone={p.quantity <= 0 ? 'danger' : p.quantity <= p.minStock ? 'warn' : 'ok'}>{toFa(p.quantity)} {p.unit}</Badge>
                </div>
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => setEditing(p)} className="flex-1 h-8 rounded-lg bg-brand-soft text-brand text-[11px] font-medium inline-flex items-center justify-center gap-1 active:scale-95 transition">
                    <Icon name="edit" className="w-3.5 h-3.5" /> ویرایش
                  </button>
                  <button onClick={() => setConfirmId(p.id!)} className="h-8 px-2.5 rounded-lg bg-danger-soft text-danger text-[11px] font-medium inline-flex items-center justify-center gap-1 active:scale-95 transition" aria-label="حذف کالا">
                    <Icon name="trash" className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : view === 'compact' ? (
        /* نمای بدون عکس: نام کامل کالا در چند خط نمایش داده می‌شود */
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {filtered.map((p) => (
            <Card key={p.id} className="min-w-0">
              <div className="flex items-start gap-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-6 break-words">{p.name}</p>
                  <p className="text-[11px] text-muted mt-0.5 break-words">
                    {[p.brand, p.model, p.code].filter(Boolean).join(' • ') || 'بدون برند'}
                  </p>
                </div>
                <Badge tone={p.quantity <= 0 ? 'danger' : p.quantity <= p.minStock ? 'warn' : 'ok'}>{toFa(p.quantity)} {p.unit}</Badge>
              </div>
              <div className="flex items-end justify-between gap-2 mt-2 min-w-0">
                <div className="min-w-0">
                  <p className="text-[10px] text-muted">قیمت فروش</p>
                  <p className="text-[13px] font-bold nums">{money(p.sellPrice)}</p>
                </div>
                <div className="text-left shrink-0">
                  <p className="text-[10px] text-muted">خرید</p>
                  <p className="text-[11px] nums text-muted">{money(p.buyPrice)}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <IconButton name="edit" label="ویرایش" variant="soft" size="sm" onClick={() => setEditing(p)} />
                  <IconButton name="trash" label="حذف" variant="danger" size="sm" onClick={() => setConfirmId(p.id!)} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        /* نمای ردیفی: نام کامل و بدون بریدن */
        <Card pad={false}>
          <div className="divide-y divide-line">
            {filtered.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium leading-6 break-words">{p.name}</p>
                  <p className="text-[11px] text-muted break-words">{[p.brand || 'بدون برند', p.model, p.code].filter(Boolean).join(' • ')}</p>
                </div>
                <div className="hidden sm:block text-left shrink-0 w-28">
                  <p className="text-[12px] font-semibold nums">{money(p.sellPrice)}</p>
                  <p className="text-[10px] text-muted nums">خرید {money(p.buyPrice)}</p>
                </div>
                <Badge tone={p.quantity <= 0 ? 'danger' : p.quantity <= p.minStock ? 'warn' : 'ok'}>{toFa(p.quantity)} {p.unit}</Badge>
                <IconButton name="edit" label="ویرایش" onClick={() => setEditing(p)} />
                <IconButton name="trash" label="حذف" variant="danger" onClick={() => setConfirmId(p.id!)} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {editing ? <ProductForm product={editing} categories={categories} onClose={() => setEditing(null)} /> : null}

      <Confirm
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        onConfirm={async () => {
          if (confirmId) {
            await deleteProduct(confirmId);
            toast.push('کالا حذف شد', 'ok');
          }
        }}
        title="حذف کالا"
        message="این کالا و سوابق انبار آن حذف می‌شود. فاکتورهای قبلی دست‌نخورده می‌مانند. ادامه می‌دهید؟"
        confirmLabel="حذف کن"
        danger
      />
    </div>
  );
}

function ProductForm({ product, categories, onClose, inline = false }: { product: Partial<Product>; categories: { id?: number; name: string; icon: string }[]; onClose: () => void; inline?: boolean }) {
  const toast = useToast();
  const { unit } = useApp();
  const [form, setForm] = useState<Partial<Product>>({ ...empty(), ...product });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Product>) => setForm((f) => ({ ...f, ...patch }));

  async function pickImage(file?: File | null) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { setErr('حجم تصویر بیش از ۱۲ مگابایت است.'); return; }
    try {
      const url = await compressImage(file);
      set({ image: url });
      setErr('');
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  async function submit() {
    if (!form.name?.trim()) { setErr('نام کالا را وارد کنید.'); return; }
    setBusy(true);
    try {
      await saveProduct(form);
      toast.push(form.id ? 'کالا به‌روزرسانی شد' : 'کالا اضافه شد', 'ok');
      onClose();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const margin = form.sellPrice && form.buyPrice ? Math.round(((form.sellPrice - form.buyPrice) / form.sellPrice) * 100) : 0;

  const fields = (
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2 flex gap-3 items-start">
          <div className="relative shrink-0">
            {form.image ? (
              <img src={form.image} alt="" className="w-24 h-24 rounded-xl object-cover border border-line bg-surface2" />
            ) : (
              <div className="w-24 h-24 rounded-xl border border-dashed border-line bg-surface2 flex items-center justify-center text-muted"><Icon name="image" className="w-7 h-7" /></div>
            )}
            <button type="button" onClick={() => fileRef.current?.click()} className="absolute -bottom-2 -left-2 w-8 h-8 rounded-full bg-brand text-brand-ink flex items-center justify-center shadow-lg" aria-label="افزودن عکس">
              <Icon name="plus" className="w-4 h-4" stroke={2.4} />
            </button>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <Field label="نام کالا" required>
              <Input value={form.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="مثلاً یخچال ساید بای ساید اسنوا" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="برند"><Input value={form.brand || ''} onChange={(e) => set({ brand: e.target.value })} placeholder="اسنوا" /></Field>
              <Field label="مدل/کد فنی"><Input value={form.model || ''} onChange={(e) => set({ model: e.target.value })} placeholder="SS-5500" /></Field>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
        </div>

        <Field label="دسته‌بندی">
          <Select value={form.categoryId ? String(form.categoryId) : ''} onChange={(e) => set({ categoryId: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">بدون دسته</option>
            {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.icon} {c.name}</option>)}
          </Select>
        </Field>
        <Field label="کد کالا" hint="خالی بگذارید تا خودکار ساخته شود">
          <Input value={form.code || ''} onChange={(e) => set({ code: e.target.value })} placeholder="P-0001" />
        </Field>

        <Field label={`قیمت خرید (${unit})`}>
          <MoneyInput value={form.buyPrice ?? 0} onChange={(n) => set({ buyPrice: n })} />
        </Field>
        <Field label={`قیمت فروش (${unit})`}>
          <MoneyInput value={form.sellPrice ?? 0} onChange={(n) => set({ sellPrice: n })} />
        </Field>

        <Field label="موجودی">
          <MoneyInput value={form.quantity ?? 0} onChange={(n) => set({ quantity: n })} />
        </Field>
        <Field label="نقطه سفارش" hint="زیر این عدد هشدار می‌گیرید">
          <MoneyInput value={form.minStock ?? 0} onChange={(n) => set({ minStock: n })} />
        </Field>

        <Field label="واحد">
          <Select value={form.unit || 'عدد'} onChange={(e) => set({ unit: e.target.value })}>
            {['عدد', 'بسته', 'جعبه', 'سرویس', 'متر', 'کیلوگرم'].map((u) => <option key={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label="حاشیه سود">
          <div className="h-11 px-3 rounded-xl bg-surface2 border border-line flex items-center justify-between">
            <span className="text-sm text-muted">سود هر واحد</span>
            <span className={cx('nums font-bold text-sm', margin >= 0 ? 'text-ok' : 'text-danger')}>{money((form.sellPrice ?? 0) - (form.buyPrice ?? 0))} ({toFa(margin)}٪)</span>
          </div>
        </Field>

        <Field label="توضیحات" className="sm:col-span-2">
          <Textarea value={form.note || ''} onChange={(e) => set({ note: e.target.value })} placeholder="گارانتی، رنگ، ابعاد و…" />
        </Field>

        {form.image ? (
          <div className="sm:col-span-2">
            <Button size="sm" variant="ghost" icon="trash" onClick={() => set({ image: undefined })}>حذف عکس</Button>
          </div>
        ) : null}

        {err ? <p className="sm:col-span-2 text-[12px] text-danger">{err}</p> : null}
      </div>
  );

  const actions = (
    <>
      <Button variant="outline" onClick={onClose}>انصراف</Button>
      <Button icon="check" loading={busy} onClick={submit}>{form.id ? 'ذخیره تغییرات' : inline ? 'ثبت کالا' : 'افزودن کالا'}</Button>
    </>
  );

  if (inline) {
    return (
      <Card className="border-brand/30 min-w-0">
        <SectionTitle
          icon="plus"
          title={form.id ? 'ویرایش کالا' : 'ثبت کالای جدید'}
          subtitle="نام کامل کالا را وارد کنید؛ بقیه فیلدها اختیاری‌اند"
          action={<IconButton name="close" label="بستن فرم" onClick={onClose} />}
        />
        {fields}
        <div className="flex items-center justify-end gap-2 mt-3">{actions}</div>
      </Card>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={form.id ? 'ویرایش کالا' : 'کالای جدید'}
      size="lg"
      footer={actions}
    >
      {fields}
    </Modal>
  );
}
