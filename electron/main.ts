import path from 'path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { startServer } from './server';
import { writeAppLog } from './security/logger';

const isDev = process.env.GARAGEFLOWS_DEV === '1';

function createWindow(port: number) {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: 'GarageFlows Contract Generator',
    // Icône fenêtre/barre des tâches (le binaire conserve l'icône ressource
    // Electron car signAndEditExecutable est désactivé pour un build hors-ligne
    // sans certificat ; l'icône de l'installateur NSIS est build/icon.ico).
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
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
  win.loadURL(url);
  win.webContents.setWindowOpenHandler(({ url: target }: { url: string }) => {
    if (target.startsWith('http://127.0.0.1') || target.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(target);
    return { action: 'deny' };
  });
  return win;
}

app.whenReady().then(async () => {
  ipcMain.handle('dialog:open-file', async (_event: unknown, filters?: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters && filters.length > 0 ? filters : [{ name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'odt', 'rtf', 'txt', 'html', 'xlsx', 'xls', 'ods', 'csv', 'pptx', 'png', 'jpg', 'jpeg', 'tiff'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:open-directory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('shell:show-item', async (_event: unknown, filePath: string) => {
    if (typeof filePath === 'string' && filePath.length > 0) {
      shell.showItemInFolder(filePath);
    }
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

  createWindow(typeof port === 'number' ? port : 3001);
  writeAppLog('INFO', 'Application démarrée');
}).catch((error: any) => {
  writeAppLog('ERROR', error?.message || 'Échec de démarrage');
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
