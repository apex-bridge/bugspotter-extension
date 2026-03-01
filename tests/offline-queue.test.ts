import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OfflineQueue } from '@/utils/offline-queue';
import { resetStorage, mockChrome } from './setup';

describe('utils/offline-queue', () => {
  let queue: OfflineQueue;

  beforeEach(() => {
    resetStorage();
    mockChrome.storage.local.get.mockClear();
    mockChrome.storage.local.set.mockClear();
    mockChrome.storage.local.remove.mockClear();
    queue = new OfflineQueue({ enabled: true, maxQueueSize: 5 });
  });

  it('enqueues a request', async () => {
    await queue.enqueue('https://api.test.com/reports', '{"title":"Bug"}', {
      'Content-Type': 'application/json',
      'X-API-Key': 'secret',
    });

    const size = await queue.size();
    expect(size).toBe(1);
    expect(mockChrome.storage.local.set).toHaveBeenCalled();
  });

  it('strips sensitive headers before storing', async () => {
    await queue.enqueue('https://api.test.com', '{}', {
      'Content-Type': 'application/json',
      'X-API-Key': 'secret',
      Authorization: 'Bearer token',
    });

    // Check what was stored
    const setCall = mockChrome.storage.local.set.mock.calls[0][0];
    const storedQueue = setCall.bugspotter_offline_queue;
    expect(storedQueue[0].headers).not.toHaveProperty('X-API-Key');
    expect(storedQueue[0].headers).not.toHaveProperty('Authorization');
    expect(storedQueue[0].headers).toHaveProperty('Content-Type');
  });

  it('enforces max queue size', async () => {
    for (let i = 0; i < 7; i++) {
      await queue.enqueue(`https://api.test.com/${i}`, `{"i":${i}}`, {});
    }

    const size = await queue.size();
    expect(size).toBeLessThanOrEqual(5);
  });

  it('does nothing when disabled', async () => {
    const disabled = new OfflineQueue({ enabled: false, maxQueueSize: 5 });
    await disabled.enqueue('https://api.test.com', '{}', {});
    const size = await disabled.size();
    expect(size).toBe(0);
  });

  it('clears the queue', async () => {
    await queue.enqueue('https://api.test.com', '{}', {});
    await queue.clear();
    expect(mockChrome.storage.local.remove).toHaveBeenCalledWith('bugspotter_offline_queue');
  });

  it('processes queue and removes successful items', async () => {
    await queue.enqueue('https://api.test.com/reports', '{"title":"Bug"}', {
      'Content-Type': 'application/json',
    });

    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const successCount = await queue.processQueue({ 'X-API-Key': 'key' });
    expect(successCount).toBe(1);

    vi.unstubAllGlobals();
  });
});
