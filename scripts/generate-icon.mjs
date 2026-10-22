/** Derivatives of the supplied official image only; no drawing or background removal.
 * Keep the dark background: removing it would damage the cyan glow.
 * All crops are in original 1254 × 1254 pixel coordinates, never stretched.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'resources/branding/logo-official.png');
const out = path.join(root, 'public/branding');
await fs.mkdir(out, { recursive: true });
const metadata = await sharp(source).metadata();
if (metadata.width !== 1254 || metadata.height !== 1254) throw new Error('Unexpected official source dimensions');
await fs.copyFile(source, path.join(out, 'logo-full.png'));
await sharp(source).extract({ left: 65, top: 215, width: 1130, height: 775 }).png().toFile(path.join(out, 'logo-lockup.png'));
await sharp(source).extract({ left: 65, top: 815, width: 1130, height: 175 }).png().toFile(path.join(out, 'wordmark.png'));
const emblem = await sharp(source)
  .extract({ left: 270, top: 150, width: 670, height: 670 })
  .png().toBuffer();
await sharp(emblem).resize(512, 512, { kernel: 'lanczos3' }).png().toFile(path.join(out, 'icon.png'));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map(async (size) => {
  const png = await sharp(emblem).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
  await fs.writeFile(path.join(out, `icon-${size}.png`), png);
  return png;
}));
// ICO directory followed by losslessly encoded PNG images (Windows Vista+).
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, index) => {
  const entry = 6 + index * 16;
  header[entry] = header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(pngs[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += pngs[index].length;
});
await fs.writeFile(path.join(out, 'icon.ico'), Buffer.concat([header, ...pngs]));
console.log(`Official branding generated: full/lockup/wordmark, 512 px PNG, ICO ${sizes.join('/')} px.`);
