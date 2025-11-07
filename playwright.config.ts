import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
  },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3000',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
