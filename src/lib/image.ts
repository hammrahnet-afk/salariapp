/** فشرده‌سازی تصویر محصول برای ذخیره در IndexedDB */

export interface CompressOptions {
  maxSize?: number;
  quality?: number;
  format?: 'image/jpeg' | 'image/webp' | 'image/png';
}

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<string> {
  const { maxSize = 760, quality = 0.72, format = 'image/jpeg' } = opts;
  const bitmap = await fileToBitmap(file);
  const { width, height } = scaleToFit(bitmap.width, bitmap.height, maxSize);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('امکان پردازش تصویر در این مرورگر نیست.');
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
  return canvas.toDataURL(format, quality);
}

function scaleToFit(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = Math.min(max / w, max / h);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

async function fileToBitmap(file: File): Promise<{ width: number; height: number } & CanvasImageSource> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await new Promise((res, rej) => {
      img.onload = () => res(null);
      img.onerror = () => rej(new Error('فایل تصویر خوانده نشد.'));
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

export function dataUrlSize(dataUrl?: string): number {
  if (!dataUrl) return 0;
  const base64 = dataUrl.split(',')[1] || '';
  return Math.round((base64.length * 3) / 4);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
