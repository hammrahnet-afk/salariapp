/**
 * لایه بومی اندروید (Capacitor)
 * - زمان‌بندی اعلان سیستمی سررسید اقساط با AlarmManager اندروید
 *   (حتی وقتی برنامه بسته است، اعلان در ساعت تعیین‌شده نمایش داده می‌شود)
 * - در مرورگر ساده، همه‌ی این توابع بی‌اثر و بی‌خطر هستند
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AndroidSettings, NativeSettings } from 'capacitor-native-settings';
import { db } from './db';
import { addDays, formatDate, keyToDate, todayKey } from './jalali';
import { money, toFa } from './format';
import { loadConfig, UNIT_LABEL } from './settings';

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();
export const platformName = (): string => Capacitor.getPlatform();

const CHANNEL_ID = 'salari-due';

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';
export type ExactAlarmState = 'granted' | 'denied' | 'unsupported';

/** درخواست اجازه اعلان از اندروید ۱۳ به بالا (پنجره سیستمی اندروید نمایش داده می‌شود) */
export async function ensureNativePermission(): Promise<PermissionState> {
  if (!isNativeApp()) return 'unsupported';
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return 'granted';
    const asked = await LocalNotifications.requestPermissions();
    return asked.display === 'granted' ? 'granted' : asked.display === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** فقط خواندن وضعیت اجازه اعلان، بدون نمایش پنجره سیستمی */
export async function notificationPermissionStatus(): Promise<PermissionState> {
  if (!isNativeApp()) return 'unsupported';
  try {
    const cur = await LocalNotifications.checkPermissions();
    return cur.display === 'granted' ? 'granted' : cur.display === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** وضعیت اجازه «آلارم و یادآور دقیق» اندروید ۱۲ به بالا */
export async function exactAlarmStatus(): Promise<ExactAlarmState> {
  if (!isNativeApp()) return 'unsupported';
  try {
    const res: any = await LocalNotifications.checkExactNotificationSetting();
    const v = String(res?.exact_alarm ?? res ?? '');
    return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : 'granted';
  } catch {
    return 'unsupported';
  }
}

/** باز کردن صفحه سیستمی «آلارم و یادآور» تا کاربر اجازه دقیق را روشن کند */
export async function requestExactAlarm(): Promise<ExactAlarmState> {
  if (!isNativeApp()) return 'unsupported';
  try {
    await LocalNotifications.changeExactNotificationSetting();
  } catch { /* برخی نسخه‌های اندروید این صفحه را ندارند */ }
  return exactAlarmStatus();
}

/** باز کردن صفحه معافیت از بهینه‌سازی باتری (برای ادامه کار در پس‌زمینه) */
export async function openBatteryOptimizationSettings(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const res = await NativeSettings.openAndroid({ option: AndroidSettings.BatteryOptimization });
    return !!res?.status;
  } catch {
    return false;
  }
}

/** باز کردن صفحه اختصاصی تنظیمات همین اپ */
export async function openAppSettings(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const res = await NativeSettings.openAndroid({ option: AndroidSettings.ApplicationDetails });
    return !!res?.status;
  } catch {
    return false;
  }
}

export interface NativeAccessReport {
  notifications: PermissionState;
  exactAlarm: ExactAlarmState;
}

/** خواندن وضعیت همه مجوزهای لازم بدون باز کردن پنجره‌ای */
export async function nativeAccessReport(): Promise<NativeAccessReport> {
  const [notifications, exactAlarm] = await Promise.all([notificationPermissionStatus(), exactAlarmStatus()]);
  return { notifications, exactAlarm };
}

/**
 * راه‌اندازی مجوزهای بومی در اولین اجرا:
 * ۱) درخواست اجازه اعلان (پنجره سیستمی اندروید ۱۳+)
 * ۲) ساخت کانال اعلان با اهمیت بالا تا در تنظیمات سیستم دیده شود
 * ۳) خواندن وضعیت آلارم دقیق (برای درخواست، دکمه در کارت مجوزها هست)
 * ۴) زمان‌بندی مجدد یادآورها
 */
export async function bootstrapNativePermissions(): Promise<NativeAccessReport> {
  if (!isNativeApp()) return { notifications: 'unsupported', exactAlarm: 'unsupported' };
  await ensureChannel();
  const notifications = await ensureNativePermission();
  const exactAlarm = await exactAlarmStatus();
  try { await syncNativeReminders(180); } catch { /* بی‌اثر */ }
  return { notifications, exactAlarm };
}

/** کانال اعلان با اهمیت بالا (صدا + ویبره + نمایش روی صفحه) */
export async function ensureChannel(): Promise<void> {
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'یادآوری اقساط',
      description: 'سررسید اقساط مشتریان و رسید واریزی',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#0d9488',
    });
  } catch { /* در iOS/وب وجود ندارد */ }
}

