import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..', 'dist');

/**
 * Custom Playwright fixtures for Chrome extension testing.
 *
 * Chrome extensions cannot run in headless mode, so we launch a
 * persistent Chromium context with --load-extension pointing at dist/.
 *
 * The fixture exposes:
 *   - context:     the BrowserContext with the extension loaded
 *   - extensionId: the runtime ID of the loaded extension
 */
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
        '--disable-default-apps',
        '--disable-gpu',
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    // In MV3, the service worker URL reveals the extension ID:
    //   chrome-extension://<id>/service-worker-loader.js
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }
    const url = serviceWorker.url();
    const id = url.split('/')[2];
    await use(id);
  },
});

export const expect = test.expect;

/**
 * Get the extension popup page.
 * Opens the popup HTML in a new tab (extension popups can't be opened
 * programmatically in Playwright, so we navigate to the popup URL directly).
 */
export async function openPopup(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await page.waitForLoadState('domcontentloaded');
  return page;
}

/**
 * Get the extension options page.
 */
export async function openOptionsPage(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  await page.waitForLoadState('domcontentloaded');
  return page;
}

/**
 * Navigate to a test page and wait for the content script to inject.
 */
export async function openTestPage(context: BrowserContext, url = 'https://example.com') {
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  // Wait for the main-world capture script's injection flag
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.waitForFunction(() => (window as any).__bugspotter_injected, null, { timeout: 5000 });
  return page;
}
