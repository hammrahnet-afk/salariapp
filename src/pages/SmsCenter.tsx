import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SmsLog } from '../lib/db';
import { Badge, Button, Card, EmptyState, Icon, IconButton, ListRow, SectionTitle, Segmented, StatCard, cx, useToast } from '../components/ui';
import { useApp } from '../state';
import { UNIT_LABEL } from '../lib/settings';
import { copyToClipboard, dispatch, openNativeSms, renderTemplate, sentTodayCount, smsParts } from '../lib/sms';
import { formatDate, todayKey } from '../lib/jalali';
import { money, moneyShort, toFa } from '../lib/format';
import { engineStatus, runAutoSend } from '../lib/engine';
import { scheduler } from '../lib/scheduler';

type Tab = 'queue' | 'sent' | 'failed' | 'all';
type Status = Awaited<ReturnType<typeof engineStatus>>;

export default function SmsCenter() {
  const toast = useToast();
  const { cfg, unit } = useApp();
  const [tab, setTab] = useState<Tab>('queue');
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => engineStatus().then(setStatus);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [cfg]);

  const logs = useLiveQuery(() => db.smsLogs.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const today = todayKey();

  const counts = useMemo(() => ({
    queue: logs.filter((l) => l.status === 'queued').length,
    sent: logs.filter((l) => l.status === 'sent').length,
    failed: logs.filter((l) => l.status === 'failed').length,
    today: logs.filter((l) => l.date === today && l.status === 'sent').length,
  }), [logs, today]);

  const filtered = useMemo(() => {
    if (tab === 'queue') return logs.filter((l) => l.status === 'queued');
    if (tab === 'sent') return logs.filter((l) => l.status === 'sent');
    if (tab === 'failed') return logs.filter((l) => l.status === 'failed');
    return logs;
  }, [logs, tab]);

  /** ارسال کل صف */
  async function sendQueue() {
    const queue = logs.filter((l) => l.status === 'queued');
    if (!queue.length) { toast.push('صفی برای ارسال نیست', 'warn'); return; }
    if (cfg.sms.mode !== 'panel') {
      toast.push('در حالت دستی، پیامک‌ها یکی‌یکی در اپ پیامک گوشی باز می‌شوند', 'info');
      openNativeSms(queue[0].phone, queue[0].message);
      return;
    }
    setBusy(true);
    let ok = 0, fail = 0;
    for (const item of queue.slice(0, 50)) {
      const out = await dispatch({ cfg, unit, shopName: cfg.shop.name }, {
        installmentId: item.installmentId ?? 0,
        phone: item.phone,
        customerId: item.customerId ?? undefined,
        customerName: item.customerName,
        kind: item.kind === 'overdue' ? 'overdue' : 'due',
        vars: { name: item.customerName, amount: '', unit, due: '', idx: 1, count: 1, debt: '', late: 0, shop: cfg.shop.name, phone: cfg.shop.phone, date: formatDate(today) },
      });
      // در حالت پنلی، متن اصلی صف بازنویسی می‌شود؛ رکورد قبلی حذف و لاگ جدید ثبت شده است
      await db.smsLogs.delete(item.id!);
      if (out.status === 'sent') ok++; else fail++;
    }
    setBusy(false);
    toast.push(`${toFa(ok)} ارسال شد${fail ? ` • ${toFa(fail)} ناموفق` : ''}`, fail ? 'warn' : 'ok');
  }

  /** یادآوری فوری برای همه اقساط سررسیدشده */
  async function runNow() {
    setBusy(true);
    const r = await scheduler.runNow('manual');
    setBusy(false);
    refresh();
    if (!r) return;
    toast.push(`بررسی انجام شد: ${toFa(r.sent)} ارسال، ${toFa(r.queued)} در صف، ${toFa(r.failed)} ناموفق`, r.failed ? 'warn' : 'ok');
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Card>
        <SectionTitle icon="message" title="مرکز پیامک" subtitle="یادآوری سررسید، رسید واریزی و ارسال انبوه"
          action={<Button size="sm" icon="refresh" loading={busy} onClick={runNow}>بررسی فوری</Button>} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <StatCard label="در صف ارسال" value={toFa(counts.queue)} sub="منتظر اقدام" icon="clock" tone="warn" onClick={() => setTab('queue')} />
          <StatCard label="ارسال‌شده" value={toFa(counts.sent)} sub="کل" icon="check" tone="ok" onClick={() => setTab('sent')} />
          <StatCard label="ناموفق" value={toFa(counts.failed)} sub="نیازمند بررسی" icon="alert" tone="danger" onClick={() => setTab('failed')} />
          <StatCard label="امروز" value={toFa(counts.today)} sub={`سقف ${toFa(cfg.sms.dailyCap)}`} icon="send" tone="info" onClick={() => setTab('all')} />
        </div>

        <EngineStatusCard status={status} />

        <div className="flex flex-wrap gap-2 items-center mt-3">
          <Button size="sm" variant="soft" icon="send" loading={busy} onClick={sendQueue} disabled={!counts.queue}>
            ارسال کل صف ({toFa(counts.queue)})
          </Button>
          <span className="text-[11px] text-muted">
            {cfg.sms.mode === 'panel'
              ? 'ارسال مستقیم از پنل پیامکی انجام می‌شود.'
              : 'حالت دستی: اپ پیامک گوشی با متن آماده باز می‌شود.'}
          </span>
        </div>
      </Card>

      <Card pad={false}>
        <div className="p-3 border-b border-line">
          <Segmented value={tab} onChange={setTab} options={[
            { value: 'queue', label: 'صف' }, { value: 'sent', label: 'ارسال‌شده' },
            { value: 'failed', label: 'ناموفق' }, { value: 'all', label: 'همه' },
          ]} />
        </div>
        {!filtered.length ? <EmptyState icon="message" title="رکوردی وجود ندارد" hint="با نزدیک شدن سررسید اقساط، پیامک‌ها اینجا ظاهر می‌شوند." /> : (
          <div className="divide-y divide-line">
            {filtered.slice(0, 100).map((l) => <SmsRow key={l.id} log={l} />)}
          </div>
        )}
      </Card>
    </div>
  );

  function SmsRow({ log }: { log: SmsLog }) {
    const [open, setOpen] = useState(false);
    const tone = log.status === 'sent' ? 'ok' : log.status === 'failed' ? 'danger' : log.status === 'queued' ? 'warn' : 'neutral';
    const label = { sent: 'ارسال شد', failed: 'ناموفق', queued: 'در صف', draft: 'پیش‌نویس', manual: 'دستی' }[log.status];
    return (
      <div className="p-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Badge tone={tone}>{label}</Badge>
          <span className="text-[12px] font-medium truncate">{log.customerName}</span>
          <span className="text-[11px] text-muted nums truncate" dir="ltr">{log.phone}</span>
          <span className="text-[10px] text-muted mr-auto shrink-0">{formatDate(log.date)}</span>
          <IconButton name={open ? 'chevDown' : 'chevLeft'} label="جزئیات" onClick={() => setOpen((o) => !o)} />
        </div>
        {!open ? <p className="text-[11px] text-muted truncate mt-1">{log.message.split('\n')[0]}</p> : (
          <div className="mt-2">
            <p className="text-[12px] leading-6 whitespace-pre-wrap bg-surface2 rounded-xl p-2.5 border border-line">{log.message}</p>
            <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-muted">
              <span>{toFa(smsParts(log.message))} پیامک</span>
              <span>سرویس: {log.provider}</span>
              <span>نوع: {log.kind}</span>
              {log.error ? <span className="text-danger">{log.error}</span> : null}
            </div>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" icon="message" onClick={() => openNativeSms(log.phone, log.message)}>باز کردن در اپ پیامک</Button>
              <Button size="sm" variant="ghost" icon="copy" onClick={async () => { await copyToClipboard(log.message); toast.push('کپی شد', 'ok'); }}>کپی</Button>
              {log.status === 'failed' && cfg.sms.mode === 'panel' ? (
                <Button size="sm" variant="soft" icon="refresh" onClick={async () => {
                  const out = await dispatch({ cfg, unit, shopName: cfg.shop.name }, {
                    installmentId: log.installmentId ?? 0, phone: log.phone, customerId: log.customerId ?? undefined,
                    customerName: log.customerName, kind: log.kind === 'overdue' ? 'overdue' : 'due',
                    vars: { name: log.customerName, amount: '', unit, due: '', idx: 1, count: 1, debt: '', late: 0, shop: cfg.shop.name, phone: cfg.shop.phone, date: formatDate(today) },
                  });
                  await db.smsLogs.delete(log.id!);
                  toast.push(out.status === 'sent' ? 'ارسال شد' : 'ناموفق: ' + out.error, out.status === 'sent' ? 'ok' : 'danger');
                }}>تلاش مجدد</Button>
              ) : null}
              <Button size="sm" variant="ghost" icon="trash" onClick={async () => { await db.smsLogs.delete(log.id!); toast.push('حذف شد', 'ok'); }}>حذف</Button>
            </div>
          </div>
        )}
      </div>
    );
  }
}

