// Embed the real PE icon even on Linux: no Wine, certificate, or generic fallback.
// Runs before NSIS compression; Windows keeps native electron-builder editing too.
const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const path = require('node:path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  // Electron's demo app is unused (our app.asar is the entry point).
  fs.rmSync(path.join(context.appOutDir, 'resources/default_app.asar'), { force: true });
  const { NtExecutable, NtExecutableResource, Data, Resource } = await import('resedit');
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const ico = Data.IconFile.from(fs.readFileSync(path.join(context.packager.projectDir, 'public/branding/icon.ico')));
  const exe = NtExecutable.from(fs.readFileSync(exePath));
  const resources = NtExecutableResource.from(exe);
  // Drop ALL generic Electron icon groups and their images, not only the first group.
  resources.entries = resources.entries.filter((entry) => entry.type !== 3 && entry.type !== 14);
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries, 1, 1033, ico.icons.map((item) => item.data));
  for (const vi of Resource.VersionInfo.fromEntries(resources.entries)) {
    vi.setStringValues({ lang: 1033, codepage: 1200 }, {
      ProductName: context.packager.appInfo.productName,
      FileDescription: context.packager.appInfo.productName,
      CompanyName: 'GarageFlows',
      OriginalFilename: `${context.packager.appInfo.productFilename}.exe`,
      InternalName: context.packager.appInfo.productFilename,
      LegalCopyright: 'Copyright © 2026 GarageFlows',
    });
    vi.setFileVersion(context.packager.appInfo.version);
    vi.setProductVersion(context.packager.appInfo.version);
    vi.outputToResourceEntries(resources.entries);
  }
  resources.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  // Read back the executable, not just the configuration.
  const actual = NtExecutableResource.from(NtExecutable.from(fs.readFileSync(exePath)));
  const images = actual.entries.filter((entry) => entry.type === 3);
  if (images.length !== ico.icons.length || !images.every((entry) => ico.icons.some((item) => Buffer.from(item.data.bin).equals(Buffer.from(entry.bin))))) {
    throw new Error('PE icon verification failed');
  }
  console.log('[branding] Official multi-resolution icon embedded and read back from Windows executable.');
};
