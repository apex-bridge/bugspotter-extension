import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReplayEvent } from '@bugspotter/common';
import {
  __testing,
  appendReplay,
  clearReplay,
  getReplay,
  handleReplayMessage,
  pruneEvents,
  resolveTabId,
} from '@/background/replay-store';
import { resetStorage, mockChrome } from './setup';

const FULL_SNAPSHOT = 2;
const META = 4;
const INCREMENTAL = 3;

function ev(type: number, timestamp: number, data: unknown = {}): ReplayEvent {
  return { type, timestamp, data };
}

describe('replay-store', () => {
  beforeEach(() => {
    resetStorage();
    mockChrome.storage.session.get.mockClear();
    mockChrome.storage.session.set.mockClear();
    mockChrome.storage.session.remove.mockClear();
    mockChrome.tabs.query.mockClear();
    // default: active tab is id 42 in last-focused window
    mockChrome.tabs.query.mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
  });

  describe('pruneEvents', () => {
    it('drops events older than the window', () => {
      const now = Date.now();
      const events = [
        ev(INCREMENTAL, now - 300_000),
        ev(INCREMENTAL, now - 200_000),
        ev(INCREMENTAL, now - 5_000),
      ];
      const result = pruneEvents(events, 60);
      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toBe(now - 5_000);
    });

    it('keeps everything when nothing is older than the window', () => {
      const now = Date.now();
      const events = [ev(INCREMENTAL, now - 1000), ev(INCREMENTAL, now)];
      const result = pruneEvents(events, 60);
      expect(result).toHaveLength(2);
    });

    it('preserves the latest FullSnapshot even when older than the window', () => {
      const now = Date.now();
      const events = [
        ev(FULL_SNAPSHOT, now - 300_000), // older than 60s window
        ev(INCREMENTAL, now - 100),
      ];
      const result = pruneEvents(events, 60);
      // FullSnapshot must survive so rrweb-player has an anchor
      expect(result[0].type).toBe(FULL_SNAPSHOT);
      expect(result).toHaveLength(2);
    });

    it('preserves the Meta event immediately before the protected FullSnapshot', () => {
      const now = Date.now();
      const events = [
        ev(INCREMENTAL, now - 400_000), // way old, will be dropped
        ev(META, now - 300_000),
        ev(FULL_SNAPSHOT, now - 300_000),
        ev(INCREMENTAL, now - 100),
      ];
      const result = pruneEvents(events, 60);
      expect(result.map((e) => e.type)).toEqual([META, FULL_SNAPSHOT, INCREMENTAL]);
    });

    it('does not synthesize a Meta if the event before FullSnapshot is not type 4', () => {
      const now = Date.now();
      const events = [
        ev(INCREMENTAL, now - 400_000), // not a Meta — should NOT be kept
        ev(FULL_SNAPSHOT, now - 300_000),
        ev(INCREMENTAL, now - 100),
      ];
      const result = pruneEvents(events, 60);
      expect(result.map((e) => e.type)).toEqual([FULL_SNAPSHOT, INCREMENTAL]);
    });

    it('returns the same reference when nothing needs pruning', () => {
      const now = Date.now();
      const events = [ev(INCREMENTAL, now)];
      const result = pruneEvents(events, 60);
      expect(result).toBe(events);
    });

    it('handles empty input', () => {
      expect(pruneEvents([], 60)).toEqual([]);
    });
  });

  describe('getReplay / appendReplay / clearReplay', () => {
    it('returns [] for a tab with no stored events', async () => {
      expect(await getReplay(7)).toEqual([]);
    });

    it('appendReplay stores events and getReplay returns them', async () => {
      const events = [ev(META, Date.now()), ev(FULL_SNAPSHOT, Date.now())];
      await appendReplay(7, events);
      const out = await getReplay(7);
      expect(out).toEqual(events);
    });

    it('multiple appends concatenate in order', async () => {
      const now = Date.now();
      await appendReplay(7, [ev(META, now), ev(FULL_SNAPSHOT, now)]);
      await appendReplay(7, [ev(INCREMENTAL, now + 100)]);
      const out = await getReplay(7);
      expect(out.map((e) => e.type)).toEqual([META, FULL_SNAPSHOT, INCREMENTAL]);
    });

    it('appendReplay is a no-op when given an empty array', async () => {
      await appendReplay(7, []);
      expect(mockChrome.storage.session.set).not.toHaveBeenCalled();
    });

    it('isolates events between tabs', async () => {
      const now = Date.now();
      await appendReplay(7, [ev(FULL_SNAPSHOT, now)]);
      await appendReplay(8, [ev(INCREMENTAL, now)]);
      expect((await getReplay(7))[0].type).toBe(FULL_SNAPSHOT);
      expect((await getReplay(8))[0].type).toBe(INCREMENTAL);
    });

    it('clearReplay removes the per-tab key', async () => {
      const now = Date.now();
      await appendReplay(7, [ev(FULL_SNAPSHOT, now)]);
      await clearReplay(7);
      expect(await getReplay(7)).toEqual([]);
      expect(mockChrome.storage.session.remove).toHaveBeenCalledWith('bs_replay_7');
    });

    it('serializes concurrent appends to the same tab so neither write is lost', async () => {
      // Two appends fired without awaiting between them — read-modify-write
      // race would normally cause the second read to miss the first write.
      const now = Date.now();
      const p1 = appendReplay(7, [ev(META, now)]);
      const p2 = appendReplay(7, [ev(FULL_SNAPSHOT, now + 1)]);
      await Promise.all([p1, p2]);
      const out = await getReplay(7);
      expect(out.map((e) => e.type)).toEqual([META, FULL_SNAPSHOT]);
    });

    it('getReplay waits for a pending append before reading (no stale reads)', async () => {
      // Mirrors the submit-path flow in content-main.ts: a fire-and-forget
      // append followed immediately by a read. Without queueing the read,
      // chrome.storage.session.set hasn't run yet when get() executes.
      const now = Date.now();
      const appendPromise = appendReplay(7, [ev(FULL_SNAPSHOT, now)]);
      const readPromise = getReplay(7); // fired before append resolves
      const [, events] = await Promise.all([appendPromise, readPromise]);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(FULL_SNAPSHOT);
    });

    it('writeQueues releases the per-tab entry once its chain settles', async () => {
      expect(__testing.writeQueues.size).toBe(0);
      await appendReplay(7, [ev(FULL_SNAPSHOT, Date.now())]);
      await clearReplay(7);
      // Flush microtasks so the .finally() cleanup callback runs
      await new Promise((r) => setTimeout(r, 0));
      expect(__testing.writeQueues.has(7)).toBe(false);
    });

    it('writeQueues keeps the entry while ops for that tab are still pending', async () => {
      const now = Date.now();
      // Don't await — chain should still be in the map mid-flight
      const p = appendReplay(7, [ev(FULL_SNAPSHOT, now)]);
      expect(__testing.writeQueues.has(7)).toBe(true);
      await p;
      await new Promise((r) => setTimeout(r, 0));
      expect(__testing.writeQueues.has(7)).toBe(false);
    });

    it('halves the buffer and retries when storage quota is exceeded', async () => {
      const now = Date.now();
      const events = Array.from({ length: 4 }, (_, i) => ev(INCREMENTAL, now + i));
      // Throw QuotaExceededError on the first set, succeed on the retry
      mockChrome.storage.session.set
        .mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'))
        .mockResolvedValueOnce(undefined);
      await appendReplay(7, events);
      expect(mockChrome.storage.session.set).toHaveBeenCalledTimes(2);
      const retryArgs = mockChrome.storage.session.set.mock.calls[1][0];
      const stored = retryArgs['bs_replay_7'] as ReplayEvent[];
      expect(stored.length).toBeLessThan(events.length);
    });

    it('quota recovery preserves the latest FullSnapshot + preceding Meta', async () => {
      // Buffer shape: [old incrementals…, Meta, FullSnapshot, new incrementals…]
      // A naive slice from the middle would drop the FullSnapshot and leave
      // rrweb-player with orphan incrementals.
      const now = Date.now();
      const events: ReplayEvent[] = [
        ...Array.from({ length: 5 }, (_, i) => ev(INCREMENTAL, now + i)),
        ev(META, now + 100),
        ev(FULL_SNAPSHOT, now + 101),
        ...Array.from({ length: 5 }, (_, i) => ev(INCREMENTAL, now + 200 + i)),
      ];
      mockChrome.storage.session.set
        .mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'))
        .mockResolvedValueOnce(undefined);
      await appendReplay(7, events);
      const retryArgs = mockChrome.storage.session.set.mock.calls[1][0];
      const stored = retryArgs['bs_replay_7'] as ReplayEvent[];
      // The Meta+FullSnap pair must survive
      expect(stored[0].type).toBe(META);
      expect(stored[1].type).toBe(FULL_SNAPSHOT);
      // And the leading orphan incrementals are gone
      expect(stored.every((e) => e.timestamp >= now + 100)).toBe(true);
    });

    it('quota recovery keeps the head when FullSnapshot is already at index 0', async () => {
      const now = Date.now();
      const events: ReplayEvent[] = [
        ev(FULL_SNAPSHOT, now),
        ...Array.from({ length: 6 }, (_, i) => ev(INCREMENTAL, now + 1 + i)),
      ];
      mockChrome.storage.session.set
        .mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'))
        .mockResolvedValueOnce(undefined);
      await appendReplay(7, events);
      const retryArgs = mockChrome.storage.session.set.mock.calls[1][0];
      const stored = retryArgs['bs_replay_7'] as ReplayEvent[];
      // FullSnap survives, trailing incrementals are halved
      expect(stored[0].type).toBe(FULL_SNAPSHOT);
      expect(stored.length).toBeLessThan(events.length);
    });
  });

  describe('resolveTabId', () => {
    function sender(tabId?: number): chrome.runtime.MessageSender {
      return tabId !== undefined ? { tab: { id: tabId } as chrome.tabs.Tab } : {};
    }

    it('returns sender.tab.id and ignores fallback when both are present', async () => {
      expect(await resolveTabId(sender(11), 99)).toBe(11);
      expect(mockChrome.tabs.query).not.toHaveBeenCalled();
    });

    it('falls back to message.tabId when sender has no tab', async () => {
      expect(await resolveTabId(sender(), 99)).toBe(99);
      expect(mockChrome.tabs.query).not.toHaveBeenCalled();
    });

    it('queries active tab in last-focused window when neither is provided', async () => {
      mockChrome.tabs.query.mockResolvedValueOnce([{ id: 55, url: 'https://x' }]);
      expect(await resolveTabId(sender())).toBe(55);
      expect(mockChrome.tabs.query).toHaveBeenCalledWith({
        active: true,
        lastFocusedWindow: true,
      });
    });

    it('returns undefined when the active-tab query yields no tabs', async () => {
      mockChrome.tabs.query.mockResolvedValueOnce([]);
      expect(await resolveTabId(sender())).toBeUndefined();
    });
  });

  describe('handleReplayMessage', () => {
    function sender(tabId?: number): chrome.runtime.MessageSender {
      return tabId !== undefined ? { tab: { id: tabId } as chrome.tabs.Tab } : {};
    }

    function awaitResponse(): { promise: Promise<unknown>; cb: (r: unknown) => void } {
      let resolve!: (r: unknown) => void;
      const promise = new Promise<unknown>((r) => (resolve = r));
      return { promise, cb: resolve };
    }

    it('returns false for unknown message types', () => {
      expect(handleReplayMessage({ type: 'SOMETHING_ELSE' }, sender(1), () => {})).toBe(false);
    });

    it('REPLAY_APPEND ignores message.tabId and writes to sender.tab', async () => {
      const now = Date.now();
      const { promise, cb } = awaitResponse();
      handleReplayMessage(
        // Forged tabId — must not be honored
        { type: 'REPLAY_APPEND', tabId: 999, events: [ev(FULL_SNAPSHOT, now)] },
        sender(7),
        cb,
      );
      await promise;
      expect(await getReplay(7)).toHaveLength(1);
      expect(await getReplay(999)).toEqual([]);
    });

    it('REPLAY_GET_ALL prefers sender.tab.id over message.tabId (security)', async () => {
      const now = Date.now();
      await appendReplay(7, [ev(FULL_SNAPSHOT, now)]);
      await appendReplay(999, [ev(INCREMENTAL, now)]);
      const { promise, cb } = awaitResponse();
      handleReplayMessage(
        { type: 'REPLAY_GET_ALL', tabId: 999 }, // forged
        sender(7), // real
        cb,
      );
      const resp = (await promise) as { events: ReplayEvent[] };
      expect(resp.events.map((e) => e.type)).toEqual([FULL_SNAPSHOT]);
    });

    it('REPLAY_GET_ALL from popup (no sender.tab) honors message.tabId', async () => {
      const now = Date.now();
      await appendReplay(7, [ev(FULL_SNAPSHOT, now)]);
      const { promise, cb } = awaitResponse();
      handleReplayMessage({ type: 'REPLAY_GET_ALL', tabId: 7 }, sender(), cb);
      const resp = (await promise) as { events: ReplayEvent[] };
      expect(resp.events).toHaveLength(1);
    });

    it('REPLAY_CLEAR prefers sender.tab.id over forged message.tabId', async () => {
      const now = Date.now();
      await appendReplay(7, [ev(FULL_SNAPSHOT, now)]);
      await appendReplay(999, [ev(FULL_SNAPSHOT, now)]);
      const { promise, cb } = awaitResponse();
      handleReplayMessage(
        { type: 'REPLAY_CLEAR', tabId: 999 }, // forged
        sender(7),
        cb,
      );
      await promise;
      expect(await getReplay(7)).toEqual([]);
      expect(await getReplay(999)).toHaveLength(1);
    });

    it('REPLAY_GET_ALL recovers from an internal failure by returning empty', async () => {
      mockChrome.storage.session.get.mockRejectedValueOnce(new Error('boom'));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { promise, cb } = awaitResponse();
      handleReplayMessage({ type: 'REPLAY_GET_ALL' }, sender(7), cb);
      const resp = await promise;
      expect(resp).toEqual({ events: [] });
      errSpy.mockRestore();
    });
  });
});
