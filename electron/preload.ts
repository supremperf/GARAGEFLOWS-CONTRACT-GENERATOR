import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('garageflows', {
  isElectron: true,
  openFile: (filters?: { name: string; extensions: string[] }[]) => ipcRenderer.invoke('dialog:open-file', filters),
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  showItem: (filePath: string) => ipcRenderer.invoke('shell:show-item', filePath),
});
