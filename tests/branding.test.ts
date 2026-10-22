import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { Data } from 'resedit';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url));

describe('Identité officielle GarageFlows', () => {
  it('conserve exactement le fichier fourni, sans redessin ni changement de couleurs', () => {
    const original = read('resources/branding/logo-official.png');
    expect(createHash('sha256').update(original).digest('hex')).toBe('8ec4b44173f32407a4adb7a6de2df1b4e99699a68f0c93fbb35307b8b920cd21');
    expect(read('public/branding/logo-full.png').equals(original)).toBe(true);
  });

  it('fournit chaque résolution PNG et chaque entrée ICO correspondante', async () => {
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const ico = Data.IconFile.from(read('public/branding/icon.ico'));
    expect(ico.icons).toHaveLength(sizes.length);
    for (const [index, size] of sizes.entries()) {
      const png = read(`public/branding/icon-${size}.png`);
      const metadata = await sharp(png).metadata();
      expect([metadata.width, metadata.height]).toEqual([size, size]);
      expect(ico.icons[index].width || 256).toBe(size);
      expect(ico.icons[index].data.isRaw()).toBe(true);
      const raw = ico.icons[index].data;
      if (raw.isRaw()) expect(Buffer.from(raw.bin).equals(png)).toBe(true);
    }
    const large = await sharp(read('public/branding/icon.png')).metadata();
    expect([large.width, large.height]).toEqual([512, 512]);
  });

  it('dérive l’emblème par recadrage carré, sans déformation ni suppression du halo', async () => {
    const expected = await sharp(read('resources/branding/logo-official.png'))
      .extract({ left: 270, top: 150, width: 670, height: 670 })
      .resize(512, 512, { kernel: 'lanczos3' }).raw().toBuffer();
    const actual = await sharp(read('public/branding/icon.png')).raw().toBuffer();
    expect(actual.equals(expected)).toBe(true);
  });

  it('remplace le monogramme de marque sans remplacer les pictogrammes métier', () => {
    const app = read('src/App.tsx').toString();
    expect(app).toContain('<Brand />');
    expect(app).not.toContain('gf-logo');
    expect(app).toContain('<Icon size={19} />');
    expect(fs.existsSync(new URL('../build/icon.ico', import.meta.url))).toBe(false);
    expect(fs.existsSync(new URL('../build/icon.png', import.meta.url))).toBe(false);
  });

  it('partage la même identité entre Electron, Windows, NSIS et les ressources installées', () => {
    const config = read('electron-builder.yml').toString().replace(/\r\n/g, '\n');
    for (const key of ['icon', 'installerIcon', 'uninstallerIcon', 'installerHeaderIcon']) {
      expect(config).toContain(`${key}: public/branding/icon.ico`);
    }
    expect(config).toContain('afterPack: scripts/after-pack.cjs');
    expect(config).toContain('from: public/branding\n    to: branding');
    const main = read('electron/main.ts').toString();
    expect(main).toContain("app.setAppUserModelId('com.garageflows.contractgenerator')");
    expect(main).toContain('app.isPackaged');
    expect(main).toContain('process.resourcesPath!');
    expect(main).toContain('icon: windowIcon');
  });
});
