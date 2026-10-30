/**
 * وضعیت یکپارچه «دسترسی اعلان» برای هر دو حالت وب و اپ اندروید
 * — در اپ اندروید، منبع حقیقت مجوز بومی (POST_NOTIFICATIONS) است، نه API وب
 */
import {
  exactAlarmStatus, ensureNativePermission, isNativeApp, notificationPermissionStatus,
} from './native';
import { askNotificationPermission } from './notify';

export type AccessState = 'granted' | 'denied' | 'prompt' | 'unsupported';

/** رویدادی که هر جای برنامه پس از تغییر مجوزها منتشر می‌کند تا داشبورد تازه شود */
export const ACCESS_EVENT = 'salari-access-change';

export function emitAccessChange(): void {
  try { window.dispatchEvent(new CustomEvent(ACCESS_EVENT)); } catch { /* بی‌اثر */ }
}

/** خواندن وضعیت فعلی بدون باز کردن هیچ پنجره‌ای */
export async function notificationAccess(): Promise<AccessState> {
  if (isNativeApp()) return notificationPermissionStatus();
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : (Notification.permission as AccessState);
}

/** درخواست اجازه: در اندروید پنجره سیستمی بومی، در مرورگر پنجره وب */
export async function requestNotificationAccess(): Promise<AccessState> {
  if (isNativeApp()) return ensureNativePermission();
  const res = await askNotificationPermission();
  if (res === 'default') return 'prompt';
  return res as AccessState;
}

/** آیا آلارم دقیق (اندروید ۱۲+) روشن است؟ در وب همیشه نامشخص */
export async function exactAlarmAccess(): Promise<AccessState> {
  if (!isNativeApp()) return 'unsupported';
  return exactAlarmStatus();
}

/** مشترک شدن در تغییر وضعیت: رویداد برنامه + بازگشت به برنامه + فوکوس پنجره */
export function onAccessChange(cb: () => void): () => void {
  const onVisible = () => { if (document.visibilityState === 'visible') cb(); };
  window.addEventListener(ACCESS_EVENT, cb);
  window.addEventListener('focus', cb);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener(ACCESS_EVENT, cb);
    window.removeEventListener('focus', cb);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
