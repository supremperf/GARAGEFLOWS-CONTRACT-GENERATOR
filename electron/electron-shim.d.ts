declare module 'electron' {
  export const app: any;
  export const BrowserWindow: any;
  export const ipcMain: any;
  export const dialog: any;
  export const shell: any;
  export const contextBridge: any;
  export const ipcRenderer: any;
}

declare module 'pdfjs-dist/legacy/build/pdf.js' {
  export function getDocument(src: unknown): { promise: Promise<any> };
  export const GlobalWorkerOptions: { workerSrc: string };
}

declare const process: NodeJS.Process & { resourcesPath?: string };
