import { defineConfig } from '@playwright/test';

/**
 * Playwright config for G2.3. The origin is injected by `check-smoke` after the gateway listens.
 * A config that defaulted to a hard-coded port would green against whatever happened to be there.
 */

const origin = process.env['MINIDRAMA_SMOKE_ORIGIN'];
if (origin === undefined || origin === '') {
  throw new Error(
    'MINIDRAMA_SMOKE_ORIGIN is required: check-smoke sets it after the gateway listens',
  );
}

export default defineConfig({
  testDir: './specs',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: origin,
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    // Cloud/CI containers often refuse the SUID sandbox. This is still Chromium, not a skip.
    launchOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  },
});
