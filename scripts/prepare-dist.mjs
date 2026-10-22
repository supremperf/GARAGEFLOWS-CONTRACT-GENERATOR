/**
 * Préparation et lancement de la compilation Windows (electron-builder + NSIS).
 *
 * Multi-plateforme :
 *  - Sous Windows : utilise les binaires natifs du package 7zip-bin
 *    (win/x64/7za.exe) et laisse electron-builder gérer NSIS nativement.
 *    AUCUN chemin Linux n'est jamais injecté.
 *  - Sous Linux (compilation croisée de ce dépôt) : utilise le bundle NSIS
 *    téléchargé dans tools/ et le binaire 7za Linux, comme historiquement.
 *
 * Le script vérifie chaque prérequis et s'arrête immédiatement (code 1)
 * avec un message explicite en français si une condition obligatoire échoue.
 * Il neutralise aussi toute variable d'environnement héritée incompatible
 * (ex. ELECTRON_BUILDER_7ZIP_PATH pointant vers un binaire d'une autre plateforme).
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';
const arch = process.arch; // 'x64' attendu

function fail(message) {
  console.error(`\n[prepare-dist] ERREUR BLOQUANTE : ${message}`);
  console.error('[prepare-dist] Compilation interrompue. Corrigez le point ci-dessus puis relancez `npm run dist`.');
  process.exit(1);
}
function ok(message) {
  console.log(`[prepare-dist] ✔ ${message}`);
}
function info(message) {
  console.log(`[prepare-dist] ${message}`);
}

info(`Plateforme de compilation détectée : ${process.platform} / ${arch} (cible : Windows x64)`);

// ---------- Contrôles préalables (fail-fast) ----------
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 18) {
  fail(`Version de Node.js incompatible (${process.versions.node}). Node.js 18 ou plus récent est requis (22 recommandé).`);
}
ok(`Node.js ${process.versions.node}`);

if (arch !== 'x64' && isWindows) {
  fail(`Architecture ${arch} détectée : la compilation Windows cible x64 uniquement.`);
}

const builderBin = path.join(root, 'node_modules', 'electron-builder');
if (!fs.existsSync(builderBin)) {
  fail('electron-builder introuvable dans node_modules. Exécutez d’abord `npm install`.');
}
ok('electron-builder présent dans node_modules');

for (const required of ['dist-renderer/index.html', 'dist-electron/electron/main.js', 'dist-electron/electron/preload.js', 'examples']) {
  if (!fs.existsSync(path.join(root, required))) {
    fail(`Artefact de compilation manquant : ${required}. Exécutez d’abord \`npm run build\` (ou laissez \`npm run dist\` enchaîner les étapes).`);
  }
}
ok('Artefacts de compilation présents (renderer, main, preload, exemples)');

const iconPath = path.join(root, 'build', 'icon.ico');
if (fs.existsSync(iconPath)) {
  ok(`Icône Windows présente : build/icon.ico (${fs.statSync(iconPath).size} octets)`);
} else {
  info('Icône build/icon.ico absente : electron-builder utilisera son icône par défaut (avertissement non bloquant).');
}

// ---------- Sélection du binaire 7-Zip adapté à la plateforme ----------
function sevenZipForPlatform() {
  if (isWindows) return path.join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
  if (isLinux) return path.join(root, 'node_modules', '7zip-bin', 'linux', 'x64', '7za');
  if (process.platform === 'darwin') return path.join(root, 'node_modules', '7zip-bin', 'mac', arch === 'arm64' ? 'arm64' : 'x64', '7za');
  return null;
}

const sevenZip = sevenZipForPlatform();
if (isWindows) {
  if (!sevenZip || !fs.existsSync(sevenZip)) {
    fail(`Binaire 7-Zip Windows introuvable : ${sevenZip}. Réinstallez les dépendances avec \`npm install\` (le package 7zip-bin fournit win/x64/7za.exe).`);
  }
  ok(`Binaire 7-Zip Windows vérifié : node_modules/7zip-bin/win/x64/7za.exe`);
}

// ---------- Assainissement de l'environnement hérité ----------
// Une variable ELECTRON_BUILDER_7ZIP_PATH persistante pointant vers un binaire
// d'une autre plateforme (cause historique de l'erreur ENOENT sous Windows)
// est détectée et neutralisée au lieu de faire échouer electron-builder.
const env = { ...process.env };
function sanitizeSevenZipEnv() {
  const inherited = env.ELECTRON_BUILDER_7ZIP_PATH;
  if (inherited) {
    const looksLinux = /linux/i.test(inherited) || (!isWindows && inherited.endsWith('7za'));
    const looksWindows = /\\win\\|\.exe$/i.test(inherited);
    const platformMismatch = (isWindows && !looksWindows) || (!isWindows && looksWindows) || looksLinux === isWindows;
    if (platformMismatch || !fs.existsSync(inherited)) {
      info(`Variable ELECTRON_BUILDER_7ZIP_PATH héritée incompatible ou inexistante (« ${inherited} ») : elle est ignorée.`);
      delete env.ELECTRON_BUILDER_7ZIP_PATH;
    }
  }
  if (!isWindows) {
    // Compilation croisée Linux : electron-builder a besoin du chemin explicite.
    if (sevenZip && fs.existsSync(sevenZip)) env.ELECTRON_BUILDER_7ZIP_PATH = sevenZip;
  }
  // Sous Windows : ne jamais imposer de chemin ; electron-builder résout
  // lui-même 7zip-bin/win/x64/7za.exe (vérifié ci-dessus).
  if (isWindows) {
    delete env.ELECTRON_BUILDER_NSIS_DIR;
    delete env.ELECTRON_BUILDER_NSIS_RESOURCES_DIR;
  }
}
sanitizeSevenZipEnv();

// ---------- Patch electron-builder : uniquement hors Windows ----------
// scripts/patch-builder.cjs adapte app-builder-lib pour une compilation NSIS
// sans Wine (cas Linux/macOS). Sous Windows natif, il est inutile et ignoré.
if (!isWindows) {
  execSync('node scripts/patch-builder.cjs', { stdio: 'inherit' });
} else {
  info('Compilation Windows native : patch « sans Wine » non appliqué (inutile sous Windows).');
}

// ---------- Bundle NSIS : uniquement pour la compilation croisée Linux ----------
if (isLinux) {
  const tools = path.join(root, 'tools');
  const bundle = path.join(tools, 'nsis-bundle');
  const archive = path.join(tools, 'nsis-bundle-3.12.tar.gz');
  if (!fs.existsSync(path.join(bundle, 'makensis'))) {
    fs.mkdirSync(tools, { recursive: true });
    if (!fs.existsSync(archive) || fs.statSync(archive).size < 1000000) {
      info('Téléchargement du compilateur NSIS (compilation croisée Linux)…');
      execSync(
        `gh api repos/electron-userland/electron-builder-binaries/contents/artifacts/nsis/nsis-bundle-3.12.tar.gz -H "Accept: application/vnd.github.raw" > "${archive}"`,
        { stdio: 'inherit' }
      );
    }
    execSync(`tar -xzf "${archive}" -C "${tools}"`, { stdio: 'inherit' });
  }
  if (!fs.existsSync(path.join(bundle, 'makensis'))) {
    fail(`Bundle NSIS incomplet : makensis introuvable dans ${bundle}.`);
  }
  for (const file of [path.join(bundle, 'makensis'), path.join(bundle, 'linux', 'makensis'), sevenZip]) {
    if (file && fs.existsSync(file)) fs.chmodSync(file, 0o755);
  }
  env.ELECTRON_BUILDER_NSIS_DIR = bundle;
  env.ELECTRON_BUILDER_NSIS_RESOURCES_DIR = bundle;
  ok('Bundle NSIS de compilation croisée prêt (Linux uniquement).');
}

// ---------- Lancement electron-builder ----------
info('Lancement d’electron-builder (Windows x64, NSIS)…');
// Sous Windows natif, l'édition des ressources de l'exécutable (icône,
// métadonnées) est active et ne requiert aucun certificat (signExecutable:
// false dans electron-builder.yml). Hors Windows (compilation croisée),
// rcedit exigerait Wine : on la désactive uniquement pour cette plateforme.
const builderArgs = isWindows
  ? 'npx electron-builder --win --x64 --publish never'
  : 'npx electron-builder --win --x64 --publish never -c.win.signAndEditExecutable=false';
execSync(builderArgs, { stdio: 'inherit', env });

// ---------- Vérifications post-compilation ----------
const installer = path.join(root, 'dist', 'GarageFlows-Contract-Generator-Setup.exe');
if (!fs.existsSync(installer)) {
  fail(`Installateur introuvable après compilation : ${installer}`);
}
const size = fs.statSync(installer).size;
if (size < 20 * 1024 * 1024) {
  fail(`Installateur anormalement petit (${size} octets) pour une application Electron.`);
}
const unpackedExe = path.join(root, 'dist', 'win-unpacked', 'GarageFlows Contract Generator.exe');
if (!fs.existsSync(unpackedExe)) {
  fail(`Exécutable décompressé introuvable : ${unpackedExe}`);
}
ok(`Exécutable Windows présent : dist/win-unpacked/GarageFlows Contract Generator.exe`);
console.log(`\nInstallateur créé : ${installer} (${(size / (1024 * 1024)).toFixed(1)} Mo)`);
