import React, { useCallback, useEffect, useState } from 'react';
import {
  bootstrapNativePermissions, ensureChannel, ensureNativePermission, exactAlarmStatus, isNativeApp,
  notificationPermissionStatus, openAppSettings, openBatteryOptimizationSettings,
  pendingNativeCount, requestExactAlarm, syncNativeReminders, type ExactAlarmState, type PermissionState,
} from '../lib/native';
import { Badge, Button, Card, Icon, Modal, SectionTitle, cx, useToast } from './ui';
import { toFa } from '../lib/format';

const ASKED_KEY = 'salari.permissions.asked.v1';

type RowState = 'ok' | 'off' | 'unknown' | 'na';

function stateOf(v: PermissionState | ExactAlarmState): RowState {
  if (v === 'granted') return 'ok';
  if (v === 'unsupported') return 'na';
  return 'off';
}

function StatusPill({ state }: { state: RowState }) {
  if (state === 'ok') return <Badge tone="ok">فعال</Badge>;
  if (state === 'off') return <Badge tone="danger">غیرفعال</Badge>;
  if (state === 'na') return <Badge tone="muted">نامشخص</Badge>;
  return <Badge tone="muted">در حال بررسی…</Badge>;
}

function PermitRow({
  icon, title, hint, state, action,
}: {
  icon: string; title: string; hint: string; state: RowState; action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface2/60 p-3 min-w-0">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className={cx(
          'w-9 h-9 rounded-lg grid place-items-center shrink-0',
          state === 'ok' ? 'bg-ok-soft text-ok' : state === 'off' ? 'bg-danger-soft text-danger' : 'bg-surface text-muted',
        )}>
          <Icon name={icon} className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[13px] font-semibold truncate">{title}</p>
            <StatusPill state={state} />
          </div>
          <p className="text-[11px] text-muted leading-5 mt-0.5">{hint}</p>
        </div>
      </div>
      {action ? <div className="flex flex-wrap gap-2 mt-2.5">{action}</div> : null}
    </div>
  );
}

