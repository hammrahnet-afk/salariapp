/**
 * تولید آیکون‌های PWA بدون وابستگی خارجی (رمزگذار PNG دستی با zlib نود)
 * اجرا: node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/icons');
mkdirSync(outDir, { recursive: true });

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

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

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
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------- نقاشی --------------------------------- */

const TEAL = [13, 148, 136];
const TEAL_DARK = [15, 118, 110];
const TEAL_LIGHT = [45, 212, 191];

function lerp(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }

function roundedRectCoverage(size, radius, pad, x, y) {
  // فاصله از مرکز گوشه‌ها برای آنتی‌الیاس
  const left = pad, right = size - pad, top = pad, bottom = size - pad;
  const r = Math.min(radius, (right - left) / 2, (bottom - top) / 2);
  const cx = x < left + r ? left + r : x > right - r ? right - r : x;
  const cy = y < top + r ? top + r : y > bottom - r ? bottom - r : y;
  const d = Math.hypot(x - cx, y - cy);
  if (x < left || x > right || y < top || y > bottom) {
    return Math.max(0, Math.min(1, r - d + 0.5));
  }
  return Math.max(0, Math.min(1, r - d + 0.5));
}

function barCoverage(x, y, bx, by, bw, bh, radius) {
  if (x < bx || x > bx + bw || y < by || y > by + bh) return 0;
  const cx = Math.max(bx + radius, Math.min(x, bx + bw - radius));
  const cy = Math.max(by + radius, Math.min(y, by + bh - radius));
  const d = Math.hypot(x - cx, y - cy);
  return Math.max(0, Math.min(1, radius - d + 0.5));
}

function circleCoverage(x, y, cx, cy, r) {
  return Math.max(0, Math.min(1, r - Math.hypot(x - cx, y - cy) + 0.5));
}

/** آیکون: کاشی گرد + سه میله نمودار + سکه */
function drawIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const pad = maskable ? size * 0.14 : size * 0.04;
  const radius = maskable ? size * 0.5 : size * 0.24;
  const unit = size / 100;

  // میله‌های نمودار (در مختصات ۱۰۰×۱۰۰)
  const bars = [
    { x: 22, w: 12, h: 30 },
    { x: 44, w: 12, h: 46 },
    { x: 66, w: 12, h: 62 },
  ].map((b) => ({ ...b, y: 76 - b.h }));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cov = roundedRectCoverage(size, radius, pad, x + 0.5, y + 0.5);
      if (cov <= 0) continue;
      const t = (x + y) / (size * 2);
      const bg = lerp(TEAL_DARK, TEAL, Math.min(1, t * 1.4));
      let [r, g, b] = bg;
      let a = cov;

      // میله‌ها
      for (const bar of bars) {
        const c = barCoverage(x + 0.5, y + 0.5, bar.x * unit, bar.y * unit, bar.w * unit, bar.h * unit, unit * 3);
        if (c > 0) {
          const w = lerp([r, g, b], [255, 255, 255], c * 0.96);
          [r, g, b] = w;
        }
      }

      // سکه بالای میله وسط
      const coinR = unit * 8;
      const c = circleCoverage(x + 0.5, y + 0.5, 50 * unit, 22 * unit, coinR);
      if (c > 0) {
        const w = lerp([r, g, b], TEAL_LIGHT, c * 0.9);
        [r, g, b] = w;
      }

      // خط پایه
      const baseC = barCoverage(x + 0.5, y + 0.5, 18 * unit, 79 * unit, 64 * unit, unit * 4, unit * 2);
      if (baseC > 0) {
        const w = lerp([r, g, b], [255, 255, 255], baseC * 0.85);
        [r, g, b] = w;
      }

      const o = (y * size + x) * 4;
      rgba[o] = Math.round(r);
      rgba[o + 1] = Math.round(g);
      rgba[o + 2] = Math.round(b);
      rgba[o + 3] = Math.round(a * 255);
    }
  }
  return encodePng(size, size, rgba);
}

/* ------------------------------- favicon -------------------------------- */

function drawFavicon(size = 64) {
  return drawIcon(size);
}

/* -------------------------------- اجرا ---------------------------------- */

const outputs = [
  ['icons/icon-192.png', drawIcon(192)],
  ['icons/icon-512.png', drawIcon(512)],
  ['icons/icon-maskable-512.png', drawIcon(512, { maskable: true })],
  ['favicon.png', drawFavicon(64)],
];

for (const [name, buf] of outputs) {
  const target = resolve(root, 'public', name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buf);
  console.log(`✓ ${name} (${buf.length} bytes)`);
}

/* favicon.svg سبک برای تب مرورگر */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#0d9488"/>
  </linearGradient></defs>
  <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#g)"/>
  <g fill="#fff">
    <rect x="14" y="34" width="8" height="18" rx="3"/>
    <rect x="28" y="24" width="8" height="28" rx="3"/>
    <rect x="42" y="14" width="8" height="38" rx="3"/>
    <rect x="12" y="55" width="40" height="3" rx="1.5" opacity=".85"/>
  </g>
  <circle cx="32" cy="10" r="4.5" fill="#2dd4bf"/>
</svg>`;
writeFileSync(resolve(root, 'public/favicon.svg'), svg);
console.log('✓ favicon.svg');
