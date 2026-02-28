import { describe, it, expect, beforeEach, vi } from 'vitest';

let initNetworkCapture: (maxEntries?: number) => void;
let getNetworkRequests: () => {
  url: string;
  method: string;
  status: number;
  duration: number;
  error?: string;
  requestBody?: string;
}[];

describe('content/network-capture', () => {
  beforeEach(async () => {
    vi.resetModules();

    window.fetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
    }) as unknown as typeof window.fetch;

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

  it('records network errors with error field', async () => {
    window.fetch = vi
      .fn()
      .mockRejectedValue(new Error('Network failure')) as unknown as typeof window.fetch;

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
    expect(req!.error).toBe('Network failure');
  });

  it('defaults to 50 entries buffer', async () => {
    initNetworkCapture();

    for (let i = 0; i < 60; i++) {
      await window.fetch(`https://api.example.com/${i}`);
    }

    const requests = getNetworkRequests();
    expect(requests.length).toBe(50);
  });

  it('respects custom buffer size', async () => {
    initNetworkCapture(20);

    for (let i = 0; i < 30; i++) {
      await window.fetch(`https://api.example.com/${i}`);
    }

    const requests = getNetworkRequests();
    expect(requests.length).toBe(20);
  });

  it('captures request body from fetch', async () => {
    initNetworkCapture();

    await window.fetch('https://api.example.com/data', {
      method: 'POST',
      body: '{"key":"value"}',
    });

    const requests = getNetworkRequests();
    const req = requests.find((r) => r.url === 'https://api.example.com/data');
    expect(req).toBeDefined();
    expect(req!.requestBody).toBe('{"key":"value"}');
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
