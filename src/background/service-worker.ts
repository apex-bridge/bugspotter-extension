import type { ConsoleEntry, NetworkEntry, BugReportPayload } from '@/types';
import { createReport, uploadScreenshot, confirmUpload } from '@/api/bugspotter-client';

// In-memory store for capture data from content scripts
const captureStore: Record<number, { console: ConsoleEntry[]; network: NetworkEntry[] }> = {};

function getTabStore(tabId: number) {
  if (!captureStore[tabId]) {
    captureStore[tabId] = { console: [], network: [] };
  }
  return captureStore[tabId];
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === 'CONSOLE_ENTRY' && tabId) {
    const store = getTabStore(tabId);
    if (store.console.length >= 50) store.console.shift();
    store.console.push(message.data);
    return false;
  }

  if (message.type === 'NETWORK_ENTRY' && tabId) {
    const store = getTabStore(tabId);
    if (store.network.length >= 50) store.network.shift();
    store.network.push(message.data);
    return false;
  }

  if (message.type === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab({ format: 'png' }).then((dataUrl) => {
      sendResponse({ type: 'SCREENSHOT_CAPTURED', data: dataUrl });
    }).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_CAPTURE_DATA') {
    const activeTabId = message.tabId as number;
    const store = captureStore[activeTabId] ?? { console: [], network: [] };
    sendResponse({ type: 'CAPTURE_DATA', data: store });
    return false;
  }

  if (message.type === 'SUBMIT_REPORT') {
    handleSubmit(message.data).then((result) => {
      sendResponse({ success: true, data: result });
    }).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  return false;
});

async function handleSubmit(data: BugReportPayload & { screenshotDataUrl: string }) {
  const { screenshotDataUrl, ...payload } = data;

  // Step 1: Create report
  const result = await createReport(payload);

  // Step 2: Upload screenshot if present
  if (screenshotDataUrl && result.data.presignedUrls?.screenshot) {
    const blob = await dataUrlToBlob(screenshotDataUrl);
    await uploadScreenshot(result.data.presignedUrls.screenshot.uploadUrl, blob);

    // Step 3: Confirm upload
    await confirmUpload(result.data.id);
  }

  return result.data;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

// Clean up tab data when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete captureStore[tabId];
});

// Set badge
chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
