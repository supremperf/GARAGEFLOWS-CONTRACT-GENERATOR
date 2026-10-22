import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
        headers: process.env.GARAGEFLOWS_LOCAL_CAPABILITY ? { 'X-GF-Local-Capability': process.env.GARAGEFLOWS_LOCAL_CAPABILITY } : {},
      },
    },
  },
  build: {
    // Electron 28 embeds Chromium 120 (PDF.js ESM uses top-level await).
    target: 'chrome120',
    outDir: 'dist-renderer',
    emptyOutDir: true,
  },
});
