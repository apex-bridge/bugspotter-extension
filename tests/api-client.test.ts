import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchProjects,
  createReport,
  uploadScreenshot,
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
    it('throws when settings not configured', async () => {
      await expect(fetchProjects()).rejects.toThrow(
        'BugSpotter URL and API key must be configured',
      );
    });

    it('fetches projects with correct headers', async () => {
      await configureSettings();
      mockFetch.mockResolvedValue({
        ok: true,
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

    it('throws on 401', async () => {
      await configureSettings();
      mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
      await expect(fetchProjects()).rejects.toThrow('Invalid API key');
    });

    it('throws on 403', async () => {
      await configureSettings();
      mockFetch.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });
      await expect(fetchProjects()).rejects.toThrow('Quota exceeded');
    });
  });

  describe('createReport', () => {
    it('sends report payload as JSON', async () => {
      await configureSettings();
      const payload = {
        title: 'Bug title',
        description: 'desc',
        priority: 'high' as const,
        project_id: 'proj-1',
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
          },
        },
        hasScreenshot: true,
        hasReplay: false,
      };

      mockFetch.mockResolvedValue({
        ok: true,
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
      mockFetch.mockResolvedValue({ ok: true });
      const blob = new Blob(['png'], { type: 'image/png' });

      await uploadScreenshot('https://s3.example.com/upload', blob);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://s3.example.com/upload',
        expect.objectContaining({ method: 'PUT', body: blob }),
      );
    });

    it('throws on upload failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      const blob = new Blob(['png']);
      await expect(uploadScreenshot('https://s3.example.com/upload', blob)).rejects.toThrow(
        'Screenshot upload failed',
      );
    });
  });

  describe('confirmUpload', () => {
    it('POSTs confirm with fileType', async () => {
      await configureSettings();
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

      await confirmUpload('bug-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://bugs.test.com/api/v1/reports/bug-1/confirm-upload',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ fileType: 'screenshot' }),
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
      });
      expect(result).toBe(true);
    });

    it('returns false on failed connection', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 });
      const result = await validateConnection({
        baseUrl: 'https://bugs.test.com',
        apiKey: 'bgs_bad',
      });
      expect(result).toBe(false);
    });

    it('returns false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const result = await validateConnection({
        baseUrl: 'https://bugs.test.com',
        apiKey: 'bgs_key',
      });
      expect(result).toBe(false);
    });
  });
});
