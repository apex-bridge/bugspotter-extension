import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchProjects,
  createReport,
  uploadScreenshot,
  uploadReplay,
  confirmUpload,
  validateConnection,
} from '@/api/bugspotter-client';
import { saveSettings } from '@/storage/settings';
import { resetStorage } from './setup';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('api/bugspotter-client', () => {
  beforeEach(() => {
    resetStorage();
    mockFetch.mockReset();
  });

  async function configureSettings() {
    await saveSettings({
      baseUrl: 'https://bugs.test.com',
      apiKey: 'bgs_abcdefghijklmnopqrstuvwxyz01234567890ABCDE',
    });
  }

  describe('fetchProjects', () => {
    it('returns fallback when settings not configured', async () => {
      const result = await fetchProjects();
      expect(result).toEqual([{ id: 'api-key-project', name: 'API Key Project' }]);
    });

    it('fetches projects with correct headers', async () => {
      await configureSettings();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ success: true, data: [{ id: '1', name: 'Project A' }] }),
      });

      const projects = await fetchProjects();
      expect(projects).toEqual([{ id: '1', name: 'Project A' }]);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://bugs.test.com/api/v1/projects',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'bgs_abcdefghijklmnopqrstuvwxyz01234567890ABCDE',
          }),
        }),
      );
    });

    it('returns placeholder on 401 (API key auth)', async () => {
      await configureSettings();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
      });
      // fetchProjects catches the error and returns a fallback
      const projects = await fetchProjects();
      expect(projects).toEqual([{ id: 'api-key-project', name: 'API Key Project' }]);
    });
  });

  describe('createReport', () => {
    it('sends report payload as JSON', async () => {
      await configureSettings();
      const payload = {
        title: 'Bug title',
        description: 'desc',
        priority: 'high' as const,
        report: {
          console: [],
          network: [],
          metadata: {
            userAgent: 'test',
            viewport: { width: 1920, height: 1080 },
            url: 'https://example.com',
            timestamp: 123,
            platform: 'test',
            language: 'en',
            screen: { width: 1920, height: 1080 },
            timezone: 'UTC',
            browser: 'Chrome',
            os: 'Windows',
            version: '',
          },
        },
        hasScreenshot: true,
        hasReplay: false,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            success: true,
            data: { id: 'bug-1', project_id: 'proj-1', title: 'Bug title', presignedUrls: {} },
          }),
      });

      const result = await createReport(payload);
      expect(result.data.id).toBe('bug-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://bugs.test.com/api/v1/reports',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('uploadScreenshot', () => {
    it('PUTs blob to presigned URL', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200, headers: new Headers() });
      const blob = new Blob(['png'], { type: 'image/png' });

      await uploadScreenshot('https://s3.example.com/upload', blob);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://s3.example.com/upload',
        expect.objectContaining({ method: 'PUT', body: blob }),
      );
    });

    it('throws on upload failure after retries', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, headers: new Headers() });
      const blob = new Blob(['png']);
      await expect(uploadScreenshot('https://s3.example.com/upload', blob)).rejects.toThrow(
        'Screenshot upload failed',
      );
    });
  });

  describe('uploadReplay', () => {
    it('PUTs gzip blob to presigned URL', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200, headers: new Headers() });
      const blob = new Blob(['gzipped'], { type: 'application/gzip' });

      await uploadReplay('https://s3.example.com/replay', blob);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://s3.example.com/replay',
        expect.objectContaining({ method: 'PUT', body: blob }),
      );
    });
  });

  describe('confirmUpload', () => {
    it('POSTs confirm with screenshot fileType', async () => {
      await configureSettings();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ success: true }),
      });

      await confirmUpload('bug-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://bugs.test.com/api/v1/reports/bug-1/confirm-upload',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ fileType: 'screenshot' }),
        }),
      );
    });

    it('POSTs confirm with replay fileType', async () => {
      await configureSettings();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ success: true }),
      });

      await confirmUpload('bug-1', 'replay');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://bugs.test.com/api/v1/reports/bug-1/confirm-upload',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ fileType: 'replay' }),
        }),
      );
    });
  });

  describe('validateConnection', () => {
    it('returns true on successful connection', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await validateConnection({
        baseUrl: 'https://bugs.test.com',
        apiKey: 'bgs_key',
        allowedDomains: [],
        sanitizationEnabled: true,
        sanitizationPatterns: [],
        replayEnabled: false,
        maxConsoleEntries: 100,
        maxNetworkEntries: 50,
      });
      expect(result).toBe(true);
    });

    it('returns false on failed connection', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 });
      const result = await validateConnection({
        baseUrl: 'https://bugs.test.com',
        apiKey: 'bgs_bad',
        allowedDomains: [],
        sanitizationEnabled: true,
        sanitizationPatterns: [],
        replayEnabled: false,
        maxConsoleEntries: 100,
        maxNetworkEntries: 50,
      });
      expect(result).toBe(false);
    });

    it('returns false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const result = await validateConnection({
        baseUrl: 'https://bugs.test.com',
        apiKey: 'bgs_key',
        allowedDomains: [],
        sanitizationEnabled: true,
        sanitizationPatterns: [],
        replayEnabled: false,
        maxConsoleEntries: 100,
        maxNetworkEntries: 50,
      });
      expect(result).toBe(false);
    });
  });
});