/** کارت مدیریت مجوزهای اندروید: درخواست، بررسی و باز کردن صفحه‌های سیستمی */
export function NativePermissionCard({ onDone }: { onDone?: () => void }) {
  const toast = useToast();
  const [notif, setNotif] = useState<PermissionState>('prompt');
  const [exact, setExact] = useState<ExactAlarmState>('unsupported');
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [n, e] = await Promise.all([notificationPermissionStatus(), exactAlarmStatus()]);
    setNotif(n);
    setExact(e);
    return { n, e };
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const nState = stateOf(notif);
  const eState = stateOf(exact);

  async function askNotifications() {
    setBusy('notif');
    await ensureChannel();
    const p = await ensureNativePermission();
    setNotif(p);
    setBusy(null);
    if (p === 'granted') {
      await syncNativeReminders(180);
      toast.push('اجازه اعلان فعال شد', 'ok');
    } else if (p === 'denied') {
      toast.push('اجازه اعلان رد شده؛ از تنظیمات همین اپ روشنش کنید', 'warn');
    }
    onDone?.();
  }

  async function askExact() {
    setBusy('exact');
    const e = await requestExactAlarm();
    setExact(e);
    setBusy(null);
    toast.push(e === 'granted' ? 'یادآور دقیق فعال است' : 'پس از روشن کردن، دوباره بررسی کنید', e === 'granted' ? 'ok' : 'warn');
    onDone?.();
  }

  return (
    <Card>
      <SectionTitle
        icon="shield"
        title="مجوزهای اندروید"
        subtitle="برای اعلان سررسید اقساط، این سه مورد باید تأیید شوند"
        action={<Button size="sm" variant="outline" icon="refresh" onClick={async () => { await refresh(); toast.push('وضعیت مجوزها بررسی شد', 'ok'); }}>بررسی مجدد</Button>}
      />
      <div className="space-y-2.5">
        <PermitRow
          icon="bell"
          title="اجازه اعلان"
          hint={nState === 'ok' ? 'اعلان‌های سررسید روی گوشی نمایش داده می‌شود.' : 'اندروید ۱۳ و بالاتر بدون این اجازه هیچ اعلانی نشان نمی‌دهد.'}
          state={nState}
          action={nState === 'ok' ? undefined : (
            <>
              <Button size="sm" icon="bell" loading={busy === 'notif'} onClick={askNotifications}>درخواست اجازه اعلان</Button>
              <Button size="sm" variant="ghost" icon="settings" onClick={async () => { await openAppSettings(); }}>تنظیمات اپ</Button>
            </>
          )}
        />
        <PermitRow
          icon="clock"
          title="آلارم و یادآور دقیق"
          hint={eState === 'ok' ? 'یادآوری در همان ساعت تعیین‌شده اجرا می‌شود.' : 'در اندروید ۱۲+ باید «آلارم‌ها و یادآورها» برای این اپ روشن باشد.'}
          state={eState}
          action={eState === 'ok' ? undefined : (
            <Button size="sm" variant="outline" icon="clock" loading={busy === 'exact'} onClick={askExact}>باز کردن تنظیمات آلارم</Button>
          )}
        />
        <PermitRow
          icon="battery"
          title="معاف از بهینه‌سازی باتری"
          hint="اگر اعلان‌ها با تأخیر می‌رسند، این اپ را روی «بدون محدودیت» بگذارید."
          state="unknown"
          action={<Button size="sm" variant="outline" icon="battery" onClick={async () => {
            const ok = await openBatteryOptimizationSettings();
            if (!ok) toast.push('این صفحه روی این نسخه اندروید باز نشد', 'warn');
          }}>حذف محدودیت باتری</Button>}
        />
      </div>
      <p className="text-[11px] text-muted leading-6 mt-2.5">
        این مجوزها فقط برای یادآوری سررسید اقساط است؛ داده‌ها همچنان فقط روی همین گوشی ذخیره می‌شود.
      </p>
    </Card>
  );
}

/** پنجره اولین اجرا: درخواست مجوزها همان لحظه‌ای که اپ باز می‌شود */
export function FirstRunPermissions() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isNativeApp()) return;
    let asked = false;
    try { asked = localStorage.getItem(ASKED_KEY) === '1'; } catch { /* حالت خصوصی */ }
    if (asked) {
      // در اجراهای بعدی هم بی‌صدا وضعیت را تازه می‌کنیم و یادآورها را دوباره می‌چینیم
      void bootstrapNativePermissions();
      return;
    }
    setOpen(true);
  }, []);

  async function start() {
    const report = await bootstrapNativePermissions();
    setCount(await pendingNativeCount());
    try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* بی‌اثر */ }
    if (report.notifications === 'granted') toast.push('اجازه اعلان فعال شد', 'ok');
  }

  if (!open) return null;

  return (
    <Modal
      open
      onClose={() => { setOpen(false); try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* بی‌اثر */ } }}
      title="اجازه‌های لازم برای سالاری‌اپ"
      size="md"
      footer={<>
        <Button variant="outline" onClick={() => { setOpen(false); try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* بی‌اثر */ } }}>بعداً</Button>
        <Button icon="check" onClick={start}>درخواست اجازه‌ها</Button>
      </>}
    >
      <p className="text-[12px] text-muted leading-6 mb-3">
        برای اینکه یادآوری سررسید اقساط حتی وقتی برنامه بسته است نمایش داده شود، این اجازه‌ها را تأیید کنید.
      </p>
      <NativePermissionCard onDone={() => { void pendingNativeCount().then(setCount); }} />
      <p className="text-[11px] text-muted leading-6 mt-2">
        {count ? `${toFa(count)} یادآوری آماده ارسال است.` : 'می‌توانید بعداً از صفحه «تنظیمات» هم این اجازه‌ها را بدهید.'}
      </p>
    </Modal>
  );
}
