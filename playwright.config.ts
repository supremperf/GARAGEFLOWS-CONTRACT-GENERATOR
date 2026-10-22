import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:5180',
    viewport: { width: 1100, height: 720 },
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS || '[]'),
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build:renderer && npx tsx scripts/serve-ui-tests.ts',
    url: 'http://127.0.0.1:5180/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
