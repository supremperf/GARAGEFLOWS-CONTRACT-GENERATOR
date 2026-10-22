/**
 * Génère build/icon.ico (+ build/icon.png) : monogramme « GF » blanc sur
 * fond bleu GarageFlows, dessiné de façon déterministe (aucune ressource externe).
 * ICO multi-résolutions PNG : 16, 24, 32, 48, 64, 128, 256 px.
 * Régénérer avec : node scripts/generate-icon.mjs
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const FONT = {
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
};
const TEXT = 'GF';

function render(size) {
  // Rendu en haute résolution puis réduction par moyenne de blocs (anticrénelage).
  const SS = 4;
  const W = size * SS;
  const px = new Uint8Array(W * W * 4);
  const radius = W * 0.22;
  // Fond : dégradé vertical bleu (identité GarageFlows) + coin arrondis, extérieur transparent.
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const cx = Math.max(radius - x, 0, x - (W - 1 - radius));
      const cy = Math.max(radius - y, 0, y - (W - 1 - radius));
      const outside = cx * cx + cy * cy > radius * radius && ((x < radius && y < radius) || (x > W - 1 - radius && y < radius) || (x < radius && y > W - 1 - radius) || (x > W - 1 - radius && y > W - 1 - radius));
      const i = (y * W + x) * 4;
      if (outside) { px[i + 3] = 0; continue; }
      const t = y / W;
      px[i] = Math.round(29 + (14 - 29) * t);      // R : #1d4ed8 -> #0e4a8a environ
      px[i + 1] = Math.round(78 + (105 - 78) * t); // G
      px[i + 2] = Math.round(216 + (233 - 216) * t); // B
      px[i + 3] = 255;
    }
  }
  // Lettres : grille 5x7 par caractère, 1 colonne d'espace.
  const cols = TEXT.length * 6 - 1;
  const cell = Math.floor((W * 0.62) / cols);
  const textW = cols * cell;
  const textH = 7 * cell;
  const ox = Math.floor((W - textW) / 2);
  const oy = Math.floor((W - textH) / 2);
  [...TEXT].forEach((ch, ci) => {
    const glyph = FONT[ch];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        for (let dy = 0; dy < cell; dy++) {
          for (let dx = 0; dx < cell; dx++) {
            const x = ox + (ci * 6 + gx) * cell + dx;
            const y = oy + gy * cell + dy;
            const i = (y * W + x) * 4;
            px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255;
          }
        }
      }
    }
  });
  // Réduction SSxSS -> size
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
        const i = ((y * SS + dy) * W + (x * SS + dx)) * 4;
        r += px[i]; g += px[i + 1]; b += px[i + 2]; a += px[i + 3];
      }
      const n = SS * SS, o = (y * size + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return out;
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; }
    crc32.table = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function toPng(rgba, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((s) => toPng(render(s), s));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + sizes.length * 16;
const entries = [];
sizes.forEach((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s >= 256 ? 0 : s; e[1] = s >= 256 ? 0 : s; e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  entries.push(e);
});
const ico = Buffer.concat([header, ...entries, ...pngs]);

const outDir = path.join(process.cwd(), 'build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
fs.writeFileSync(path.join(outDir, 'icon.png'), pngs[pngs.length - 1]);
console.log(`Icône générée : build/icon.ico (${ico.length} octets, ${sizes.join('/')} px) et build/icon.png (256 px)`);
