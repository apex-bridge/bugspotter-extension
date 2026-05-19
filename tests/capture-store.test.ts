import { describe, it, expect, beforeEach } from 'vitest';
import type { ConsoleEntry, NetworkEntry } from '@/types';
import {
  __testing,
  appendConsole,
  appendNetwork,
  clearCapture,
  getConsole,
  getNetwork,
  handleCaptureMessage,
} from '@/background/capture-store';
import { resetStorage, mockChrome } from './setup';

function consoleEntry(message: string, ts = Date.now()): ConsoleEntry {
  return { level: 'log', message, timestamp: ts, args: [] };
}

function networkEntry(url: string, ts = Date.now()): NetworkEntry {
  return {
    url,
    method: 'GET',
    status: 200,
    statusText: 'OK',
    duration: 10,
    timestamp: ts,
    headers: {},
  };
}

describe('capture-store', () => {
  beforeEach(() => {
    resetStorage();
    mockChrome.storage.session.get.mockClear();
    mockChrome.storage.session.set.mockClear();
    mockChrome.storage.session.remove.mockClear();
    mockChrome.tabs.query.mockClear();
    mockChrome.tabs.query.mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
  });

  describe('console append / get / clear', () => {
    it('returns [] for a tab with no stored entries', async () => {
      expect(await getConsole(7)).toEqual([]);
    });

    it('appendConsole stores entries and getConsole returns them', async () => {
      const entries = [consoleEntry('a'), consoleEntry('b')];
      await appendConsole(7, entries, 100);
      expect(await getConsole(7)).toEqual(entries);
    });

    it('multiple appends concatenate in order', async () => {
      await appendConsole(7, [consoleEntry('a')], 100);
      await appendConsole(7, [consoleEntry('b')], 100);
      const out = await getConsole(7);
      expect(out.map((e) => e.message)).toEqual(['a', 'b']);
    });

    it('respects the maxEntries cap by dropping oldest', async () => {
      const first = Array.from({ length: 5 }, (_, i) => consoleEntry(`old-${i}`, i));
      const second = Array.from({ length: 4 }, (_, i) => consoleEntry(`new-${i}`, 100 + i));
      await appendConsole(7, first, 6);
      await appendConsole(7, second, 6);
      const out = await getConsole(7);
      expect(out).toHaveLength(6);
      // Newest 6 win — the very oldest three should be evicted
      expect(out[0].message).toBe('old-3');
      expect(out[out.length - 1].message).toBe('new-3');
    });

    it('appendConsole is a no-op on empty arrays', async () => {
      await appendConsole(7, [], 100);
      expect(mockChrome.storage.session.set).not.toHaveBeenCalled();
    });

    it('isolates console entries between tabs', async () => {
      await appendConsole(7, [consoleEntry('a')], 100);
      await appendConsole(8, [consoleEntry('b')], 100);
      expect((await getConsole(7))[0].message).toBe('a');
      expect((await getConsole(8))[0].message).toBe('b');
    });

    it('clearCapture removes both console and network keys for the tab', async () => {
      await appendConsole(7, [consoleEntry('a')], 100);
      await appendNetwork(7, [networkEntry('https://x')], 100);
      await clearCapture(7);
      expect(await getConsole(7)).toEqual([]);
      expect(await getNetwork(7)).toEqual([]);
      expect(mockChrome.storage.session.remove).toHaveBeenCalledWith('bs_console_7');
      expect(mockChrome.storage.session.remove).toHaveBeenCalledWith('bs_network_7');
    });
  });

  describe('network append / get', () => {
    it('appendNetwork stores entries and getNetwork returns them', async () => {
      const entries = [networkEntry('https://a'), networkEntry('https://b')];
      await appendNetwork(7, entries, 100);
      expect(await getNetwork(7)).toEqual(entries);
    });

    it('respects maxEntries independently from console', async () => {
      await appendConsole(7, [consoleEntry('c')], 100);
      const net = Array.from({ length: 10 }, (_, i) => networkEntry(`https://n${i}`));
      await appendNetwork(7, net, 4);
      expect(await getConsole(7)).toHaveLength(1);
      expect(await getNetwork(7)).toHaveLength(4);
    });
  });

  describe('concurrent writes', () => {
    it('serializes concurrent console appends for the same tab', async () => {
      const p1 = appendConsole(7, [consoleEntry('a')], 100);
      const p2 = appendConsole(7, [consoleEntry('b')], 100);
      await Promise.all([p1, p2]);
      const out = await getConsole(7);
      expect(out.map((e) => e.message)).toEqual(['a', 'b']);
    });

    it('console and network for the same tab run in parallel without losing writes', async () => {
      const p1 = appendConsole(7, [consoleEntry('c')], 100);
      const p2 = appendNetwork(7, [networkEntry('https://x')], 100);
      await Promise.all([p1, p2]);
      expect(await getConsole(7)).toHaveLength(1);
      expect(await getNetwork(7)).toHaveLength(1);
    });

    it('getConsole waits for pending appendConsole (no stale reads)', async () => {
      const appendP = appendConsole(7, [consoleEntry('a')], 100);
      const readP = getConsole(7);
      const [, entries] = await Promise.all([appendP, readP]);
      expect(entries).toHaveLength(1);
    });
  });

  describe('writeQueues lifecycle', () => {
    it('releases entries once their chain settles', async () => {
      expect(__testing.writeQueues.size).toBe(0);
      await appendConsole(7, [consoleEntry('a')], 100);
      await appendNetwork(7, [networkEntry('https://x')], 100);
      await new Promise((r) => setTimeout(r, 0));
      expect(__testing.writeQueues.has('7_console')).toBe(false);
      expect(__testing.writeQueues.has('7_network')).toBe(false);
    });
  });

  describe('quota recovery', () => {
    it('halves the buffer on QUOTA_BYTES exceeded and retries once', async () => {
      const entries = Array.from({ length: 6 }, (_, i) => consoleEntry(`m-${i}`));
      mockChrome.storage.session.set
        .mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'))
        .mockResolvedValueOnce(undefined);
      await appendConsole(7, entries, 100);
      expect(mockChrome.storage.session.set).toHaveBeenCalledTimes(2);
      const retryArgs = mockChrome.storage.session.set.mock.calls[1][0];
      const stored = retryArgs['bs_console_7'] as ConsoleEntry[];
      expect(stored.length).toBeLessThan(entries.length);
      expect(stored.length).toBeGreaterThan(0);
    });
  });

  describe('handleCaptureMessage', () => {
    function sender(tabId?: number): chrome.runtime.MessageSender {
      return tabId !== undefined ? { tab: { id: tabId } as chrome.tabs.Tab } : {};
    }

    function awaitResponse(): { promise: Promise<unknown>; cb: (r: unknown) => void } {
      let resolve!: (r: unknown) => void;
      const promise = new Promise<unknown>((r) => (resolve = r));
      return { promise, cb: resolve };
    }

    it('returns false for non-capture messages', () => {
      expect(handleCaptureMessage({ type: 'SOMETHING_ELSE' }, sender(1), () => {})).toBe(false);
    });

    it('CAPTURE_APPEND_CONSOLE ignores a forged message.tabId — writes to sender.tab', async () => {
      const { promise, cb } = awaitResponse();
      handleCaptureMessage(
        {
          type: 'CAPTURE_APPEND_CONSOLE',
          tabId: 999,
          entries: [consoleEntry('a')],
          maxEntries: 100,
        },
        sender(7),
        cb,
      );
      await promise;
      expect(await getConsole(7)).toHaveLength(1);
      expect(await getConsole(999)).toEqual([]);
    });

    it('CAPTURE_APPEND_NETWORK without sender.tab returns ok: false', async () => {
      const { promise, cb } = awaitResponse();
      handleCaptureMessage(
        { type: 'CAPTURE_APPEND_NETWORK', entries: [networkEntry('https://x')], maxEntries: 100 },
        sender(),
        cb,
      );
      expect(await promise).toEqual({ ok: false });
      expect(mockChrome.tabs.query).not.toHaveBeenCalled();
    });

    it('CAPTURE_GET_ALL prefers sender.tab.id over forged message.tabId', async () => {
      await appendConsole(7, [consoleEntry('seven')], 100);
      await appendConsole(999, [consoleEntry('forged')], 100);
      const { promise, cb } = awaitResponse();
      handleCaptureMessage({ type: 'CAPTURE_GET_ALL', tabId: 999 }, sender(7), cb);
      const resp = (await promise) as { console: ConsoleEntry[]; network: NetworkEntry[] };
      expect(resp.console.map((e) => e.message)).toEqual(['seven']);
    });

    it('CAPTURE_GET_ALL from popup (no sender.tab) honors message.tabId', async () => {
      await appendConsole(7, [consoleEntry('a')], 100);
      const { promise, cb } = awaitResponse();
      handleCaptureMessage({ type: 'CAPTURE_GET_ALL', tabId: 7 }, sender(), cb);
      const resp = (await promise) as { console: ConsoleEntry[]; network: NetworkEntry[] };
      expect(resp.console).toHaveLength(1);
    });

    it('CAPTURE_CLEAR prefers sender.tab.id over forged message.tabId', async () => {
      await appendConsole(7, [consoleEntry('a')], 100);
      await appendConsole(999, [consoleEntry('b')], 100);
      const { promise, cb } = awaitResponse();
      handleCaptureMessage({ type: 'CAPTURE_CLEAR', tabId: 999 }, sender(7), cb);
      await promise;
      expect(await getConsole(7)).toEqual([]);
      expect(await getConsole(999)).toHaveLength(1);
    });
  });
});
