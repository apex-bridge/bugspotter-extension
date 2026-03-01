import { test, expect, openPopup } from './fixtures';

test.describe('Popup', () => {
  test('shows configuration prompt when no settings', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);

    // Should show the "not configured" message since no baseUrl/apiKey are set
    await expect(popup.getByRole('heading', { name: 'BugSpotter' })).toBeVisible();
    await expect(popup.getByText(/configure your BugSpotter URL/i)).toBeVisible();
    await expect(popup.getByRole('button', { name: /open options/i })).toBeVisible();

    await popup.close();
  });

  test('shows bug report form when configured', async ({ context, extensionId }) => {
    // Pre-configure settings via the extension's storage
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await page.waitForLoadState('domcontentloaded');

    // Set settings directly via chrome.storage API from extension context
    await page.evaluate(() => {
      return chrome.storage.sync.set({
        bugspotter_settings: {
          baseUrl: 'https://bugspotter.example.com',
          apiKey: 'bgs_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
          allowedDomains: [],
          sanitizationEnabled: true,
          sanitizationPatterns: ['email', 'creditcard'],
          replayEnabled: false,
          maxConsoleEntries: 100,
          maxNetworkEntries: 50,
        },
      });
    });
    await page.close();

    // Now open the popup
    const popup = await openPopup(context, extensionId);

    // Should show the report form, not the "configure" prompt
    await expect(popup.getByText('BugSpotter')).toBeVisible();

    // Look for form elements
    await expect(popup.getByPlaceholder(/title|summary|bug/i).first()).toBeVisible({
      timeout: 5000,
    });

    // Screenshot capture button
    await expect(popup.getByRole('button', { name: /capture screenshot/i })).toBeVisible();

    await popup.close();
  });

  test('requires title before submit', async ({ context, extensionId }) => {
    // Pre-configure
    const settingsPage = await context.newPage();
    await settingsPage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await settingsPage.evaluate(() => {
      return chrome.storage.sync.set({
        bugspotter_settings: {
          baseUrl: 'https://bugspotter.example.com',
          apiKey: 'bgs_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
          allowedDomains: [],
          sanitizationEnabled: true,
          sanitizationPatterns: [],
          replayEnabled: false,
          maxConsoleEntries: 100,
          maxNetworkEntries: 50,
        },
      });
    });
    await settingsPage.close();

    const popup = await openPopup(context, extensionId);

    // Submit button should be disabled when title is empty
    const submitBtn = popup.getByRole('button', { name: /submit/i });
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await expect(submitBtn).toBeDisabled();

    await popup.close();
  });
});
