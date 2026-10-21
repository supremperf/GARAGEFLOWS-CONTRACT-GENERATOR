/// <reference types="vite/client" />

interface Window {
  garageflows?: {
    isElectron: boolean;
    openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
    openDirectory: () => Promise<string | null>;
    showItem: (filePath: string) => Promise<void>;
  };
}
