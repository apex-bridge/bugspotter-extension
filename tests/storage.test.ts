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
      expect(settings).toEqual({ baseUrl: '', apiKey: '' });
    });

    it('returns stored settings', async () => {
      await saveSettings({ baseUrl: 'https://bugs.example.com', apiKey: 'bgs_testkey123' });
      const settings = await getSettings();
      expect(settings.baseUrl).toBe('https://bugs.example.com');
      expect(settings.apiKey).toBe('bgs_testkey123');
    });
  });

  describe('saveSettings', () => {
    it('calls chrome.storage.sync.set', async () => {
      await saveSettings({ baseUrl: 'https://test.com', apiKey: 'bgs_key' });
      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        bugspotter_settings: { baseUrl: 'https://test.com', apiKey: 'bgs_key' },
      });
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
