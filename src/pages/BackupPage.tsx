import React, { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { buildBackup, downloadFromDrive, downloadJson, maybeAutoBackup, pruneBackups, readJsonFile, restoreBackup, saveBackupRecord, uploadToDrive, wipeAllData } from '../lib/backup';
import { seedIfEmpty } from '../lib/seed';
import { formatBytes } from '../lib/image';
import { formatDate, todayKey } from '../lib/jalali';
import { toFa } from '../lib/format';
import { Badge, Button, Card, Confirm, EmptyState, Icon, SectionTitle, StatCard, Toggle, cx, useToast } from '../components/ui';
import { useApp } from '../state';

export default function BackupPage() {
  const toast = useToast();
  const { cfg, update } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<number | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const base = todayKey();

  const backups = useLiveQuery(() => db.backups.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const stats = useLiveQuery(async () => {
    const [products, customers, sales, installments, payments] = await Promise.all([
      db.products.count(), db.customers.count(), db.sales.count(), db.installments.count(), db.payments.count(),
    ]);
    return { products, customers, sales, installments, payments };
  }, []) ?? { products: 0, customers: 0, sales: 0, installments: 0, payments: 0 };

  async function manualBackup() {
    setBusy('manual');
    try {
      const id = await saveBackupRecord('manual', 'پشتیبان دستی');
      const rec = await db.backups.get(id);
      if (rec) downloadJson(rec.data, `salariapp-${new Date().toISOString().slice(0, 10)}.json`);
      toast.push('پشتیبان ساخته و دانلود شد', 'ok');
    } catch (e: any) {
      toast.push(String(e?.message || e), 'danger');
    } finally { setBusy(null); }
  }

  async function onFile(file?: File | null) {
    if (!file) return;
    setBusy('import');
    try {
      const payload = await readJsonFile(file);
      const counts = await restoreBackup(payload, 'replace');
      toast.push(`بازیابی انجام شد: ${toFa(Object.values(counts).reduce((a, b) => a + b, 0))} رکورد`, 'ok');
    } catch (e: any) {
      toast.push(String(e?.message || e), 'danger');
    } finally { setBusy(null); }
  }

  async function drive(action: 'upload' | 'download') {
    setBusy(action);
    try {
      if (action === 'upload') {
        const payload = await buildBackup('manual');
        await saveBackupRecord('drive', 'پشتیبان گوگل‌درایو');
        const res = await uploadToDrive(cfg, payload);
        toast.push(res.message, res.ok ? 'ok' : 'danger');
      } else {
        const payload = await downloadFromDrive(cfg);
        if (!payload) { toast.push('فایلی در درایو یافت نشد', 'warn'); return; }
        await restoreBackup(payload, 'replace');
        toast.push('از گوگل‌درایو بازیابی شد', 'ok');
      }
    } catch (e: any) {
      toast.push(String(e?.message || e), 'danger');
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <Card>
        <SectionTitle icon="database" title="پشتیبان‌گیری" subtitle="همه داده‌ها روی همین دستگاه است؛ نسخه پشتیبان را منظم بگیرید" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <StatCard label="نسخه‌های ذخیره" value={toFa(backups.length)} sub={`حداکثر ${toFa(cfg.backup.keep)}`} icon="database" />
          <StatCard label="کالاها" value={toFa(stats.products)} sub="رکورد انبار" icon="box" tone="info" />
          <StatCard label="مشتریان" value={toFa(stats.customers)} sub="پرونده فعال" icon="users" tone="brand" />
          <StatCard label="فاکتورها" value={toFa(stats.sales)} sub="اسناد فروش" icon="card" tone="ok" />
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <Button icon="database" loading={busy === 'manual'} onClick={manualBackup}>پشتیبان فوری + دانلود</Button>
          <Button variant="outline" icon="upload" loading={busy === 'import'} onClick={() => fileRef.current?.click()}>بازیابی از فایل</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          {cfg.backup.driveEnabled ? (
            <>
              <Button variant="outline" icon="cloud" loading={busy === 'upload'} onClick={() => drive('upload')}>آپلود در درایو</Button>
              <Button variant="ghost" icon="download" loading={busy === 'download'} onClick={() => drive('download')}>بازیابی از درایو</Button>
            </>
          ) : null}
        </div>
      </Card>

      <Card>
        <SectionTitle icon="clock" title="پشتیبان‌گیری خودکار" subtitle="بدون دخالت شما، در پس‌زمینه انجام می‌شود" />
        <Toggle label="فعال‌سازی پشتیبان خودکار" hint="هر بار که برنامه باز باشد و زمان‌بندی رسیده باشد" checked={cfg.backup.auto} onChange={(v) => update({ backup: { ...cfg.backup, auto: v } })} />
        <div className="grid sm:grid-cols-2 gap-3 mt-2">
          <label className="block">
            <span className="text-xs text-muted">هر چند روز یک‌بار</span>
            <select value={cfg.backup.intervalDays} onChange={(e) => update({ backup: { ...cfg.backup, intervalDays: Number(e.target.value) } })}
              className="w-full h-11 px-3 rounded-xl border border-line bg-surface2 mt-1">
              {[1, 2, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{toFa(d)} روز</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted">تعداد نسخه‌های نگهداری‌شده</span>
            <select value={cfg.backup.keep} onChange={(e) => update({ backup: { ...cfg.backup, keep: Number(e.target.value) } })}
              className="w-full h-11 px-3 rounded-xl border border-line bg-surface2 mt-1">
              {[5, 10, 14, 20, 30, 50].map((d) => <option key={d} value={d}>{toFa(d)} نسخه</option>)}
            </select>
          </label>
        </div>
        <p className="text-[11px] text-muted mt-2">
          آخرین پشتیبان خودکار: {cfg.backup.lastAutoAt ? new Date(cfg.backup.lastAutoAt).toLocaleString('fa-IR') : 'هنوز انجام نشده'}
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Button size="sm" variant="soft" icon="refresh" onClick={async () => {
            const done = await maybeAutoBackup({ ...cfg, backup: { ...cfg.backup, lastAutoAt: null } });
            toast.push(done ? 'پشتیبان خودکار ساخته شد' : 'نیازی به پشتیبان نبود', done ? 'ok' : 'info');
          }}>اجرای فوری پشتیبان خودکار</Button>
          <Button size="sm" variant="ghost" icon="trash" onClick={async () => { const n = await pruneBackups(); toast.push(`${toFa(n)} نسخه قدیمی حذف شد`, 'ok'); }}>پاک‌سازی نسخه‌های اضافی</Button>
        </div>
      </Card>

      <Card>
        <SectionTitle icon="cloud" title="همگام‌سازی با گوگل‌درایو" subtitle="برای فعال‌سازی، شناسه کلاینت OAuth خود را در تنظیمات وارد کنید" />
        <Toggle label="اتصال به گوگل‌درایو" hint="نیاز به ساخت Client ID در کنسول گوگل دارد" checked={cfg.backup.driveEnabled} onChange={(v) => update({ backup: { ...cfg.backup, driveEnabled: v } })} />
        {cfg.backup.driveEnabled ? (
          <p className={cx('text-[11px] mt-1', cfg.backup.driveClientId ? 'text-ok' : 'text-warn')}>
            {cfg.backup.driveClientId ? 'شناسه کلاینت ثبت شده است.' : 'شناسه کلاینت ثبت نشده — از «تنظیمات» وارد کنید.'}
          </p>
        ) : null}
      </Card>

      <Card pad={false}>
        <div className="p-4">
          <SectionTitle icon="layers" title="نسخه‌های پشتیبان" subtitle={`${toFa(backups.length)} نسخه ذخیره‌شده`} />
        </div>
        {!backups.length ? <EmptyState icon="database" title="نسخه‌ای ذخیره نشده" hint="با «پشتیبان فوری» اولین نسخه را بسازید." /> : (
          <div className="divide-y divide-line">
            {backups.map((b) => (
              <div key={b.id} className="flex items-center gap-3 p-3 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-surface2 text-muted flex items-center justify-center shrink-0"><Icon name="database" className="w-4 h-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate">{b.note || 'پشتیبان'}</p>
                  <p className="text-[11px] text-muted truncate">{new Date(b.createdAt).toLocaleString('fa-IR')} • {formatBytes(b.size)}</p>
                </div>
                <Badge tone={b.source === 'auto' ? 'brand' : b.source === 'drive' ? 'info' : 'neutral'}>{b.source === 'auto' ? 'خودکار' : b.source === 'drive' ? 'درایو' : 'دستی'}</Badge>
                <Button size="sm" variant="outline" icon="download" onClick={() => downloadJson(b.data, `salariapp-${b.date}.json`)}>دانلود</Button>
                <Button size="sm" variant="soft" icon="refresh" onClick={() => setRestoreId(b.id!)}>بازیابی</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle icon="alert" title="منطقه خطر" subtitle="این عملیات قابل بازگشت نیست" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon="spark" onClick={async () => { const ok = await seedIfEmpty(); toast.push(ok ? 'داده نمونه بارگذاری شد' : 'دیتابیس خالی نبود', ok ? 'ok' : 'info'); }}>بارگذاری داده نمونه</Button>
          <Button variant="danger" icon="trash" onClick={() => setWipeOpen(true)}>حذف کامل داده‌ها</Button>
        </div>
      </Card>

      <Confirm open={restoreId !== null} onClose={() => setRestoreId(null)} danger confirmLabel="بازیابی"
        title="بازیابی نسخه پشتیبان" message="داده‌های فعلی با این نسخه پشتیبان جایگزین می‌شود. ادامه می‌دهید؟"
        onConfirm={async () => {
          if (!restoreId) return;
          const rec = await db.backups.get(restoreId);
          if (!rec) return;
          await restoreBackup(rec.data as any, 'replace');
          toast.push('بازیابی انجام شد', 'ok');
        }} />

      <Confirm open={wipeOpen} onClose={() => setWipeOpen(false)} danger confirmLabel="حذف همه"
        title="حذف کامل داده‌ها" message="تمام کالاها، مشتریان، فاکتورها، اقساط و پیامک‌ها حذف می‌شوند. حتماً پیش از این کار پشتیبان بگیرید."
        onConfirm={async () => { await wipeAllData(); toast.push('همه داده‌ها حذف شد', 'ok'); }} />
    </div>
  );
}
