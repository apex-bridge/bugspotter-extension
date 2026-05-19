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

export function pruneEvents(events: ReplayEvent[], windowSeconds: number): ReplayEvent[] {
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

// Per-tab promise chain for serializing reads and writes. Different tabIds
// proceed in parallel; same tabId queues sequentially so a getReplay can't
// observe state from before a still-pending appendReplay. Reset on SW
// eviction — acceptable because each message handler awaits its enqueued op
// before responding. Entries are removed when their chain settles, so the
// Map can't accumulate over long browser sessions.
const writeQueues = new Map<number, Promise<unknown>>();

function enqueue<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
  const prev = (writeQueues.get(tabId) ?? Promise.resolve()) as Promise<unknown>;
  const next = prev.then(fn, fn);
  const handle = next
    .catch(() => {})
    .finally(() => {
      // Only delete if no newer enqueue has replaced us — otherwise we'd
      // orphan a still-active chain.
      if (writeQueues.get(tabId) === handle) {
        writeQueues.delete(tabId);
      }
    });
  writeQueues.set(tabId, handle);
  return next as Promise<T>;
}

export async function getReplay(tabId: number): Promise<ReplayEvent[]> {
  return enqueue(tabId, async () => {
    const key = keyFor(tabId);
    const stored = await chrome.storage.session.get(key);
    return (stored[key] as ReplayEvent[] | undefined) ?? [];
  });
}

// Test-only escape hatch: lets tests assert that the writeQueues Map cleans
// itself up after settling. Not part of the public API.
export const __testing = { writeQueues };

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
      // Quota exceeded — recover by dropping events while preserving the
      // anchor (latest FullSnapshot + preceding Meta). A blind slice from the
      // middle would orphan incrementals and make the replay unplayable.
      console.warn('[BugSpotter] replay storage write failed, recovering:', err);
      const reduced = halveAroundSnapshot(pruned);
      await chrome.storage.session.set({ [key]: reduced }).catch(() => {});
    }
  });
}

function halveAroundSnapshot(events: ReplayEvent[]): ReplayEvent[] {
  if (events.length === 0) return events;
  let lastSnapIndex = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === FULL_SNAPSHOT_TYPE) {
      lastSnapIndex = i;
      break;
    }
  }
  // No anchor — replay is already unplayable; just halve to free space.
  if (lastSnapIndex < 0) {
    return events.slice(Math.floor(events.length / 2));
  }
  const protectedStart =
    lastSnapIndex > 0 && events[lastSnapIndex - 1].type === META_TYPE
      ? lastSnapIndex - 1
      : lastSnapIndex;
  // Snapshot mid-buffer: drop everything older than the anchor.
  if (protectedStart > 0) {
    return events.slice(protectedStart);
  }
  // Snapshot already at the head: keep it + halve the trailing incrementals.
  const headLen = lastSnapIndex + 1;
  const tail = events.slice(headLen);
  return events.slice(0, headLen).concat(tail.slice(Math.floor(tail.length / 2)));
}

export async function clearReplay(tabId: number): Promise<void> {
  await enqueue(tabId, async () => {
    await chrome.storage.session.remove(keyFor(tabId));
  });
}

/**
 * Resolve which tab a replay message targets.
 *
 * Sender precedence is critical for security: a content script can forge
 * `message.tabId`, but never `sender.tab.id` (the browser sets that). So when
 * the message arrives from a tab, that tab's id always wins. Only messages
 * from internal contexts (popup, options) — where `sender.tab` is undefined —
 * may pass an explicit `fallback`. The last-resort active-tab query uses
 * `lastFocusedWindow: true` because `currentWindow: true` is undefined in MV3
 * service workers.
 */
export function resolveTabId(
  sender: chrome.runtime.MessageSender,
  fallback?: number,
): Promise<number | undefined> {
  if (sender.tab?.id !== undefined) return Promise.resolve(sender.tab.id);
  if (typeof fallback === 'number') return Promise.resolve(fallback);
  return chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => tabs[0]?.id);
}

interface ReplayMessage {
  type: string;
  tabId?: number;
  events?: ReplayEvent[];
}

/**
 * Route REPLAY_* messages to the store. Returns true if the message was a
 * replay message (so the listener should `return true` to keep the response
 * channel open for the async sendResponse). Returns false if the message
 * isn't ours, so the caller can fall through to other handlers.
 */
export function handleReplayMessage(
  message: ReplayMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean {
  switch (message?.type) {
    case 'REPLAY_APPEND': {
      const tabId = sender.tab?.id;
      if (typeof tabId !== 'number') {
        sendResponse({ ok: false });
        return true;
      }
      const events = message.events ?? [];
      appendReplay(tabId, events)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => {
          console.error('[BugSpotter] REPLAY_APPEND failed:', err);
          sendResponse({ ok: false });
        });
      return true;
    }

    case 'REPLAY_GET_ALL': {
      resolveTabId(sender, message.tabId)
        .then(async (tabId) => {
          if (typeof tabId !== 'number') {
            sendResponse({ events: [] });
            return;
          }
          const events = await getReplay(tabId);
          sendResponse({ events });
        })
        .catch((err) => {
          console.error('[BugSpotter] REPLAY_GET_ALL failed:', err);
          sendResponse({ events: [] });
        });
      return true;
    }

    case 'REPLAY_CLEAR': {
      resolveTabId(sender, message.tabId)
        .then(async (tabId) => {
          if (typeof tabId !== 'number') {
            sendResponse({ ok: false });
            return;
          }
          await clearReplay(tabId);
          sendResponse({ ok: true });
        })
        .catch((err) => {
          console.error('[BugSpotter] REPLAY_CLEAR failed:', err);
          sendResponse({ ok: false });
        });
      return true;
    }

    default:
      return false;
  }
}
