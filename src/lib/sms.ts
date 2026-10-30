import { db, type SmsLog, type SmsStatus } from './db';
import { todayKey } from './jalali';
import type { AppConfig } from './settings';

/* ------------------------------ قالب پیام‌ها ------------------------------ */

export type SmsVars = Record<string, string | number>;

/** جایگذاری متغیرهای {نام} در قالب */
export function renderTemplate(tpl: string, vars: SmsVars): string {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

/** شمارش کاراکترهای پیامک (فارسی = ۷۰ کاراکتر در هر پیامک) */
export function smsParts(text: string): number {
  const len = [...String(text || '')].length;
  if (len === 0) return 0;
  const limit = len > 70 ? 67 : 70;
  return Math.ceil(len / limit);
}

/* ------------------------------- ارسال پنلی ------------------------------- */

export interface PanelResult {
  ok: boolean;
  message: string;
  raw?: unknown;
}

/**
 * ارسال از طریق پنل پیامکی.
 * نکته: برخی پنل‌ها هدر CORS برنمی‌گردانند؛ در آن صورت خطا ثبت می‌شود و
 * می‌توانید در تنظیمات، «آدرس رله» را وارد کنید تا درخواست از سمت خودتان پروکسی شود.
 */
export async function sendViaPanel(cfg: AppConfig, phone: string, text: string): Promise<PanelResult> {
  const key = cfg.sms.apiKey.trim();
  if (cfg.sms.provider === 'kavenegar') {
    if (!key) return { ok: false, message: 'کلید API کاوه‌نگار تنظیم نشده است.' };
    const params = new URLSearchParams({ receptor: phone, message: text });
    if (cfg.sms.sender) params.set('sender', cfg.sms.sender);
    const url = `https://api.kavenegar.com/v1/${encodeURIComponent(key)}/sms/send.json?${params}`;
    return doFetch(url, 'GET');
  }

  if (cfg.sms.provider === 'melipayamak') {
    if (!cfg.sms.username || !cfg.sms.password) return { ok: false, message: 'نام کاربری/رمز ملی‌پیامک تنظیم نشده است.' };
    const body = JSON.stringify({
      username: cfg.sms.username,
      password: cfg.sms.password,
      to: phone,
      from: cfg.sms.sender || undefined,
      text,
      isFlash: false,
    });
    return doFetch('https://restapi.sms.ir/v1/send/sendVerifyCode', 'POST', body, 'https://api.melipayamak.com/v1/SendSMS');
  }
  return { ok: false, message: 'پنل پیامکی انتخاب نشده است.' };
}

async function doFetch(url: string, method: 'GET' | 'POST', body?: string, fallbackUrl?: string): Promise<PanelResult> {
  const targets = [url, fallbackUrl].filter(Boolean) as string[];
  let lastErr = 'خطای نامشخص';
  for (const target of targets) {
    try {
      const res = await fetch(target, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      });
      const txt = await res.text();
      let json: any = null;
      try { json = JSON.parse(txt); } catch { /* پاسخ غیر JSON */ }
      const okStatus = res.ok && (!json || json.return?.status === 200 || json.success || json.IsSuccessful !== false);
      if (okStatus) return { ok: true, message: 'ارسال شد', raw: json ?? txt };
      lastErr = json?.return?.message || json?.message || json?.ErrorMessage || `کد HTTP ${res.status}`;
      if (res.status >= 400 && res.status < 500) return { ok: false, message: String(lastErr) };
    } catch (e: any) {
      lastErr = e?.message?.includes('Failed to fetch')
        ? 'ارتباط با پنل برقرار نشد (احتمالاً محدودیت CORS مرورگر)؛ از «آدرس رله» در تنظیمات استفاده کنید.'
        : String(e?.message || e);
    }
  }
  return { ok: false, message: lastErr };
}

/* --------------------------- ارسال دستی (اپ گوشی) -------------------------- */

/**
 * ساخت لینک sms: تا اپ پیامک گوشی با شماره و متن آماده باز شود.
 * در اندروید این روش بدون هیچ مجوز اضافه‌ای کار می‌کند.
 */
export function smsUri(phone: string, text: string): string {
  const body = encodeURIComponent(String(text || '').replace(/\r?\n/g, '\n'));
  const sep = /iPad|iPhone|iPod/.test(navigator.userAgent) ? '&' : '?';
  return `sms:${phone}${sep}body=${body}`;
}

export function openNativeSms(phone: string, text: string): void {
  window.location.href = smsUri(phone, text);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------- لاگ ---------------------------------- */

export async function logSms(entry: {
  phone: string;
  message: string;
  status: SmsStatus;
  provider: string;
  kind: string;
  customerId?: number | null;
  customerName?: string;
  installmentId?: number | null;
  error?: string;
}): Promise<number> {
  const row: SmsLog = {
    customerId: entry.customerId ?? null,
    customerName: entry.customerName || '—',
    phone: entry.phone,
    message: entry.message,
    status: entry.status,
    provider: entry.provider,
    kind: entry.kind,
    installmentId: entry.installmentId ?? null,
    error: entry.error,
    createdAt: new Date().toISOString(),
    date: todayKey(),
  };
  return (await db.smsLogs.add(row)) as number;
}

/** شمارش پیامک‌های ارسال‌شده امروز (برای سقف روزانه) */
export async function sentTodayCount(base = todayKey()): Promise<number> {
  return db.smsLogs.where('date').equals(base).and((r) => r.status === 'sent').count();
}

/* ------------------------- موتور ارسال خودکار یک قسط ------------------------ */

export interface AutoSendDeps {
  cfg: AppConfig;
  unit: string;
  shopName: string;
}

export interface AutoSendTarget {
  installmentId: number;
  phone: string;
  vars: SmsVars;
  kind: 'due' | 'overdue' | 'reminder';
  customerId?: number;
  customerName: string;
}

/** ارسال واقعی برای یک هدف: پنلی یا صف دستی */
export async function dispatch(deps: AutoSendDeps, t: AutoSendTarget): Promise<{ status: SmsStatus; error?: string }> {
  const template = t.kind === 'overdue' ? deps.cfg.sms.templates.overdue : deps.cfg.sms.templates.due;
  const message = renderTemplate(template, t.vars);
  const provider = deps.cfg.sms.mode === 'panel' ? deps.cfg.sms.provider : 'manual';

  if (deps.cfg.sms.mode === 'panel' && deps.cfg.sms.autoSend) {
    const res = await sendViaPanel(deps.cfg, t.phone, message);
    await logSms({
      phone: t.phone,
      message,
      status: res.ok ? 'sent' : 'failed',
      provider,
      kind: t.kind,
      customerId: t.customerId,
      customerName: t.customerName,
      installmentId: t.installmentId,
      error: res.ok ? undefined : res.message,
    });
    return { status: res.ok ? 'sent' : 'failed', error: res.message };
  }

  // حالت دستی: در صف قرار می‌گیرد تا کاربر با یک لمس از «مرکز پیامک» ارسال کند
  await logSms({
    phone: t.phone,
    message,
    status: 'queued',
    provider,
    kind: t.kind,
    customerId: t.customerId,
    customerName: t.customerName,
    installmentId: t.installmentId,
  });
  return { status: 'queued' };
}
