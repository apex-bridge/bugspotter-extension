import { test, expect, openOptionsPage } from './fixtures';

test.describe('Options Page', () => {
  test('renders all settings sections', async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    // Main heading
    await expect(page.getByText('BugSpotter Settings')).toBeVisible();

    // Connection section
    await expect(page.getByText('Connection')).toBeVisible();
    await expect(page.getByPlaceholder(/bugspotter\.example\.com/i)).toBeVisible();
    await expect(page.getByPlaceholder('bgs_...')).toBeVisible();

    // Allowed Domains section
    await expect(page.getByText('Allowed Domains')).toBeVisible();

    // PII Sanitization section
    await expect(page.getByText('PII Sanitization')).toBeVisible();
    await expect(page.getByText(/Enable PII redaction/i)).toBeVisible();

    // Session Replay section
    await expect(page.getByRole('heading', { name: 'Session Replay' })).toBeVisible();

    // Capture Buffers section
    await expect(page.getByText('Capture Buffers')).toBeVisible();

    // Save button
    await expect(page.getByRole('button', { name: /save settings/i })).toBeVisible();

    await page.close();
  });

  test('save button disabled without URL and API key', async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    const saveBtn = page.getByRole('button', { name: /save settings/i });
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeDisabled();

    await page.close();
  });

  test('can add and remove allowed domains', async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    // Add a domain
    const domainInput = page.getByPlaceholder('example.com', { exact: true });
    await domainInput.fill('test.example.com');
    await page.getByRole('button', { name: 'Add' }).click();

    // Should appear in the list
    await expect(page.getByText('test.example.com')).toBeVisible();

    // Should show "All domains" text only when list is empty — not shown now
    await expect(page.getByText(/All domains/i)).not.toBeVisible();

    // Remove the domain
    await page.getByRole('button', { name: 'x' }).click();

    // Should be gone
    await expect(page.getByText('test.example.com')).not.toBeVisible();
    await expect(page.getByText(/All domains/i)).toBeVisible();

    await page.close();
  });

  test('can toggle PII sanitization', async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    // PII sanitization is enabled by default — patterns should be visible
    await expect(page.getByText('Email addresses')).toBeVisible();

    // Toggle off
    const piiCheckbox = page.getByRole('checkbox', { name: /Enable PII redaction/i });
    await piiCheckbox.uncheck();

    // Pattern list should be hidden
    await expect(page.getByText('Email addresses')).not.toBeVisible();

    // Toggle back on
    await piiCheckbox.check();
    await expect(page.getByText('Email addresses')).toBeVisible();

    await page.close();
  });

  test('can toggle session replay', async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    // Session replay is off by default
    const replayCheckbox = page.getByRole('checkbox', {
      name: /Enable session replay/i,
    });
    await expect(replayCheckbox).not.toBeChecked();

    // Toggle on — should show performance warning
    await replayCheckbox.check();
    await expect(page.getByText(/may slightly impact page performance/i)).toBeVisible();

    // Toggle off — warning hidden
    await replayCheckbox.uncheck();
    await expect(page.getByText(/may slightly impact page performance/i)).not.toBeVisible();

    await page.close();
  });

  test('preset dropdown changes selected patterns', async ({ context, extensionId }) => {
    const page = await openOptionsPage(context, extensionId);

    // Select the "financial" preset
    const presetSelect = page.getByRole('combobox');
    await presetSelect.selectOption('financial');

    // Financial preset includes credit card and SSN
    const creditCardCheckbox = page.getByRole('checkbox', { name: /credit card/i });
    const ssnCheckbox = page.getByRole('checkbox', { name: /Social Security/i });

    await expect(creditCardCheckbox).toBeChecked();
    await expect(ssnCheckbox).toBeChecked();

    // Email should NOT be checked in financial preset
    const emailCheckbox = page.getByRole('checkbox', { name: /email/i });
    await expect(emailCheckbox).not.toBeChecked();

    await page.close();
  });
});