function EngineStatusCard({ status }: { status: Status | null }) {
  if (!status) return null;
  const items = [
    { label: 'موتور پس‌زمینه', ok: status.enabled, text: status.enabled ? 'فعال' : 'غیرفعال' },
    { label: 'حالت ارسال', ok: status.mode === 'panel' ? status.panelReady : true, text: status.mode === 'panel' ? (status.panelReady ? 'پنل آماده' : 'پنل ناقص') : 'دستی (اپ گوشی)' },
    { label: 'ارسال خودکار', ok: status.autoSend, text: status.autoSend ? 'روشن' : 'خاموش' },
    { label: 'ساعت مجاز ارسال', ok: status.inWindow, text: `${status.sendAt} به بعد` },
    { label: 'اجرای پس‌زمینه مرورگر', ok: status.periodic === 'active', text: status.periodic === 'active' ? 'ثبت‌شده' : status.periodic === 'unsupported' ? 'پشتیبانی نمی‌شود' : 'در انتظار نصب اپ' },
    { label: 'اعلان سیستمی', ok: status.notifyPermission === 'granted', text: status.notifyPermission === 'granted' ? 'مجاز' : status.notifyPermission === 'denied' ? 'رد شده' : 'درخواست نشده' },
    { label: 'صفحه همیشه‌روشن', ok: status.hasWakeLock, text: status.hasWakeLock ? 'فعال' : 'غیرفعال' },
    { label: 'آخرین بررسی', ok: !!status.lastRun, text: status.lastRun ? new Date(status.lastRun).toLocaleTimeString('fa-IR') : 'هنوز اجرا نشده' },
  ];
  return (
    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map((i) => (
        <div key={i.label} className={cx('rounded-xl border p-2.5 min-w-0', i.ok ? 'border-ok/30 bg-ok-soft/40' : 'border-line bg-surface2/50')}>
          <p className="text-[10px] text-muted truncate">{i.label}</p>
          <p className={cx('text-[12px] font-semibold truncate flex items-center gap-1', i.ok ? 'text-ok' : '')}>
            <span className={cx('w-1.5 h-1.5 rounded-full shrink-0', i.ok ? 'bg-ok' : 'bg-muted')} />
            {i.text}
          </p>
        </div>
      ))}
    </div>
  );
}
