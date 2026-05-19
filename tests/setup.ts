import { vi } from 'vitest';

// Mock chrome APIs
const syncData: Record<string, unknown> = {};
const sessionData: Record<string, unknown> = {};
const localData: Record<string, unknown> = {};

const chrome = {
  storage: {
    sync: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: syncData[key] })),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(syncData, items);
        return Promise.resolve();
      }),
    },
    session: {
      get: vi.fn((key: string | string[] | null) => {
        if (key === null) {
          return Promise.resolve({ ...sessionData });
        }
        if (Array.isArray(key)) {
          const result: Record<string, unknown> = {};
          for (const k of key) result[k] = sessionData[k];
          return Promise.resolve(result);
        }
        return Promise.resolve({ [key]: sessionData[key] });
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(sessionData, items);
        return Promise.resolve();
      }),
      remove: vi.fn((key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        for (const k of keys) delete sessionData[k];
        return Promise.resolve();
      }),
    },
    local: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: localData[key] })),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(localData, items);
        return Promise.resolve();
      }),
      remove: vi.fn((key: string) => {
        delete localData[key];
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
    sendMessage: vi.fn(() => Promise.resolve()),
  },
  action: {
    setBadgeBackgroundColor: vi.fn(),
  },
};

vi.stubGlobal('chrome', chrome);

// Helper to reset all storage between tests
export function resetStorage() {
  for (const key of Object.keys(syncData)) delete syncData[key];
  for (const key of Object.keys(sessionData)) delete sessionData[key];
  for (const key of Object.keys(localData)) delete localData[key];
}

export { chrome as mockChrome };
