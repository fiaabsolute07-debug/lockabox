import { defineConfig, devices } from '@playwright/test';

// Default: the installed Google Chrome. PW_EXECUTABLE points at another Chromium build (e.g. a container without Chrome).
const executablePath = process.env.PW_EXECUTABLE;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4310', trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : { channel: 'chrome' }),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'pnpm dev', url: 'http://127.0.0.1:4310', reuseExistingServer: true, timeout: 120_000 },
});
