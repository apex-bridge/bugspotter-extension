/**
 * Shared tabId resolution for message handlers in the service worker.
 *
 * Security: `sender.tab.id` is set by the browser and can't be forged by a
 * content script — it always wins. An explicit `fallback` from the message is
 * only honored when `sender.tab` is absent (i.e. the message came from an
 * internal context like the popup or options page). The last-resort
 * active-tab query uses `lastFocusedWindow: true` because `currentWindow: true`
 * is undefined from an MV3 service worker.
 */
export function resolveTabId(
  sender: chrome.runtime.MessageSender,
  fallback?: number,
): Promise<number | undefined> {
  if (sender.tab?.id !== undefined) return Promise.resolve(sender.tab.id);
  if (typeof fallback === 'number') return Promise.resolve(fallback);
  return chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => tabs[0]?.id);
}
