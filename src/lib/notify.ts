import { db, type AppNotification } from './db';

export type NewNotification = Omit<AppNotification, 'id' | 'read' | 'createdAt'>;

/** اعلان داخلی + اعلان سیستمی (در صورت اجازه) */
export async function addNotification(n: NewNotification): Promise<number> {
  const id = (await db.notifications.add({
    ...n,
    read: 0,
    createdAt: new Date().toISOString(),
  })) as number;
  showSystemNotification(n.title, n.body);
  return id;
}

export function showSystemNotification(title: string, body: string): void {
  try {
    // اجرای داخل Service Worker
    const sw = self as any;
    if (sw?.registration?.showNotification) {
      sw.registration.showNotification(title, { body, dir: 'rtl', lang: 'fa', tag: title, icon: 'icons/icon-192.png' });
      return;
    }
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    // در Service Worker ثبت‌شده، از همان‌جا نمایش بده (روی اندروید پایدارتر است)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, { body, dir: 'rtl', lang: 'fa', tag: title, icon: 'icons/icon-192.png' }).catch(() => {
          new Notification(title, { body, dir: 'rtl', lang: 'fa' });
        });
      });
      return;
    }
    new Notification(title, { body, dir: 'rtl', lang: 'fa' });
  } catch { /* اعلان سیستمی اختیاری است */ }
}

export async function askNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function unreadCount(): Promise<number> {
  return db.notifications.where('read').equals(0).count();
}

export async function markAllRead(): Promise<void> {
  await db.notifications.where('read').equals(0).modify({ read: 1 });
}

export async function clearOldNotifications(keep = 200): Promise<void> {
  const all = await db.notifications.orderBy('createdAt').reverse().toArray();
  const extra = all.slice(keep);
  if (extra.length) await db.notifications.bulkDelete(extra.map((n) => n.id!));
}
