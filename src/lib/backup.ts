/**
 * پشتیبان‌گیری: خودکار (زمان‌بندی‌شده داخل اپ) + دستی (فایل) + گوگل‌درایو
 */
import { db } from './db';
import { todayKey } from './jalali';
import { loadConfig, saveConfig, type AppConfig } from './settings';

export interface BackupPayload {
  meta: {
    app: 'salariapp';
    version: number;
    createdAt: string;
    date: string;
    source: 'auto' | 'manual' | 'drive';
    shop?: string;
    counts: Record<string, number>;
  };
  data: {
    categories: unknown[];
    products: unknown[];
    customers: unknown[];
    sales: unknown[];
    saleItems: unknown[];
    plans: unknown[];
    installments: unknown[];
    payments: unknown[];
    stockMoves: unknown[];
    smsLogs: unknown[];
    notifications: unknown[];
    settings: unknown[];
  };
}

const TABLES = [
  'categories', 'products', 'customers', 'sales', 'saleItems',
  'plans', 'installments', 'payments', 'stockMoves', 'smsLogs', 'notifications',
] as const;

export async function buildBackup(source: 'auto' | 'manual' = 'manual'): Promise<BackupPayload> {
  const out: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = await (db as any)[t].toArray();
    out[t] = rows;
    counts[t] = rows.length;
  }
  const settings = await db.settings.toArray();
  counts.settings = settings.length;
  const cfg = await loadConfig();
  return {
    meta: {
      app: 'salariapp',
      version: 1,
      createdAt: new Date().toISOString(),
      date: todayKey(),
      source,
      shop: cfg.shop.name,
      counts,
    },
    data: { ...(out as any), settings },
  };
}

export async function saveBackupRecord(source: 'auto' | 'manual' | 'drive', note?: string): Promise<number> {
  const payload = await buildBackup(source === 'drive' ? 'manual' : source);
  const json = JSON.stringify(payload);
  const id = (await db.backups.add({
    createdAt: new Date().toISOString(),
    date: todayKey(),
    source,
    note,
    size: json.length,
    data: payload,
  })) as number;
  await pruneBackups();
  return id;
}

/** حذف نسخه‌های قدیمی‌تر از حد مجاز */
export async function pruneBackups(keep?: number): Promise<number> {
  const cfg = await loadConfig();
  const max = keep ?? Math.max(3, cfg.backup.keep || 14);
  const all = await db.backups.orderBy('createdAt').reverse().toArray();
  const extra = all.slice(max);
  if (extra.length) await db.backups.bulkDelete(extra.map((b) => b.id!));
  return extra.length;
}

/** اگر زمان پشتیبان خودکار رسیده باشد، یک نسخه می‌سازد */
export async function maybeAutoBackup(cfg?: AppConfig): Promise<boolean> {
  const c = cfg || (await loadConfig());
  if (!c.backup.auto) return false;
  const last = c.backup.lastAutoAt ? new Date(c.backup.lastAutoAt).getTime() : 0;
  const interval = Math.max(1, c.backup.intervalDays || 1) * 24 * 3600 * 1000;
  if (last && Date.now() - last < interval) return false;
  await saveBackupRecord('auto', 'پشتیبان خودکار');
  await saveConfig({ ...c, backup: { ...c.backup, lastAutoAt: new Date().toISOString() } });
  return true;
}

/* ------------------------------ فایل دستی -------------------------------- */

export function downloadJson(payload: unknown, filename?: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 0)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  a.href = url;
  a.download = filename || `salariapp-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function readJsonFile(file: File): Promise<BackupPayload> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed?.data || !parsed?.meta) throw new Error('فایل معتبر نیست: ساختار پشتیبان سالاری‌اپ یافت نشد.');
  return parsed as BackupPayload;
}

export async function restoreBackup(payload: BackupPayload, mode: 'replace' | 'merge' = 'replace'): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await db.transaction('rw', [...TABLES.map((t) => (db as any)[t]), db.backups], async () => {
    for (const t of TABLES) {
      const rows = (payload.data as any)[t] || [];
      if (mode === 'replace') await (db as any)[t].clear();
      if (rows.length) await (db as any)[t].bulkPut(rows);
      counts[t] = rows.length;
    }
  });
  return counts;
}

export async function wipeAllData(): Promise<void> {
  await db.transaction('rw', [...TABLES.map((t) => (db as any)[t])], async () => {
    for (const t of TABLES) await (db as any)[t].clear();
  });
}

/* ------------------------------ گوگل‌درایو -------------------------------- */

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

declare global {
  interface Window { google?: any }
}

let gsiLoading: Promise<boolean> | null = null;

function loadGsi(): Promise<boolean> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(true);
  if (gsiLoading) return gsiLoading;
  gsiLoading = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(!!window.google?.accounts?.oauth2);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
    setTimeout(() => resolve(!!window.google?.accounts?.oauth2), 9000);
  });
  return gsiLoading;
}

export async function driveToken(clientId: string): Promise<string | null> {
  const ok = await loadGsi();
  if (!ok) throw new Error('کتابخانه ورود گوگل بارگذاری نشد (اتصال اینترنت لازم است).');
  return new Promise((resolve) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp: any) => resolve(resp?.access_token || null),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/** آپلود نسخه پشتیبان روی گوگل‌درایو کاربر */
export async function uploadToDrive(cfg: AppConfig, payload: BackupPayload): Promise<{ ok: boolean; message: string; url?: string }> {
  if (!cfg.backup.driveClientId) return { ok: false, message: 'شناسه کلاینت گوگل در تنظیمات وارد نشده است.' };
  try {
    const token = await driveToken(cfg.backup.driveClientId);
    if (!token) return { ok: false, message: 'ورود به گوگل انجام نشد.' };
    const name = `salariapp-${new Date().toISOString().slice(0, 10)}.json`;
    const meta = { name, parents: [cfg.backup.driveFolderId || 'appDataFolder'], mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) return { ok: false, message: `خطای درایو: ${res.status}` };
    const json = await res.json();
    return { ok: true, message: 'روی گوگل‌درایو ذخیره شد.', url: `https://drive.google.com/file/d/${json.id}/view` };
  } catch (e: any) {
    return { ok: false, message: String(e?.message || e) };
  }
}

export async function downloadFromDrive(cfg: AppConfig): Promise<BackupPayload | null> {
  if (!cfg.backup.driveClientId) return null;
  const token = await driveToken(cfg.backup.driveClientId);
  if (!token) return null;
  const q = encodeURIComponent("name contains 'salariapp-' and mimeType = 'application/json' and trashed = false");
  const list = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const file = list?.files?.[0];
  if (!file) return null;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok ? await res.json() : null;
}
