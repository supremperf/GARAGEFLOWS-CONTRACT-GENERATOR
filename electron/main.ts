import path from 'path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { startServer } from './server';
import { isTrustedWindowUrl, isSafeExternalUrl, assertTrustedIpcSender } from './security/window-policy';
import { validateSafeFilePath } from './security/path-validator';
import { writeAppLog } from './security/logger';

const isDev = process.env.GARAGEFLOWS_DEV === '1';
// Packaged assets are outside ASAR; development resolves relative to compiled main.
const brandingDir = app.isPackaged
  ? path.join(process.resourcesPath!, 'branding')
  : path.join(__dirname, '../../public/branding');
const windowIcon = path.join(brandingDir, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
let splash: BrowserWindow | null = null;
let trustedOrigin: string | null = null;
if (process.platform === 'win32') app.setAppUserModelId('com.garageflows.contractgenerator');

function createWindow(port: number) {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: 'GarageFlows Contract Generator',
    icon: windowIcon,
    show: false,
    backgroundColor: '#070b14',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const url = isDev ? 'http://127.0.0.1:5173' : `http://127.0.0.1:${port}`;
  win.once('ready-to-show', () => {
    win.show();
    splash?.close();
    splash = null;
  });
  void win.loadURL(url).catch((error: Error) => {
    writeAppLog('ERROR', error.message);
    dialog.showErrorBox('GarageFlows Contract Generator', 'Impossible de charger l’interface. Veuillez redémarrer l’application.');
    app.quit();
  });
  win.webContents.setWindowOpenHandler(({ url: target }: { url: string }) => {
    if (isTrustedWindowUrl(target, trustedOrigin)) {
      return { action: 'allow', overrideBrowserWindowOptions: { icon: windowIcon, autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } } };
    }
    if (isSafeExternalUrl(target)) void shell.openExternal(target).catch((error: Error) => writeAppLog('WARN', error.message));
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event: { preventDefault(): void }, target: string) => {
    if (!isTrustedWindowUrl(target, trustedOrigin)) event.preventDefault();
  });
  return win;
}

app.whenReady().then(async () => {
  splash = new BrowserWindow({
    width: 520, height: 430, frame: false, resizable: false,
    title: 'GarageFlows Contract Generator', icon: windowIcon,
    backgroundColor: '#020b19', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await splash.loadFile(path.join(brandingDir, 'splash.html'));

  ipcMain.handle('dialog:open-file', async (_event: unknown, filters?: { name: string; extensions: string[] }[]) => {
    assertTrustedIpcSender(_event, trustedOrigin);
    if (filters && (!Array.isArray(filters) || filters.length > 20 || filters.some(f => !f || typeof f.name !== 'string' || !Array.isArray(f.extensions) || f.extensions.length > 100 || f.extensions.some(ext => typeof ext !== 'string' || !/^(?:[a-z0-9]{1,12}|\*)$/i.test(ext))))) throw new Error('Filtres de fichiers invalides.');
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters && filters.length > 0 ? filters : [{ name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'odt', 'rtf', 'txt', 'html', 'xlsx', 'xls', 'ods', 'csv', 'pptx', 'png', 'jpg', 'jpeg', 'tiff'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:open-directory', async (_event: unknown) => {
    assertTrustedIpcSender(_event, trustedOrigin);
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('shell:show-item', async (_event: unknown, filePath: string) => {
    assertTrustedIpcSender(_event, trustedOrigin);
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Chemin absolu requis.');
    shell.showItemInFolder(validateSafeFilePath(filePath));
  });

  const staticDir = path.join(__dirname, '../../dist-renderer');
  const port = await startServer({
    port: 0,
    staticDir: isDev ? undefined : staticDir,
    electronDialogs: {
      openFile: (filters) =>
        dialog
          .showOpenDialog({
            properties: ['openFile'],
            filters:
              filters && filters.length > 0
                ? filters
                : [
                    {
                      name: 'Documents',
                      extensions: ['pdf', 'docx', 'doc', 'odt', 'rtf', 'txt', 'html', 'xlsx', 'xls', 'ods', 'csv', 'pptx', 'png', 'jpg', 'jpeg', 'tiff'],
                    },
                  ],
          })
          .then((result: { canceled: boolean; filePaths: string[] }) => (result.canceled ? null : result.filePaths[0])),
      openDirectory: () =>
        dialog
          .showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
          .then((result: { canceled: boolean; filePaths: string[] }) => (result.canceled ? null : result.filePaths[0])),
      saveFile: async (defaultPath: string) => {
        const result = await dialog.showSaveDialog({ defaultPath });
        return result.canceled ? null : result.filePath || null;
      },
    },
  });

  trustedOrigin = isDev ? 'http://127.0.0.1:5173' : `http://127.0.0.1:${port}`;
  createWindow(typeof port === 'number' ? port : 3001);
  writeAppLog('INFO', 'Application démarrée');
}).catch((error: Error) => {
  writeAppLog('ERROR', error.message || 'Échec de démarrage');
  dialog.showErrorBox('GarageFlows Contract Generator', 'Le démarrage a échoué. Consultez le journal technique.');
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
