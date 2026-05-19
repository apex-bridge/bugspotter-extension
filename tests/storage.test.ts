import { describe, it, expect, beforeEach } from 'vitest';
import { getSettings, saveSettings, getSessionData, setSessionData } from '@/storage/settings';
import { resetStorage, mockChrome } from './setup';

describe('storage/settings', () => {
  beforeEach(() => {
    resetStorage();
    mockChrome.storage.sync.get.mockClear();
    mockChrome.storage.sync.set.mockClear();
  });

  describe('getSettings', () => {
    it('returns defaults when no settings stored', async () => {
      const settings = await getSettings();
      expect(settings.baseUrl).toBe('');
      expect(settings.apiKey).toBe('');
      expect(settings.allowedDomains).toEqual([]);
      expect(settings.sanitizationEnabled).toBe(true);
      expect(settings.replayEnabled).toBe(false);
      expect(settings.maxConsoleEntries).toBe(300);
      expect(settings.maxNetworkEntries).toBe(150);
      expect(settings.sanitizationPatterns).toContain('email');
    });

    it('merges stored settings with defaults', async () => {
      await saveSettings({ baseUrl: 'https://bugs.example.com', apiKey: 'bgs_testkey123' });
      const settings = await getSettings();
      expect(settings.baseUrl).toBe('https://bugs.example.com');
      expect(settings.apiKey).toBe('bgs_testkey123');
      // Defaults should still be present
      expect(settings.sanitizationEnabled).toBe(true);
      expect(settings.maxConsoleEntries).toBe(300);
    });
  });

  describe('saveSettings', () => {
    it('merges with existing settings', async () => {
      await saveSettings({ baseUrl: 'https://test.com', apiKey: 'bgs_key' });
      await saveSettings({ replayEnabled: true });
      const settings = await getSettings();
      expect(settings.baseUrl).toBe('https://test.com');
      expect(settings.replayEnabled).toBe(true);
    });
  });

  describe('session data', () => {
    it('returns null when no session data', async () => {
      const data = await getSessionData('test_key');
      expect(data).toBeNull();
    });

    it('stores and retrieves session data', async () => {
      await setSessionData('capture', { screenshot: 'data:image/png;base64,abc' });
      expect(mockChrome.storage.session.set).toHaveBeenCalled();
    });
  });
});
