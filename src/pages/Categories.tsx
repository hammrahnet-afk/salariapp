import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Category } from '../lib/db';
import { deleteCategory, saveCategory } from '../lib/inventory';
import { todayKey } from '../lib/jalali';
import { toFa } from '../lib/format';
import { Badge, Button, Card, Confirm, EmptyState, Field, Icon, Input, Modal, SectionTitle, useToast } from '../components/ui';

const COLORS = ['#0d9488', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#475569', '#dc2626'];
const ICONS = ['🧊', '🍳', '🍲', '🥘', '🔪', '🫖', '☕', '🧺', '🍽️', '🚿', '🧹', '📺', '💨', '🌀', '🔌', '🛋️', '🧴', '🍞', '🥄', '🧊'];

export default function Categories() {
  const toast = useToast();
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []) ?? [];
  const counts = useLiveQuery(async () => {
    const rows = await db.products.toArray();
    const map = new Map<number, number>();
    for (const p of rows) if (p.categoryId) map.set(p.categoryId, (map.get(p.categoryId) || 0) + 1);
    return map;
  }, []) ?? new Map<number, number>();

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <Card>
        <SectionTitle
          icon="tag"
          title="دسته‌بندی محصولات"
          subtitle="برای لوازم خانگی و آشپزخانه دسته بسازید تا گزارش‌ها دقیق‌تر شوند"
          action={<Button size="sm" icon="plus" onClick={() => setEditing({ name: '', color: COLORS[0], icon: ICONS[0] })}>دسته جدید</Button>}
        />
        {!categories.length ? (
          <EmptyState icon="tag" title="هنوز دسته‌ای ندارید" hint="مثلاً: یخچال و فریزر، ماشین لباسشویی، ظروف پخت‌وپز، لوازم برقی آشپزخانه."
            action={<Button icon="plus" onClick={() => setEditing({ name: '', color: COLORS[0], icon: ICONS[0] })}>ساخت اولین دسته</Button>} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-2.5">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-line bg-surface2/60 min-w-0">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: c.color + '22', color: c.color }}>{c.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-[11px] text-muted truncate">{toFa(counts.get(c.id!) || 0)} کالا</p>
                </div>
                <Icon name="edit" className="w-4 h-4 text-muted cursor-pointer" onClick={() => setEditing(c)} />
                <Icon name="trash" className="w-4 h-4 text-danger cursor-pointer" onClick={() => setConfirmId(c.id!)} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing ? (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? 'ویرایش دسته' : 'دسته‌بندی جدید'}
          size="sm"
          footer={<>
            <Button variant="outline" onClick={() => setEditing(null)}>انصراف</Button>
            <Button icon="check" onClick={async () => {
              if (!editing.name?.trim()) { toast.push('نام دسته را وارد کنید', 'warn'); return; }
              await saveCategory({ ...editing, createdAt: todayKey() } as Category);
              toast.push('ذخیره شد', 'ok');
              setEditing(null);
            }}>ذخیره</Button>
          </>}
        >
          <div className="space-y-3">
            <Field label="نام دسته" required>
              <Input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="مثلاً لوازم برقی آشپزخانه" />
            </Field>
            <Field label="آیکون">
              <div className="flex flex-wrap gap-1.5">
                {ICONS.map((i) => (
                  <button key={i} type="button" onClick={() => setEditing({ ...editing, icon: i })}
                    className={`w-9 h-9 rounded-lg border text-lg flex items-center justify-center transition ${editing.icon === i ? 'border-brand bg-brand-soft' : 'border-line bg-surface2'}`}>{i}</button>
                ))}
              </div>
            </Field>
            <Field label="رنگ">
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setEditing({ ...editing, color: c })}
                    className={`w-8 h-8 rounded-lg transition ${editing.color === c ? 'ring-2 ring-offset-2 ring-offset-surface' : ''}`}
                    style={{ background: c, boxShadow: editing.color === c ? `0 0 0 2px ${c}` : undefined }} aria-label={c} />
                ))}
              </div>
            </Field>
          </div>
        </Modal>
      ) : null}

      <Confirm
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        onConfirm={async () => {
          try {
            if (confirmId) await deleteCategory(confirmId);
            toast.push('دسته حذف شد', 'ok');
          } catch (e: any) {
            toast.push(String(e?.message || e), 'danger');
          }
        }}
        title="حذف دسته‌بندی"
        message="اگر کالایی به این دسته وصل باشد حذف انجام نمی‌شود."
        confirmLabel="حذف کن"
        danger
      />
    </div>
  );
}
