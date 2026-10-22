/**
 * Déclarations TypeScript minimales pour le module 'electron'.
 * Le runtime Electron 28.3.3 est fourni par @assistant-ai/electron-win32-x64
 * (binaire sans définitions TS) : ces interfaces décrivent uniquement les API
 * réellement utilisées par main.ts et preload.ts, avec leurs vrais contrats.
 */
declare module 'electron' {
  export interface FileFilter {
    name: string;
    extensions: string[];
  }

  export interface OpenDialogOptions {
    properties?: string[];
    filters?: FileFilter[];
    defaultPath?: string;
  }

  export interface OpenDialogResult {
    canceled: boolean;
    filePaths: string[];
  }

  export interface SaveDialogOptions {
    defaultPath?: string;
    filters?: FileFilter[];
  }

  export interface SaveDialogResult {
    canceled: boolean;
    filePath?: string;
  }

  export interface BrowserWindowOptions {
    show?: boolean;
    frame?: boolean;
    resizable?: boolean;
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    title?: string;
    icon?: string;
    backgroundColor?: string;
    autoHideMenuBar?: boolean;
    webPreferences?: {
      preload?: string;
      contextIsolation?: boolean;
      nodeIntegration?: boolean;
      sandbox?: boolean;
    };
  }

  export class BrowserWindow {
    constructor(options: BrowserWindowOptions);
    loadURL(url: string): Promise<void>;
    loadFile(filePath: string): Promise<void>;
    once(event: 'ready-to-show', listener: () => void): void;
    show(): void;
    close(): void;
    webContents: {
      setWindowOpenHandler(
        handler: (details: { url: string }) => { action: 'allow' | 'deny'; overrideBrowserWindowOptions?: BrowserWindowOptions }
      ): void;
    };
  }

  export const app: {
    readonly isPackaged: boolean;
    setAppUserModelId(id: string): void;
    whenReady(): Promise<void>;
    quit(): void;
    on(event: 'window-all-closed' | 'activate', listener: () => void): void;
    getPath(name: string): string;
    getVersion(): string;
  };

  export const dialog: {
    showErrorBox(title: string, content: string): void;
    showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogResult>;
    showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogResult>;
  };

  export const ipcMain: {
    handle(
      channel: string,
      listener: (event: unknown, ...args: never[]) => unknown
    ): void;
  };

  export const shell: {
    openExternal(url: string): Promise<void>;
    showItemInFolder(filePath: string): void;
  };

  export const contextBridge: {
    exposeInMainWorld(key: string, api: Record<string, unknown>): void;
  };

  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  };
}

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export function getDocument(src: Record<string, unknown>): { promise: Promise<unknown> };
  export const GlobalWorkerOptions: { workerSrc: string };
}

declare const process: NodeJS.Process & { resourcesPath?: string };
