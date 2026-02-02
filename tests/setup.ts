import { vi } from 'vitest';

// Mock chrome APIs
const storageData: Record<string, unknown> = {};

const chrome = {
  storage: {
    sync: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: storageData[key] })),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(storageData, items);
        return Promise.resolve();
      }),
    },
    session: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: storageData[`session_${key}`] })),
      set: vi.fn((items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) {
          storageData[`session_${k}`] = v;
        }
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    sendMessage: vi.fn(() => Promise.resolve()),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    captureVisibleTab: vi.fn(() => Promise.resolve('data:image/png;base64,abc')),
    query: vi.fn(() => Promise.resolve([{ id: 1, url: 'https://example.com' }])),
    onRemoved: {
      addListener: vi.fn(),
    },
  },
  action: {
    setBadgeBackgroundColor: vi.fn(),
  },
};

vi.stubGlobal('chrome', chrome);

// Helper to reset storage between tests
export function resetStorage() {
  for (const key of Object.keys(storageData)) {
    delete storageData[key];
  }
}

export { chrome as mockChrome };