function atSendTime(dateKey: string, sendAt: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  try {
    const d = keyToDate(dateKey);
    const [h, m] = (sendAt || '09:00').split(':').map((x) => parseInt(x, 10));
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: Number.isFinite(h) ? h : 9,
      minute: Number.isFinite(m) ? m : 0,
    };
  } catch {
    return null;
  }
}

export interface NativeSyncResult {
  scheduled: number;
  cancelled: number;
  skipped: number;
  error?: string;
}

/**
 * همگام‌سازی اعلان‌های بومی: برای اقساط بازِ سررسیدشده در `daysAhead` روز آینده،
 * یک اعلان در تاریخ سررسید (ساعت ارسال تنظیمات) ثبت می‌کند.
 */
export async function syncNativeReminders(daysAhead = 120): Promise<NativeSyncResult> {
  const out: NativeSyncResult = { scheduled: 0, cancelled: 0, skipped: 0 };
  if (!isNativeApp()) return out;

  try {
    const perm = await ensureNativePermission();
    if (perm !== 'granted') {
      out.error = 'اجازه اعلان داده نشده است.';
      return out;
    }
    await ensureChannel();

    const cfg = await loadConfig();
    const base = todayKey();
    const limit = addDays(base, daysAhead);
    const unit = UNIT_LABEL(cfg);

    const [installments, customers, plans] = await Promise.all([
      db.installments.where('status').equals('pending').toArray(),
      db.customers.toArray(),
      db.plans.toArray(),
    ]);
    const cMap = new Map(customers.map((c) => [c.id!, c]));
    const pMap = new Map(plans.map((p) => [p.id!, p]));

    const rows = installments.filter(
      (i) => i.paidAmount < i.amount && i.dueDate >= base && i.dueDate <= limit && cMap.has(i.customerId),
    );

    // پاک کردن زمان‌بندی‌های قبلی (فقط اعلان‌های همین برنامه)
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
      out.cancelled = pending.notifications.length;
    }

    const notifications = [];
    for (const ins of rows) {
      const when = atSendTime(ins.dueDate, cfg.sms.sendAt);
      const customer = cMap.get(ins.customerId)!;
      const plan = pMap.get(ins.planId);
      const remaining = ins.amount - ins.paidAmount;
      if (!when) { out.skipped++; continue; }
      notifications.push({
        id: ins.id!,
        title: `سررسید قسط ${toFa(ins.idx)} — ${customer.name}`,
        body: `${money(remaining)} ${unit} • سررسید ${formatDate(ins.dueDate)}${plan ? ` • ${plan.title}` : ''}`,
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_salari',
        iconColor: '#0d9488',
        largeBody: `مشتری: ${customer.name}\nمانده قرارداد: ${money(remaining)} ${unit}`,
        summaryText: 'سالاری‌اپ',
        schedule: {
          on: when,
          allowWhileIdle: true,
        },
        extra: { installmentId: ins.id, customerId: ins.customerId, dueDate: ins.dueDate },
      });
    }

    if (notifications.length) {
      await LocalNotifications.schedule({ notifications });
      out.scheduled = notifications.length;
    }
    return out;
  } catch (e: any) {
    out.error = String(e?.message || e);
    return out;
  }
}

/** اعلان فوری سیستمی (مثلاً هنگام اجرای موتور در پس‌زمینه) */
export async function nativeNotify(title: string, body: string, id = Math.floor(Math.random() * 2_000_000_000)): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    await ensureChannel();
    await LocalNotifications.schedule({
      notifications: [{ id, title, body, channelId: CHANNEL_ID, smallIcon: 'ic_stat_salari', iconColor: '#0d9488' }],
    });
    return true;
  } catch {
    return false;
  }
}

export async function pendingNativeCount(): Promise<number> {
  if (!isNativeApp()) return 0;
  try {
    const p = await LocalNotifications.getPending();
    return p.notifications.length;
  } catch {
    return 0;
  }
}
