import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const tools = path.join(root, 'tools');
const bundle = path.join(tools, 'nsis-bundle');
const archive = path.join(tools, 'nsis-bundle-3.12.tar.gz');

execSync('node scripts/patch-builder.cjs', { stdio: 'inherit' });

if (!fs.existsSync(path.join(bundle, 'makensis'))) {
  fs.mkdirSync(tools, { recursive: true });
  if (!fs.existsSync(archive) || fs.statSync(archive).size < 1000000) {
    console.log('Téléchargement du compilateur NSIS…');
    execSync(
      `gh api repos/electron-userland/electron-builder-binaries/contents/artifacts/nsis/nsis-bundle-3.12.tar.gz -H "Accept: application/vnd.github.raw" > "${archive}"`,
      { stdio: 'inherit' }
    );
  }
  execSync(`tar -xzf "${archive}" -C "${tools}"`, { stdio: 'inherit' });
}

for (const file of [
  path.join(bundle, 'makensis'),
  path.join(bundle, 'linux', 'makensis'),
  path.join(root, 'node_modules/7zip-bin/linux/x64/7za'),
]) {
  if (fs.existsSync(file)) fs.chmodSync(file, 0o755);
}

const env = {
  ...process.env,
  ELECTRON_BUILDER_NSIS_DIR: bundle,
  ELECTRON_BUILDER_NSIS_RESOURCES_DIR: bundle,
  ELECTRON_BUILDER_7ZIP_PATH: path.join(root, 'node_modules/7zip-bin/linux/x64/7za'),
};

execSync('npx electron-builder --win --x64 --publish never', { stdio: 'inherit', env });

const installer = path.join(root, 'dist', 'GarageFlows-Contract-Generator-Setup.exe');
if (!fs.existsSync(installer)) {
  console.error('Installateur introuvable :', installer);
  process.exit(1);
}
const size = fs.statSync(installer).size;
if (size < 20 * 1024 * 1024) {
  console.error('Installateur trop petit pour être un exécutable Electron :', size);
  process.exit(1);
}
console.log(`Installateur créé : ${installer} (${(size / (1024 * 1024)).toFixed(1)} Mo)`);
