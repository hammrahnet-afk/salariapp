/**
 * تولید آیکون‌های بومی اندروید (لانچر، آیکون تطبیقی، آیکون اعلان)
 * اجرا: node scripts/make-android-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const res = resolve(root, 'android/app/src/main/res');

/* ------------------------------ رمزگذار PNG ------------------------------ */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------- ابزار نقاشی ----------------------------- */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const TEAL = [13, 148, 136];
const TEAL_DARK = [15, 118, 110];
const TEAL_LIGHT = [45, 212, 191];

function coverageRoundRect(x, y, l, t, r, b, radius) {
  if (x < l || x > r || y < t || y > b) return 0;
  const cx = Math.min(Math.max(x, l + radius), r - radius);
  const cy = Math.min(Math.max(y, t + radius), b - radius);
  return clamp01(radius - Math.hypot(x - cx, y - cy) + 0.5);
}

/** لوگو: سه میله + سکه + خط پایه؛ در مختصات 0..100 */
function drawLogo(size, { bg = 'none', radiusRatio = 0.24, padRatio = 0.04, scale = 1 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const pad = size * padRatio;
  const radius = size * radiusRatio;
  const u = (size / 100) * scale;
  const off = (size - 100 * u) / 2;

  const bars = [
    { x: 22, w: 12, h: 30 },
    { x: 44, w: 12, h: 46 },
    { x: 66, w: 12, h: 62 },
  ].map((b) => ({ ...b, y: 76 - b.h }));

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      if (bg === 'tile') {
        const cov = coverageRoundRect(px + 0.5, py + 0.5, pad, pad, size - pad, size - pad, radius);
        const t = (px + py) / (size * 2);
        [r, g, b] = lerp(TEAL_DARK, TEAL, Math.min(1, t * 1.4));
        a = cov;
      }

      // مختصات محلی ۱۰۰ واحدی
      const lx = (px + 0.5 - off) / u;
      const ly = (py + 0.5 - off) / u;
      const w = [255, 255, 255];

      let cov = 0;
      for (const bar of bars) cov = Math.max(cov, coverageRoundRect(lx, ly, bar.x, bar.y, bar.x + bar.w, bar.y + bar.h, 3));
      cov = Math.max(cov, clamp01(8 - Math.hypot(lx - 50, ly - 22) + 0.5));
      cov = Math.max(cov, coverageRoundRect(lx, ly, 18, 79, 82, 83, 2));

      if (cov > 0) {
        const base = bg === 'tile' ? [r, g, b] : [0, 0, 0];
        const mixed = lerp(base, w, cov * (bg === 'tile' ? 0.96 : 1));
        r = mixed[0]; g = mixed[1]; b = mixed[2];
        a = Math.max(a, bg === 'tile' ? a : cov);
      }

      // سکه با رنگ روشن‌تر (فقط روی کاشی)
      if (bg === 'tile') {
        const coin = clamp01(8 - Math.hypot(lx - 50, ly - 22) + 0.5);
        if (coin > 0) {
          const mixed = lerp([r, g, b], TEAL_LIGHT, coin * 0.9);
          r = mixed[0]; g = mixed[1]; b = mixed[2];
        }
      }

      const o = (py * size + px) * 4;
      rgba[o] = Math.round(r);
      rgba[o + 1] = Math.round(g);
      rgba[o + 2] = Math.round(b);
      rgba[o + 3] = Math.round(a * 255);
    }
  }
  return encodePng(size, size, rgba);
}

/** آیکون اعلان: سیلوئت سفید روی شفاف */
function drawNotificationIcon(size) {
  return drawLogo(size, { bg: 'none', padRatio: 0.02, scale: 0.92 });
}

/* -------------------------------- نوشتن --------------------------------- */
const densities = {
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
};

function write(rel, buf) {
  const target = resolve(res, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buf);
  console.log(`✓ ${rel} (${buf.length} بایت)`);
}

for (const [name, factor] of Object.entries(densities)) {
  const legacy = Math.round(48 * factor);
  const adaptive = Math.round(108 * factor);
  write(`mipmap-${name}/ic_launcher.png`, drawLogo(legacy, { bg: 'tile', radiusRatio: 0.22, padRatio: 0.02 }));
  write(`mipmap-${name}/ic_launcher_round.png`, drawLogo(legacy, { bg: 'tile', radiusRatio: 0.5, padRatio: 0.02 }));
  // پیش‌زمینه لایه تطبیقی: تمام‌کادر و با حاشیه امن
  write(`mipmap-${name}/ic_launcher_foreground.png`, drawLogo(adaptive, { bg: 'none', scale: 0.62 }));
  // آیکون اعلان (سفید، ۲۴dp)
  write(`drawable-${name}/ic_stat_salari.png`, drawNotificationIcon(Math.round(24 * factor)));
}

console.log('آیکون‌های اندروید ساخته شد.');
