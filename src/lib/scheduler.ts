/**
 * زمان‌بند اجرای اپ — سه لایه برای «همیشه در جریان بودن»:
 *  ۱) تایمر foreground: هر ۶۰ ثانیه یک‌بار بررسی می‌کند (حتی وقتی تب پشت است).
 *  ۲) Periodic Background Sync: اجرای پس‌زمینه توسط کروم اندروید وقتی اپ نصب شده باشد.
 *  ۳) Wake Lock: جلوگیری از خاموش شدن صفحه در «حالت همیشه‌روشن».
 */
import { loadConfig } from './settings';
import { isNativeApp, syncNativeReminders } from './native';
import { bindWakeLockReacquire, engineStatus, releaseWakeLock, requestWakeLock, runAutoSend, type EngineResult } from './engine';

export const TICK_MS = 60_000;
export const SYNC_TAG = 'salariapp-engine';

type Listener = (r: EngineResult) => void;

class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<Listener>();
  private running = false;
  lastResult: EngineResult | null = null;
  startedAt: number | null = null;
  ticks = 0;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(r: EngineResult) {
    this.lastResult = r;
    this.listeners.forEach((fn) => {
      try { fn(r); } catch { /* شنونده خراب نباید موتور را متوقف کند */ }
    });
    window.dispatchEvent(new CustomEvent('engine-tick', { detail: r }));
  }

  /** اجرای یک چرخه (با قفل همزمانی تا دو اجرای موازی نشود) */
  async runNow(reason: string): Promise<EngineResult | null> {
    if (this.running) return null;
    this.running = true;
    try {
      const r = await runAutoSend(reason);
      this.ticks++;
      this.emit(r);
      await this.syncNative();
      return r;
    } catch (e) {
      const r = {
        at: new Date().toISOString(),
        reason,
        scanned: 0, sent: 0, queued: 0, failed: 0,
        skippedNoPhone: 0, skippedCap: 0, lowStock: 0,
        errors: [String((e as Error)?.message || e)],
      } as EngineResult;
      this.emit(r);
      return r;
    } finally {
      this.running = false;
    }
  }

  /** زمان‌بندی اعلان‌های بومی اندروید (بی‌اثر در مرورگر) */
  async syncNative(): Promise<void> {
    if (!isNativeApp()) return;
    try {
      await syncNativeReminders(180);
    } catch { /* اعلان بومی اختیاری است */ }
  }

  async start(): Promise<void> {
    const cfg = await loadConfig();
    if (!cfg.background.enabled) return;
    if (this.timer) return;
    this.startedAt = Date.now();
    // اجرای فوری هنگام باز شدن اپ
    void this.runNow('startup');
    this.timer = setInterval(() => void this.runNow('interval'), TICK_MS);
    if (cfg.background.wakeLock) await requestWakeLock();
    if (cfg.background.periodicSync) await this.registerPeriodic();
    void this.syncNative();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.startedAt = null;
    await releaseWakeLock();
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /** ثبت همگام‌سازی دوره‌ای پس‌زمینه (اندروید/کروم، فقط وقتی PWA نصب شده باشد) */
  async registerPeriodic(): Promise<'registered' | 'unsupported' | 'denied'> {
    try {
      if (!('serviceWorker' in navigator)) return 'unsupported';
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg || !('periodicSync' in reg)) return 'unsupported';
      const tags = await (reg as any).periodicSync.getTags();
      if (!tags.includes(SYNC_TAG)) {
        await (reg as any).periodicSync.register(SYNC_TAG, { minInterval: 15 * 60 * 1000 });
      }
      return 'registered';
    } catch {
      return 'denied';
    }
  }

  get active() {
    return this.timer !== null;
  }

  /** نتیجه‌ی اجرای موتور داخل Service Worker را به رابط کاربری می‌رساند */
  emitFromWorker(r: EngineResult): void {
    this.ticks++;
    this.lastResult = r;
    this.listeners.forEach((fn) => {
      try { fn(r); } catch { /* نادیده */ }
    });
    window.dispatchEvent(new CustomEvent('engine-tick', { detail: r }));
  }
}

export const scheduler = new Scheduler();

/** اتصال رویدادهای سیستمی: بازگشت به برنامه، آنلاین شدن، تغییر پیکربندی */
export function bindSystemEvents(): () => void {
  const onVis = () => {
    if (document.visibilityState === 'visible') void scheduler.runNow('visibility');
  };
  const onOnline = () => void scheduler.runNow('online');
  const onCfg = () => void scheduler.restart();
  const onMsg = (e: MessageEvent) => {
    if (e.data?.type === 'engine-result') {
      scheduler.emitFromWorker(e.data.result as EngineResult);
    }
  };
  const unbindWake = bindWakeLockReacquire();
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('online', onOnline);
  window.addEventListener('config-changed', onCfg);
  navigator.serviceWorker?.addEventListener('message', onMsg);
  return () => {
    unbindWake();
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('config-changed', onCfg);
    navigator.serviceWorker?.removeEventListener('message', onMsg);
  };
}

export { engineStatus, runAutoSend, requestWakeLock, releaseWakeLock };
