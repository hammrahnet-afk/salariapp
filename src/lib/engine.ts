/**
 * موتور خودکار — هسته‌ی منطق «اعلان سررسید + ارسال خودکار پیامک».
 * این ماژول عمداً بدون هیچ وابستگی به DOM نوشته شده تا هم در صفحه‌ی اپ
 * و هم داخل Service Worker (اجرای پس‌زمینه) قابل استفاده باشد.
 */
import { db, getSetting, type Installment } from './db';
import { addDays, diffDays, formatDate, todayKey, type DateKey } from './jalali';
import { isValidPhone, money } from './format';
import { dispatch, smsParts, type SmsVars } from './sms';
import { loadConfig, UNIT_LABEL, type AppConfig } from './settings';
import { addNotification } from './notify';

export interface EngineResult {
  at: string;
  reason: string;
  scanned: number;
  sent: number;
  queued: number;
  failed: number;
  skippedNoPhone: number;
  skippedCap: number;
  lowStock: number;
  errors: string[];
}

const emptyResult = (reason: string): EngineResult => ({
  at: new Date().toISOString(),
  reason,
  scanned: 0, sent: 0, queued: 0, failed: 0,
  skippedNoPhone: 0, skippedCap: 0, lowStock: 0, errors: [],
});

/** آیا الان زمان مجاز ارسال است؟ (ساعت تعیین‌شده در تنظیمات) */
export function isWithinSendWindow(cfg: AppConfig, now = new Date()): boolean {
  const [h, m] = String(cfg.sms.sendAt || '09:00').split(':').map(Number);
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= (m || 0));
}

async function balanceForCustomer(customerId: number): Promise<number> {
  const [c, sales, payments] = await Promise.all([
    db.customers.get(customerId),
    db.sales.where('customerId').equals(customerId).toArray(),
    db.payments.where('customerId').equals(customerId).toArray(),
  ]);
  if (!c) return 0;
  const debt = sales.reduce((a, s) => a + (s.total - s.paid), 0);
  const pay = payments.reduce((a, s) => a + s.amount, 0);
  return (c.openingBalance || 0) + debt - pay;
}

/** ساخت متغیرهای قالب پیامک برای یک قسط */
async function buildVars(ins: Installment, cfg: AppConfig, base: DateKey): Promise<{ vars: SmsVars; phone: string; name: string; customerId: number } | null> {
  const customer = await db.customers.get(ins.customerId);
  if (!customer) return null;
  const phone = (customer.phone || customer.phone2 || '').trim();
  const plan = await db.plans.get(ins.planId);
  const debt = await balanceForCustomer(ins.customerId);
  const remaining = Math.max(0, ins.amount - ins.paidAmount);
  const unit = UNIT_LABEL(cfg);
  const vars: SmsVars = {
    name: customer.name,
    amount: money(remaining),
    unit,
    due: formatDate(ins.dueDate),
    idx: ins.idx,
    count: plan?.count ?? '—',
    debt: money(debt),
    late: Math.max(0, diffDays(ins.dueDate, base)),
    shop: cfg.shop.name,
    phone: cfg.shop.phone,
    date: formatDate(base),
  };
  return { vars, phone, name: customer.name, customerId: ins.customerId };
}

