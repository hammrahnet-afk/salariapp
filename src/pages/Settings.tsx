import React, { useState } from 'react';
import { DEFAULT_TEMPLATES } from '../lib/settings';
import { Field, Input, SectionTitle, Select, Toggle, Button, Card, Badge, useToast, cx } from '../components/ui';
import { useApp } from '../state';
import { askNotificationPermission } from '../lib/notify';
import { requestWakeLock, releaseWakeLock, wakeLockState, engineStatus } from '../lib/engine';
import { scheduler } from '../lib/scheduler';
import { smsParts } from '../lib/sms';
import { toFa } from '../lib/format';
import { formatDate, todayKey } from '../lib/jalali';
import { ensureNativePermission, isNativeApp, pendingNativeCount, platformName, syncNativeReminders } from '../lib/native';
import { NativePermissionCard } from '../components/Permissions';
import { useEffect } from 'react';

export default function Settings() {
  const { cfg, update, unit, toggleTheme } = useApp();
  const toast = useToast();
  const [nativeCount, setNativeCount] = useState<number | null>(null);
  useEffect(() => {
    pendingNativeCount().then(setNativeCount);
  }, []);

  const [previewVars] = useState({
    name: 'علی محمدی', amount: '۴٬۵۰۰٬۰۰۰', unit, due: formatDate(todayKey()),
    idx: 3, count: 12, debt: '۱۸٬۰۰۰٬۰۰۰', late: 2, shop: cfg.shop.name, phone: cfg.shop.phone, date: formatDate(todayKey()),
    product: 'یخچال ساید اسنوا', qty: '۱',
  });

  const setSms = (patch: Partial<typeof cfg.sms>) => update({ sms: { ...cfg.sms, ...patch } });
  const setBg = (patch: Partial<typeof cfg.background>) => update({ background: { ...cfg.background, ...patch } });
  const setBackup = (patch: Partial<typeof cfg.backup>) => update({ backup: { ...cfg.backup, ...patch } });

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Card>
        <SectionTitle icon="shield" title="مشخصات فروشگاه" subtitle="در پیامک‌ها و فاکتور چاپ می‌شود" />
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="نام فروشگاه" className="sm:col-span-2"><Input value={cfg.shop.name} onChange={(e) => update({ shop: { ...cfg.shop, name: e.target.value } })} /></Field>
          <Field label="شماره تماس"><Input value={cfg.shop.phone} onChange={(e) => update({ shop: { ...cfg.shop, phone: e.target.value } })} className="nums" dir="ltr" /></Field>
          <Field label="نام مدیر"><Input value={cfg.shop.manager} onChange={(e) => update({ shop: { ...cfg.shop, manager: e.target.value } })} /></Field>
          <Field label="آدرس" className="sm:col-span-2"><Input value={cfg.shop.address} onChange={(e) => update({ shop: { ...cfg.shop, address: e.target.value } })} /></Field>
          <Field label="متن پایین فاکتور" className="sm:col-span-2"><Input value={cfg.invoiceFooter} onChange={(e) => update({ invoiceFooter: e.target.value })} /></Field>
        </div>
      </Card>

      <Card>
        <SectionTitle icon="settings" title="تنظیمات عمومی" />
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="واحد پول">
            <Select value={cfg.currency} onChange={(e) => update({ currency: e.target.value as 'toman' | 'rial' })}>
              <option value="toman">تومان</option>
              <option value="rial">ریال</option>
            </Select>
          </Field>
          <Field label="پوسته">
            <Select value={cfg.theme} onChange={(e) => update({ theme: e.target.value as 'light' | 'dark' })}>
              <option value="light">روشن</option>
              <option value="dark">تیره</option>
            </Select>
          </Field>
          <Field label="مالیات بر فاکتور (٪)"><Input value={toFa(cfg.taxPercent)} onChange={(e) => update({ taxPercent: Number(e.target.value.replace(/[^\d۰-۹]/g, '')) || 0 })} className="nums" /></Field>
          <div className="flex items-end"><Button variant="outline" block icon="refresh" onClick={toggleTheme}>تغییر سریع پوسته</Button></div>
        </div>
        <Toggle label="هشدار کمبود موجودی" hint="وقتی موجودی کالا به نقطه سفارش برسد اعلان می‌گیرید" checked={cfg.lowStockAlert} onChange={(v) => update({ lowStockAlert: v })} />
      </Card>

      <Card>
        <SectionTitle icon="message" title="تنظیمات پیامک" subtitle="یادآوری سررسید قسط و رسید واریزی" />

        <Field label="روش ارسال" hint="پنل = ارسال خودکار و بدون دخالت شما؛ دستی = باز شدن اپ پیامک گوشی">
          <Select value={cfg.sms.mode} onChange={(e) => setSms({ mode: e.target.value as any })}>
            <option value="manual">دستی (اپ پیامک گوشی)</option>
            <option value="panel">خودکار (پنل پیامکی)</option>
          </Select>
        </Field>

        {cfg.sms.mode === 'panel' ? (
          <div className="mt-3 space-y-3">
            <Field label="پنل پیامکی">
              <Select value={cfg.sms.provider} onChange={(e) => setSms({ provider: e.target.value as any })}>
                <option value="kavenegar">کاوه‌نگار</option>
                <option value="melipayamak">ملی‌پیامک</option>
              </Select>
            </Field>
            {cfg.sms.provider === 'kavenegar' ? (
              <>
                <Field label="کلید API کاوه‌نگار" hint="از پنل کاربری کاوه‌نگار کپی کنید"><Input value={cfg.sms.apiKey} onChange={(e) => setSms({ apiKey: e.target.value })} dir="ltr" className="nums" /></Field>
                <Field label="شماره فرستنده (اختیاری)"><Input value={cfg.sms.sender} onChange={(e) => setSms({ sender: e.target.value })} dir="ltr" className="nums" /></Field>
              </>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="نام کاربری"><Input value={cfg.sms.username} onChange={(e) => setSms({ username: e.target.value })} dir="ltr" /></Field>
                <Field label="رمز عبور"><Input type="password" value={cfg.sms.password} onChange={(e) => setSms({ password: e.target.value })} dir="ltr" /></Field>
                <Field label="شماره فرستنده" className="sm:col-span-2"><Input value={cfg.sms.sender} onChange={(e) => setSms({ sender: e.target.value })} dir="ltr" className="nums" /></Field>
              </div>
            )}
            <Toggle label="ارسال خودکار در روز سررسید" hint="بدون دخالت شما، رأس ساعت تعیین‌شده ارسال می‌شود" checked={cfg.sms.autoSend} onChange={(v) => setSms({ autoSend: v })} />
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="ساعت ارسال">
                <Select value={cfg.sms.sendAt} onChange={(e) => setSms({ sendAt: e.target.value })}>
                  {['08:00', '09:00', '10:00', '11:00', '12:00', '16:00', '18:00', '20:00'].map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
              <Field label="یادآوری چند روز قبل"><Input value={toFa(cfg.sms.daysBefore)} onChange={(e) => setSms({ daysBefore: Number(e.target.value.replace(/[^\d۰-۹]/g, '')) || 0 })} className="nums" /></Field>
              <Field label="سقف پیامک روزانه"><Input value={toFa(cfg.sms.dailyCap)} onChange={(e) => setSms({ dailyCap: Number(e.target.value.replace(/[^\d۰-۹]/g, '')) || 100 })} className="nums" /></Field>
            </div>
            <p className="text-[11px] text-muted leading-6">
              نکته: اگر پنل شما هدر CORS برنگرداند، مرورگر اجازه ارسال مستقیم نمی‌دهد. در این حالت یا از حالت «دستی» استفاده کنید یا یک رله ساده روی سرور خود بگذارید.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-muted leading-6 mt-2">
            در حالت دستی، پیامک‌های سررسید در «مرکز پیامک» صف می‌شوند و با یک لمس، اپ پیامک گوشی با شماره و متن آماده باز می‌شود.
          </p>
        )}

        <div className="mt-4 space-y-3">
          <TemplateEditor label="قالب یادآوری سررسید" value={cfg.sms.templates.due} onChange={(v) => setSms({ templates: { ...cfg.sms.templates, due: v } })} preview={previewVars} />
          <TemplateEditor label="قالب قسط معوق" value={cfg.sms.templates.overdue} onChange={(v) => setSms({ templates: { ...cfg.sms.templates, overdue: v } })} preview={previewVars} />
          <TemplateEditor label="قالب رسید واریزی" value={cfg.sms.templates.receipt} onChange={(v) => setSms({ templates: { ...cfg.sms.templates, receipt: v } })} preview={previewVars} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon="refresh" onClick={() => setSms({ templates: DEFAULT_TEMPLATES })}>بازگردانی قالب‌های پیش‌فرض</Button>
            <span className="text-[11px] text-muted self-center">متغیرها: {'{name} {amount} {unit} {due} {idx} {count} {debt} {late} {shop} {phone} {date}'}</span>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle icon="power" title="اجرای پس‌زمینه و اعلان‌ها" subtitle="برای اینکه یادآوری‌ها حتی وقتی برنامه را نبسته‌اید انجام شود" />
        <Toggle label="موتور یادآوری فعال باشد" hint="هر ۶۰ ثانیه اقساط سررسیدشده بررسی می‌شود" checked={cfg.background.enabled} onChange={async (v) => { await update({ background: { ...cfg.background, enabled: v } }); await scheduler.restart(); }} />
        <Toggle label="اجرای پس‌زمینه مرورگر (Periodic Sync)" hint="فقط وقتی اپ روی گوشی نصب شده باشد؛ کروم اندروید آن را زمان‌بندی می‌کند" checked={cfg.background.periodicSync} onChange={async (v) => { await setBg({ periodicSync: v }); if (v) await scheduler.registerPeriodic(); }} />
        <Toggle label="حالت همیشه‌روشن (Wake Lock)" hint="صفحه خاموش نمی‌شود تا برنامه در جریان بماند (مصرف باتری بیشتر)" checked={cfg.background.wakeLock} onChange={async (v) => { await setBg({ wakeLock: v }); if (v) await requestWakeLock(); else await releaseWakeLock(); }} />
        <Toggle label="اعلان سیستمی روی گوشی" hint="نمایش نوتیفیکیشن در نوار اعلان اندروید" checked={cfg.background.systemNotify} onChange={async (v) => {
          await setBg({ systemNotify: v });
          if (v) {
            const p = await askNotificationPermission();
            toast.push(p === 'granted' ? 'اجازه اعلان داده شد' : p === 'denied' ? 'اجازه اعلان رد شد' : 'اعلان در این مرورگر پشتیبانی نمی‌شود', p === 'granted' ? 'ok' : 'warn');
          }
        }} />
        <div className="flex flex-wrap gap-2 mt-2">
          <Button size="sm" variant="outline" icon="bell" onClick={async () => {
            const p = await askNotificationPermission();
            toast.push(p === 'granted' ? 'اعلان‌ها فعال شد' : 'اجازه داده نشد', p === 'granted' ? 'ok' : 'warn');
          }}>درخواست اجازه اعلان</Button>
          <Button size="sm" variant="outline" icon="refresh" onClick={async () => {
            const s = await engineStatus();
            toast.push(`وضعیت: موتور ${s.enabled ? 'فعال' : 'غیرفعال'} • پس‌زمینه ${s.periodic}`, 'info');
          }}>بررسی وضعیت موتور</Button>
        </div>
        <p className="text-[11px] text-muted leading-6 mt-2">
          برای بهترین نتیجه، اپ را روی گوشی «نصب» کنید (از منوی مرورگر: افزودن به صفحه اصلی) و اجازه اعلان و همگام‌سازی پس‌زمینه را بدهید.
        </p>
      </Card>

      {isNativeApp() ? <NativePermissionCard /> : null}

      {isNativeApp() ? (
        <Card>
          <SectionTitle icon="phone" title="اعلان‌های بومی اندروید" subtitle="زمان‌بندی سیستمی سررسید اقساط (حتی وقتی برنامه بسته است)" />
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-line bg-surface2 p-2.5 min-w-0">
              <p className="text-[10px] text-muted">پلتفرم</p>
              <p className="text-[12px] font-semibold truncate">اندروید ({platformName()})</p>
            </div>
            <div className="rounded-xl border border-line bg-surface2 p-2.5 min-w-0">
              <p className="text-[10px] text-muted">اعلان‌های زمان‌بندی‌شده</p>
              <p className="text-[12px] font-semibold nums truncate">{nativeCount === null ? '—' : toFa(nativeCount)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button size="sm" icon="bell" onClick={async () => {
              const p = await ensureNativePermission();
              toast.push(p === 'granted' ? 'اجازه اعلان داده شد' : 'اجازه اعلان داده نشد', p === 'granted' ? 'ok' : 'warn');
              setNativeCount(await pendingNativeCount());
            }}>درخواست اجازه اعلان</Button>
            <Button size="sm" variant="outline" icon="refresh" onClick={async () => {
              const r = await syncNativeReminders(180);
              setNativeCount(await pendingNativeCount());
              toast.push(r.error ? r.error : `${toFa(r.scheduled)} اعلان زمان‌بندی شد`, r.error ? 'danger' : 'ok');
            }}>همگام‌سازی اعلان‌ها</Button>
          </div>
          <p className="text-[11px] text-muted leading-6 mt-2">
            با نصب اپ اندروید، اعلان سررسید هر قسط در همان روز و ساعتِ ارسالِ تعیین‌شده نمایش داده می‌شود،
            حتی اگر برنامه باز نباشد. برای ارسال پیامک خودکار بدون باز کردن برنامه، به پنل پیامکی متصل شوید.
          </p>
        </Card>
      ) : null}

      <Card>
        <SectionTitle icon="cloud" title="اتصال گوگل‌درایو" subtitle="برای پشتیبانی ابری اختیاری" />
        <Field label="شناسه کلاینت OAuth (Client ID)" hint="از Google Cloud Console → APIs → Credentials" className="mt-2">
          <Input value={cfg.backup.driveClientId} onChange={(e) => setBackup({ driveClientId: e.target.value })} dir="ltr" placeholder="123456-abc.apps.googleusercontent.com" />
        </Field>
        <Field label="پوشه مقصد" className="mt-2">
          <Input value={cfg.backup.driveFolderId} onChange={(e) => setBackup({ driveFolderId: e.target.value })} dir="ltr" />
        </Field>
      </Card>

      <Card>
        <SectionTitle icon="spark" title="درباره سالاری‌اپ" />
        <p className="text-[12px] text-muted leading-7">
          نسخه {toFa(1)}٫{toFa(0)}٫{toFa(2)} • طراحی‌شده برای فروشگاه‌های لوازم خانگی و آشپزخانه.
          <br />تمام داده‌ها به‌صورت آفلاین روی دستگاه شما ذخیره می‌شود و هیچ اطلاعاتی به سرور دیگری ارسال نمی‌شود.
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge tone="brand">حسابداری فروش</Badge>
          <Badge tone="info">انبار و موجودی</Badge>
          <Badge tone="warn">قسط‌بندی و سررسید</Badge>
          <Badge tone="ok">پیامک یادآوری</Badge>
        </div>
      </Card>
    </div>
  );
}

function TemplateEditor({ label, value, onChange, preview }: { label: string; value: string; onChange: (v: string) => void; preview: Record<string, string | number> }) {
  const [open, setOpen] = useState(false);
  const filled = value.replace(/\{(\w+)\}/g, (m, k) => (preview[k] !== undefined ? String(preview[k]) : m));
  return (
    <div className="rounded-xl border border-line bg-surface2/60 p-3">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-[13px] font-medium truncate">{label}</span>
        <button className="text-[11px] text-brand whitespace-nowrap" onClick={() => setOpen((o) => !o)}>{open ? 'بستن' : 'ویرایش'}</button>
      </div>
      {open ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4}
          className="w-full mt-2 px-3 py-2 rounded-xl border border-line bg-surface text-[12px] leading-6 resize-y" />
      ) : null}
      <p className="text-[11px] text-muted mt-1.5 leading-6 whitespace-pre-wrap">{filled}</p>
      <p className="text-[10px] text-muted mt-1">{toFa(smsParts(filled))} پیامک</p>
    </div>
  );
}
