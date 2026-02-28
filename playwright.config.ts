import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, 'dist');

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1, // Extensions require serial execution (single browser context)
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // Chrome extension testing requires a persistent context with the
    // extension loaded via --load-extension. Headless mode is not supported
    // for extensions, so we use headed Chromium.
    headless: false,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        // These are consumed by our custom fixture (see e2e/fixtures.ts)
        launchOptions: {
          args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-first-run',
            '--disable-default-apps',
          ],
        },
      },
    },
  ],
});
