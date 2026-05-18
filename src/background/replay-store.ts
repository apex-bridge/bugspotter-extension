/**
 * Cross-navigation replay store.
 *
 * Streams rrweb events from per-tab content scripts into `chrome.storage.session`
 * so a single replay can span multiple page loads within a tab. The session area
 * lasts for the browser session and is never synced to disk — safe for transient
 * recording data.
 *
 * Writes are queued per-tab to avoid concurrent read-modify-write races on the
 * same key. Different tabs proceed in parallel.
 */

import type { ReplayEvent } from '@bugspotter/common';

const KEY_PREFIX = 'bs_replay_';
const DEFAULT_WINDOW_SECONDS = 180;
const FULL_SNAPSHOT_TYPE = 2;
const META_TYPE = 4;

function keyFor(tabId: number): string {
  return `${KEY_PREFIX}${tabId}`;
}

function pruneEvents(events: ReplayEvent[], windowSeconds: number): ReplayEvent[] {
  if (events.length === 0) return events;

  const cutoff = Date.now() - windowSeconds * 1000;

  // Find first event within the cutoff window
  let firstValidIndex = events.length;
  for (let i = 0; i < events.length; i++) {
    if (events[i].timestamp >= cutoff) {
      firstValidIndex = i;
      break;
    }
  }

  // Protect the most recent FullSnapshot (and its preceding Meta, if any) so
  // rrweb-player always has an anchor point even when the snapshot is older
  // than the window cutoff.
  let lastFullSnapIndex = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === FULL_SNAPSHOT_TYPE) {
      lastFullSnapIndex = i;
      break;
    }
  }
  if (lastFullSnapIndex >= 0 && lastFullSnapIndex < firstValidIndex) {
    const protectedStart =
      lastFullSnapIndex > 0 && events[lastFullSnapIndex - 1].type === META_TYPE
        ? lastFullSnapIndex - 1
        : lastFullSnapIndex;
    firstValidIndex = protectedStart;
  }

  return firstValidIndex === 0 ? events : events.slice(firstValidIndex);
}

// Per-tab promise chain for serializing writes. Different tabIds proceed in
// parallel; same tabId queues sequentially. Reset on SW eviction — acceptable
// because each message handler awaits its enqueued op before responding.
const writeQueues = new Map<number, Promise<unknown>>();

function enqueue<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
  const prev = (writeQueues.get(tabId) ?? Promise.resolve()) as Promise<unknown>;
  const next = prev.then(fn, fn);
  writeQueues.set(
    tabId,
    next.catch(() => {}),
  );
  return next as Promise<T>;
}

export async function getReplay(tabId: number): Promise<ReplayEvent[]> {
  const key = keyFor(tabId);
  const stored = await chrome.storage.session.get(key);
  const events = (stored[key] as ReplayEvent[] | undefined) ?? [];
  return events;
}

export async function appendReplay(tabId: number, events: ReplayEvent[]): Promise<void> {
  if (events.length === 0) return;
  await enqueue(tabId, async () => {
    const key = keyFor(tabId);
    const stored = await chrome.storage.session.get(key);
    const existing = (stored[key] as ReplayEvent[] | undefined) ?? [];
    const merged = existing.concat(events);
    const pruned = pruneEvents(merged, DEFAULT_WINDOW_SECONDS);
    try {
      await chrome.storage.session.set({ [key]: pruned });
    } catch (err) {
      // Quota exceeded — drop the oldest half and retry once. rrweb FullSnapshot
      // can be hundreds of KB on heavy pages; storage.session has a ~10MB cap.
      console.warn('[BugSpotter] replay storage write failed, halving buffer:', err);
      const halved = pruned.slice(Math.floor(pruned.length / 2));
      const reduced = pruneEvents(halved, DEFAULT_WINDOW_SECONDS);
      await chrome.storage.session.set({ [key]: reduced }).catch(() => {});
    }
  });
}

export async function clearReplay(tabId: number): Promise<void> {
  await enqueue(tabId, async () => {
    await chrome.storage.session.remove(keyFor(tabId));
  });
}

export async function clearAllReplays(): Promise<void> {
  const all = await chrome.storage.session.get(null);
  const keysToRemove = Object.keys(all).filter((k) => k.startsWith(KEY_PREFIX));
  if (keysToRemove.length > 0) {
    await chrome.storage.session.remove(keysToRemove);
  }
}
