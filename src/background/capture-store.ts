/**
 * Cross-navigation capture store for console + network entries.
 *
 * Mirrors `replay-store.ts` for rrweb events: each content-script instance
 * streams batched ConsoleEntry / NetworkEntry items to the SW, which keys
 * them per (tabId, channel) in `chrome.storage.session`. A full-page
 * navigation no longer drops the logs — the fresh content script appends
 * to the same buffer, and the popup pulls the combined per-tab data
 * during bug-report submission.
 *
 * Prune is count-based (`maxEntries` set by the user in Settings),
 * unlike the replay store's time-based 180s window.
 */

import type { ConsoleEntry, NetworkEntry } from '@/types';
import { resolveTabId } from './resolve-tab-id';

const CONSOLE_KEY_PREFIX = 'bs_console_';
const NETWORK_KEY_PREFIX = 'bs_network_';

type Channel = 'console' | 'network';

function keyFor(tabId: number, channel: Channel): string {
  return `${channel === 'console' ? CONSOLE_KEY_PREFIX : NETWORK_KEY_PREFIX}${tabId}`;
}

// Per-(tab, channel) serial queue to prevent concurrent read-modify-write
// races on the same storage key. Console and network for the same tab run
// in parallel; different tabs always run in parallel.
const writeQueues = new Map<string, Promise<unknown>>();

function queueKey(tabId: number, channel: Channel): string {
  return `${tabId}_${channel}`;
}

function enqueue<T>(tabId: number, channel: Channel, fn: () => Promise<T>): Promise<T> {
  const qk = queueKey(tabId, channel);
  const prev = (writeQueues.get(qk) ?? Promise.resolve()) as Promise<unknown>;
  const next = prev.then(fn, fn);
  const handle = next
    .catch(() => {})
    .finally(() => {
      if (writeQueues.get(qk) === handle) {
        writeQueues.delete(qk);
      }
    });
  writeQueues.set(qk, handle);
  return next as Promise<T>;
}

async function appendEntries<T>(
  tabId: number,
  channel: Channel,
  entries: T[],
  maxEntries: number,
): Promise<void> {
  if (entries.length === 0) return;
  await enqueue(tabId, channel, async () => {
    const key = keyFor(tabId, channel);
    const stored = await chrome.storage.session.get(key);
    const existing = (stored[key] as T[] | undefined) ?? [];
    const merged = existing.concat(entries);
    // Count-based prune — keep the most recent maxEntries.
    const pruned = merged.length > maxEntries ? merged.slice(merged.length - maxEntries) : merged;
    try {
      await chrome.storage.session.set({ [key]: pruned });
    } catch (err) {
      // Quota exceeded — halve the buffer and retry once. Console / network
      // entries have no anchor to preserve (unlike rrweb FullSnapshot), so
      // a simple "drop oldest half" is fine; we always retain at least
      // one entry when the buffer was non-empty.
      console.warn('[BugSpotter] capture storage write failed, recovering:', err);
      if (pruned.length === 0) return;
      const halved = pruned.slice(Math.max(1, Math.floor(pruned.length / 2)));
      await chrome.storage.session.set({ [key]: halved }).catch(() => {});
    }
  });
}

export async function appendConsole(
  tabId: number,
  entries: ConsoleEntry[],
  maxEntries: number,
): Promise<void> {
  return appendEntries(tabId, 'console', entries, maxEntries);
}

export async function appendNetwork(
  tabId: number,
  entries: NetworkEntry[],
  maxEntries: number,
): Promise<void> {
  return appendEntries(tabId, 'network', entries, maxEntries);
}

export async function getConsole(tabId: number): Promise<ConsoleEntry[]> {
  return enqueue(tabId, 'console', async () => {
    const key = keyFor(tabId, 'console');
    const stored = await chrome.storage.session.get(key);
    return (stored[key] as ConsoleEntry[] | undefined) ?? [];
  });
}

export async function getNetwork(tabId: number): Promise<NetworkEntry[]> {
  return enqueue(tabId, 'network', async () => {
    const key = keyFor(tabId, 'network');
    const stored = await chrome.storage.session.get(key);
    return (stored[key] as NetworkEntry[] | undefined) ?? [];
  });
}

export async function clearCapture(tabId: number): Promise<void> {
  await Promise.all([
    enqueue(tabId, 'console', async () => {
      await chrome.storage.session.remove(keyFor(tabId, 'console'));
    }),
    enqueue(tabId, 'network', async () => {
      await chrome.storage.session.remove(keyFor(tabId, 'network'));
    }),
  ]);
}

interface CaptureMessage {
  type: string;
  tabId?: number;
  entries?: ConsoleEntry[] | NetworkEntry[];
  maxEntries?: number;
}

/**
 * Route CAPTURE_* messages to the store. Returns true if the message was a
 * capture message (so the listener should `return true` to keep the response
 * channel open). Returns false if the message isn't ours.
 *
 * For tabId resolution: PRELOAD/APPEND only honor sender.tab.id (browser-
 * verified, can't be forged by a content script). GET/CLEAR honor an
 * explicit tabId from internal contexts (popup) only when sender.tab is
 * absent — same security model as replay-store.
 */
export function handleCaptureMessage(
  message: CaptureMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean {
  switch (message?.type) {
    case 'CAPTURE_APPEND_CONSOLE': {
      const tabId = sender.tab?.id;
      const max = typeof message.maxEntries === 'number' ? message.maxEntries : 300;
      if (typeof tabId !== 'number') {
        sendResponse({ ok: false });
        return true;
      }
      appendConsole(tabId, (message.entries as ConsoleEntry[]) ?? [], max)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => {
          console.error('[BugSpotter] CAPTURE_APPEND_CONSOLE failed:', err);
          sendResponse({ ok: false });
        });
      return true;
    }

    case 'CAPTURE_APPEND_NETWORK': {
      const tabId = sender.tab?.id;
      const max = typeof message.maxEntries === 'number' ? message.maxEntries : 150;
      if (typeof tabId !== 'number') {
        sendResponse({ ok: false });
        return true;
      }
      appendNetwork(tabId, (message.entries as NetworkEntry[]) ?? [], max)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => {
          console.error('[BugSpotter] CAPTURE_APPEND_NETWORK failed:', err);
          sendResponse({ ok: false });
        });
      return true;
    }

    case 'CAPTURE_GET_ALL': {
      resolveTabId(sender, message.tabId)
        .then(async (tabId) => {
          if (typeof tabId !== 'number') {
            sendResponse({ console: [], network: [] });
            return;
          }
          const [c, n] = await Promise.all([getConsole(tabId), getNetwork(tabId)]);
          sendResponse({ console: c, network: n });
        })
        .catch((err) => {
          console.error('[BugSpotter] CAPTURE_GET_ALL failed:', err);
          sendResponse({ console: [], network: [] });
        });
      return true;
    }

    case 'CAPTURE_CLEAR': {
      resolveTabId(sender, message.tabId)
        .then(async (tabId) => {
          if (typeof tabId !== 'number') {
            sendResponse({ ok: false });
            return;
          }
          await clearCapture(tabId);
          sendResponse({ ok: true });
        })
        .catch((err) => {
          console.error('[BugSpotter] CAPTURE_CLEAR failed:', err);
          sendResponse({ ok: false });
        });
      return true;
    }

    default:
      return false;
  }
}

export const __testing = { writeQueues };
