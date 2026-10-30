import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.svg'],
      manifest: {
        id: 'salariapp',
        name: 'سالاری‌اپ | حسابداری لوازم خانگی',
        short_name: 'سالاری‌اپ',
        description: 'حسابداری، انبار، قسط‌بندی و پیامک یادآوری برای فروشگاه لوازم خانگی و آشپزخانه',
        lang: 'fa',
        dir: 'rtl',
        scope: './',
        start_url: './',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#0b1220',
        theme_color: '#0d9488',
        categories: ['business', 'finance', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'ثبت فروش روزانه', short_name: 'فروش', url: './#/sales/new', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'اقساط امروز', short_name: 'اقساط', url: './#/installments', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'گزارش‌ها', short_name: 'گزارش', url: './#/reports', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      injectManifest: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
