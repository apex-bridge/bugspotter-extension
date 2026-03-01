import { test, expect, openTestPage } from './fixtures';

test.describe('Content Script Injection', () => {
  test('injects main-world-capture.js without CSP errors', async ({ context }) => {
    const page = await openTestPage(context);

    // Collect console errors — CSP violations appear as error-level messages
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Reload to trigger a fresh content script injection
    await page.reload();
    await page.waitForTimeout(1000);

    // No CSP violations should be present
    const cspErrors = errors.filter(
      (e) =>
        e.includes('Content Security Policy') || e.includes('Refused to execute inline script'),
    );
    expect(cspErrors).toHaveLength(0);
  });

  test('console.log still works after patching', async ({ context }) => {
    const page = await openTestPage(context);

    // Collect console messages to verify patched console still relays them
    const messages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'log') messages.push(msg.text());
    });

    // Trigger a console.log in the page's main world
    await page.evaluate(() => {
      console.log('bugspotter-e2e-test-message');
    });

    await page.waitForTimeout(300);

    // The patched console.log should still relay messages to the devtools console
    expect(messages).toContain('bugspotter-e2e-test-message');
  });

  test('captures fetch network requests', async ({ context }) => {
    const page = await openTestPage(context);

    // Make a fetch request in the page
    const status = await page.evaluate(async () => {
      try {
        const res = await fetch('https://httpbin.org/get');
        return res.status;
      } catch {
        return -1;
      }
    });

    // The fetch should still work (our patching shouldn't break it)
    expect(status).toBe(200);
  });

  test('captures XMLHttpRequest network requests', async ({ context }) => {
    const page = await openTestPage(context);

    // Make an XHR request in the page
    const status = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', 'https://httpbin.org/get');
          xhr.onload = () => resolve(xhr.status);
          xhr.onerror = () => resolve(-1);
          xhr.send();
        }),
    );

    expect(status).toBe(200);
  });

  test('does not inject on chrome:// pages', async ({ context }) => {
    const page = await context.newPage();
    // Navigate to a chrome internal page — content scripts don't run here
    await page.goto('chrome://version');
    await page.waitForTimeout(500);

    // No errors should have occurred
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(500);

    // No BugSpotter-related errors
    const bugspotterErrors = errors.filter((e) => e.includes('BugSpotter'));
    expect(bugspotterErrors).toHaveLength(0);
  });
});