/** هدف‌های نیازمند پیامک در این لحظه */
export async function collectTargets(cfg: AppConfig, base = todayKey()): Promise<Installment[]> {
  const ahead = Math.max(0, Number(cfg.sms.daysBefore) || 0);
  const horizon = ahead > 0 ? addDaysLocal(base, ahead) : base;
  const open = await db.installments.where('status').equals('pending').toArray();
  return open
    .filter((i) => i.paidAmount < i.amount)
    .filter((i) => i.dueDate <= horizon)
    .filter((i) => !i.notified)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** افق بررسی: امروز + روزهای قبل از سررسید */
function addDaysLocal(key: DateKey, n: number): DateKey {
  return addDays(key, n);
}

export function kindOf(ins: Installment, base: DateKey): 'due' | 'overdue' | 'reminder' {
  if (ins.dueDate < base) return 'overdue';
  if (ins.dueDate === base) return 'due';
  return 'reminder';
}

/** اجرای کامل یک چرخه بررسی */
export async function runAutoSend(reason: string): Promise<EngineResult> {
  const res = emptyResult(reason);
  const cfg = await loadConfig();
  const base = todayKey();
  const unit = UNIT_LABEL(cfg);

  await getSetting('lastEngineRun', null);
  await db.settings.put({ key: 'lastEngineRun', value: res.at });

  if (!cfg.background.enabled) return res;

  // ۱) اقساط سررسیدشده
  const targets = await collectTargets(cfg, base);
  res.scanned = targets.length;

  if (targets.length && !isWithinSendWindow(cfg)) {
    // قبل از ساعت مجاز، فقط اعلان داخلی می‌سازیم و پیامک نمی‌دهیم
    for (const ins of targets.slice(0, 40)) {
      const info = await buildVars(ins, cfg, base);
      if (!info) continue;
      await addNotification({
        date: base,
        kind: ins.dueDate < base ? 'overdue' : 'due',
        title: `سررسید قسط ${ins.idx} — ${info.name}`,
        body: `${money(ins.amount - ins.paidAmount)} ${unit} • ${formatDate(ins.dueDate)}`,
        refId: ins.customerId,
      });
    }
    return res;
  }

  for (const ins of targets) {
    const info = await buildVars(ins, cfg, base);
    if (!info) continue;

    const valid = isValidPhone(info.phone);
    if (!valid) {
      res.skippedNoPhone++;
      await addNotification({
        date: base,
        kind: 'due',
        title: `شماره تماس نامعتبر — ${info.name}`,
        body: `قسط ${ins.idx} امروز سررسید است اما شماره موبایل معتبر ثبت نشده.`,
        refId: ins.customerId,
      });
      continue;
    }

    const kind = kindOf(ins, base);
    const out = await dispatch(
      { cfg, unit, shopName: cfg.shop.name },
      { installmentId: ins.id!, phone: info.phone, vars: info.vars, kind, customerId: info.customerId, customerName: info.name },
    );

    if (out.status === 'sent') res.sent++;
    else if (out.status === 'queued') res.queued++;
    else res.failed++;
    if (out.error) res.errors.push(`${info.name}: ${out.error}`);

    await db.installments.update(ins.id!, { notified: true, smsSentAt: new Date().toISOString() });
    await addNotification({
      date: base,
      kind: kind === 'overdue' ? 'overdue' : 'due',
      title: `یادآوری قسط ${ins.idx} — ${info.name}`,
      body: `${money(ins.amount - ins.paidAmount)} ${unit} • ${formatDate(ins.dueDate)} • ${
        out.status === 'sent' ? 'پیامک ارسال شد' : out.status === 'queued' ? 'در صف ارسال دستی' : 'ارسال ناموفق'
      }`,
      refId: ins.customerId,
    });
  }

  // ۲) هشدار موجودی کم
  if (cfg.lowStockAlert) res.lowStock = await runLowStockAlerts(cfg, base);

  // ۳) پشتیبان‌گیری خودکار
  try {
    const { maybeAutoBackup } = await import('./backup');
    await maybeAutoBackup(cfg);
  } catch (e: any) {
    res.errors.push(`پشتیبان‌گیری: ${e?.message || e}`);
  }

  return res;
}

async function runLowStockAlerts(cfg: AppConfig, base: DateKey): Promise<number> {
  const products = await db.products.where('archived').equals(0).toArray();
  const low = products.filter((p) => p.quantity <= p.minStock);
  if (!low.length) return 0;
  const seenKey = `lowStockAlerted:${base}`;
  const seen = (await getSetting<number[]>(seenKey, [])) || [];
  const fresh = low.filter((p) => !seen.includes(p.id!));
  for (const p of fresh) {
    await addNotification({
      date: base,
      kind: 'stock',
      title: `هشدار موجودی: ${p.name}`,
      body: `موجودی ${p.quantity} ${p.unit} است (نقطه سفارش: ${p.minStock}).`,
      refId: p.id,
    });
  }
  if (fresh.length) await db.settings.put({ key: seenKey, value: [...seen, ...fresh.map((p) => p.id!)] });
  return fresh.length;
}

/** برچسب وضعیت موتور برای نمایش در رابط کاربری */
export async function engineStatus() {
  const cfg = await loadConfig();
  const lastRun = await getSetting<string>('lastEngineRun', '');
  const reg = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  const periodic = await (async () => {
    try {
      if (!reg || !('periodicSync' in reg)) return 'unsupported' as const;
      const tags = await (reg as any).periodicSync.getTags();
      return (tags || []).length ? ('active' as const) : ('idle' as const);
    } catch {
      return 'unsupported' as const;
    }
  })();
  return {
    enabled: cfg.background.enabled,
    mode: cfg.sms.mode,
    autoSend: cfg.sms.autoSend,
    panelReady: cfg.sms.mode === 'panel' && (cfg.sms.provider === 'kavenegar' ? !!cfg.sms.apiKey : !!(cfg.sms.username && cfg.sms.password)),
    inWindow: isWithinSendWindow(cfg),
    sendAt: cfg.sms.sendAt,
    lastRun,
    periodic,
    notifyPermission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    hasWakeLock: wakeLockState.active,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  };
}

/* ------------------------------ Wake Lock -------------------------------- */

export const wakeLockState = { active: false };

export async function requestWakeLock(): Promise<boolean> {
  try {
    const wl: any = (navigator as any).wakeLock;
    if (!wl) return false;
    const sentinel = await wl.request('screen');
    wakeLockState.active = true;
    sentinel.addEventListener?.('release', () => { wakeLockState.active = false; });
    return true;
  } catch {
    return false;
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    const wl: any = (navigator as any).wakeLock;
    await wl?.release?.();
  } catch { /* بی‌خطر */ }
  wakeLockState.active = false;
}

/** نگه‌داشتن صفحه روشن وقتی تب مخفی/نمایشگر خاموش می‌شود */
export function bindWakeLockReacquire(): () => void {
  const onVis = async () => {
    const cfg = await loadConfig();
    if (document.visibilityState === 'visible' && cfg.background.enabled && cfg.background.wakeLock && !wakeLockState.active) {
      await requestWakeLock();
    }
  };
  document.addEventListener('visibilitychange', onVis);
  return () => document.removeEventListener('visibilitychange', onVis);
}

export { smsParts };
