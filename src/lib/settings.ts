import { getSetting, setSetting } from './db';

export type SmsMode = 'manual' | 'panel';
export type SmsProvider = 'kavenegar' | 'melipayamak';

export interface SmsTemplates {
  due: string;
  overdue: string;
  receipt: string;
  welcome: string;
  lowStock: string;
}

export interface AppConfig {
  shop: { name: string; phone: string; address: string; manager: string };
  currency: 'toman' | 'rial';
  theme: 'light' | 'dark';
  invoiceFooter: string;
  taxPercent: number;
  sms: {
    mode: SmsMode;
    provider: SmsProvider;
    apiKey: string;
    sender: string;
    username: string;
    password: string;
    autoSend: boolean;
    sendAt: string; // HH:MM
    daysBefore: number;
    dailyCap: number;
    retryFailed: boolean;
    templates: SmsTemplates;
  };
  background: {
    enabled: boolean;
    periodicSync: boolean;
    wakeLock: boolean;
    systemNotify: boolean;
    keepAlive: boolean;
  };
  backup: {
    auto: boolean;
    intervalDays: number;
    keep: number;
    lastAutoAt: string | null;
    driveEnabled: boolean;
    driveClientId: string;
    driveFolderId: string;
  };
  lowStockAlert: boolean;
}

export const DEFAULT_TEMPLATES: SmsTemplates = {
  due: 'سلام {name} عزیز\nقسط {idx} از {count} شما به مبلغ {amount} {unit} امروز ({due}) سررسید می‌شود.\nمانده کل: {debt} {unit}\n{shop}',
  overdue: 'سلام {name} عزیز\nقسط {idx} شما به مبلغ {amount} {unit} به تاریخ {due} هنوز پرداخت نشده است ({late} روز تأخیر).\nمانده: {debt} {unit}\nلطفاً جهت تسویه اقدام فرمایید.\n{shop}',
  receipt: '{name} عزیز\nواریزی شما به مبلغ {amount} {unit} در تاریخ {date} ثبت شد.\nمانده بدهی: {debt} {unit}\n{shop}',
  welcome: '{name} عزیز، ثبت‌نام شما در {shop} انجام شد. شماره تماس: {phone}',
  lowStock: 'هشدار انبار: موجودی {product} به {qty} رسیده است. ({shop})',
};

export const DEFAULT_CONFIG: AppConfig = {
  shop: { name: 'فروشگاه لوازم خانگی سالاری', phone: '09120000000', address: '', manager: '' },
  currency: 'toman',
  theme: 'light',
  invoiceFooter: 'از خرید شما سپاسگزاریم. کالای فروخته‌شده تا ۴۸ ساعت قابل تعویض است.',
  taxPercent: 0,
  sms: {
    mode: 'manual',
    provider: 'kavenegar',
    apiKey: '',
    sender: '',
    username: '',
    password: '',
    autoSend: false,
    sendAt: '09:00',
    daysBefore: 0,
    dailyCap: 200,
    retryFailed: true,
    templates: DEFAULT_TEMPLATES,
  },
  background: {
    enabled: true,
    periodicSync: true,
    wakeLock: false,
    systemNotify: true,
    keepAlive: true,
  },
  backup: {
    auto: true,
    intervalDays: 1,
    keep: 14,
    lastAutoAt: null,
    driveEnabled: false,
    driveClientId: '',
    driveFolderId: 'appDataFolder',
  },
  lowStockAlert: true,
};

/** ادغام عمیق تنظیمات ذخیره‌شده با مقادیر پیش‌فرض */
export function mergeConfig(partial: unknown): AppConfig {
  const deep = (a: any, b: any): any => {
    if (b === null || b === undefined) return a;
    if (Array.isArray(a) || typeof a !== 'object' || typeof b !== 'object') return b;
    const out: any = { ...a };
    for (const k of Object.keys(a)) out[k] = deep(a[k], b[k]);
    for (const k of Object.keys(b)) if (!(k in a)) out[k] = b[k];
    return out;
  };
  return deep(DEFAULT_CONFIG, partial ?? {}) as AppConfig;
}

export async function loadConfig(): Promise<AppConfig> {
  return mergeConfig(await getSetting<unknown>('config', null));
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  await setSetting('config', cfg);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('config-changed', { detail: cfg }));
}

export const UNIT_LABEL = (c: AppConfig) => (c.currency === 'toman' ? 'تومان' : 'ریال');
