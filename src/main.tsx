import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// ثبت Service Worker فقط در نسخه ساخت
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const { registerSW } = await import('virtual:pwa-register');
      registerSW({
        immediate: true,
        onOfflineReady() { /* اپ آماده کار آفلاین است */ },
      });
    } catch { /* در حالت توسعه یا بدون PWA بی‌خطر */ }
  });
}
