'use strict';

/** Fallback PNG generator when ImageMagick is unavailable. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 256;
const H = 256;
const out = path.join(__dirname, '..', 'electron', 'icon.png');

function chunk(tag, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([tag, data])) >>> 0);
  return Buffer.concat([len, tag, data, crc]);
}

const raw = Buffer.alloc((W * H * 4) + H);
let o = 0;
for (let y = 0; y < H; y++) {
  raw[o++] = 0;
  for (let x = 0; x < W; x++) {
    const cx = x - 128;
    const cy = y - 128;
    const r2 = cx * cx + cy * cy;
    const rx = Math.min(x, W - 1 - x);
    const ry = Math.min(y, H - 1 - y);
    let r = 15;
    let g = 24;
    let b = 32;
    let a = 255;
    if (rx < 8 && ry < 8) {
      const dx = 8 - rx;
      const dy = 8 - ry;
      if (dx * dx + dy * dy > 64) a = 0;
    }
    if (a && r2 <= 12 * 12) {
      r = 246; g = 241; b = 228;
    } else if (a && r2 <= 42 * 42) {
      const t = 1 - Math.sqrt(r2) / 42;
      r = Math.round(226 * t + 20);
      g = Math.round(161 * t + 20);
      b = Math.round(22 * t + 20);
    } else if (a && ((r2 > 90 * 90 && r2 < 98 * 98) || (r2 > 64 * 64 && r2 < 70 * 70))) {
      r = 61; g = 83; b = 96;
    }
    raw[o++] = r;
    raw[o++] = g;
    raw[o++] = b;
    raw[o++] = a;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk(Buffer.from('IHDR'), ihdr),
  chunk(Buffer.from('IDAT'), zlib.deflateSync(raw, { level: 9 })),
  chunk(Buffer.from('IEND'), Buffer.alloc(0)),
]);
fs.writeFileSync(out, png);
console.log('wrote', out);
