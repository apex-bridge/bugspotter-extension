import { describe, it, expect, beforeEach, vi } from 'vitest';

let initNetworkCapture: () => void;
let getNetworkRequests: () => { url: string; method: string; status: number; duration: number }[];

describe('content/network-capture', () => {
  beforeEach(async () => {
    vi.resetModules();

    // Provide a mock base fetch on window that the module will wrap
    window.fetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
    }) as unknown as typeof window.fetch;

    // Mock PerformanceObserver
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        observe() {}
      },
    );

    const mod = await import('@/content/network-capture');
    initNetworkCapture = mod.initNetworkCapture;
    getNetworkRequests = mod.getNetworkRequests;
  });

  it('intercepts fetch calls and records them', async () => {
    initNetworkCapture();

    await window.fetch('https://api.example.com/data', { method: 'POST' });

    const requests = getNetworkRequests();
    expect(requests.length).toBeGreaterThanOrEqual(1);
    const req = requests.find((r) => r.url === 'https://api.example.com/data');
    expect(req).toBeDefined();
    expect(req!.method).toBe('POST');
    expect(req!.status).toBe(200);
  });

  it('records network errors', async () => {
    // Set up a fetch that will fail when called by the interceptor
    window.fetch = vi
      .fn()
      .mockRejectedValue(new Error('Network failure')) as unknown as typeof window.fetch;

    // Re-import to pick up the failing fetch
    vi.resetModules();
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        observe() {}
      },
    );
    const mod = await import('@/content/network-capture');
    mod.initNetworkCapture();

    await expect(window.fetch('https://api.example.com/fail')).rejects.toThrow();

    const requests = mod.getNetworkRequests();
    const req = requests.find((r) => r.url === 'https://api.example.com/fail');
    expect(req).toBeDefined();
    expect(req!.status).toBe(0);
    expect(req!.statusText).toBe('Network Error');
  });

  it('limits buffer to 50 entries', async () => {
    initNetworkCapture();

    for (let i = 0; i < 60; i++) {
      await window.fetch(`https://api.example.com/${i}`);
    }

    const requests = getNetworkRequests();
    expect(requests.length).toBe(50);
  });

  it('returns a copy of the buffer', async () => {
    initNetworkCapture();
    await window.fetch('https://api.example.com/test');

    const r1 = getNetworkRequests();
    const r2 = getNetworkRequests();
    expect(r1).not.toBe(r2);
    expect(r1).toEqual(r2);
  });
});
