/// <reference lib="webworker" />
/**
 * Service Worker سالاری‌اپ
 * - کش کردن پوسته‌ی اپ برای کارکرد کاملاً آفلاین
 * - اجرای موتور اقساط در پس‌زمینه (periodicsync / message)
 */
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { runAutoSend } from './lib/engine';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();

self.addEventListener('install', (e) => {
  (e as ExtendableEvent).waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  (e as ExtendableEvent).waitUntil(self.clients.claim());
});

/** درخواست‌های ناوبری همیشه از شبکه با بازگشت به کش */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then((r) => r || Response.error())),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open('salariapp-runtime').then((c) => c.put(req, copy)).catch(() => undefined);
            return res;
          })
          .catch(() => Response.error()),
    ),
  );
});

/** اجرای پس‌زمینه‌ی زمان‌بندی‌شده توسط کروم اندروید */
self.addEventListener('periodicsync', (event: any) => {
  if (event.tag === 'salariapp-engine') {
    event.waitUntil(runAutoSend('periodic-sync').then(broadcast));
  }
});

/** اجرای دستی از سمت صفحه (تست فوری / همگام‌سازی) */
self.addEventListener('message', (event: any) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'run-engine') {
    event.waitUntil(runAutoSend(data.reason || 'manual-sw').then(broadcast));
  }
  if (data.type === 'skip-waiting') {
    event.waitUntil(self.skipWaiting());
  }
});

async function broadcast(result: unknown) {
  const list = await self.clients.matchAll({ type: 'window' });
  for (const c of list) c.postMessage({ type: 'engine-result', result });
}
