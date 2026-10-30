import type { CapacitorConfig } from '@capacitor/cli';

/**
 * پیکربندی اپ اندروید سالاری‌اپ (Capacitor)
 * - webDir همان خروجی vite است
 * - از HashRouter استفاده می‌کنیم تا ناوبری داخل WebView بدون سرور هم کار کند
 */
const config: CapacitorConfig = {
  appId: 'ir.salari.app',
  appName: 'سالاری‌اپ',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#f4f6f9',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_salari',
      iconColor: '#0d9488',
    },
  },
};

export default config;
