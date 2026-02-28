import type { BugReportPayload } from '@/types';
import {
  createReport,
  uploadScreenshot,
  uploadReplay,
  confirmUpload,
} from '@/api/bugspotter-client';
import { BugReportDeduplicator } from '@bugspotter/common';
import { OfflineQueue } from '@/utils/offline-queue';
import { getSettings } from '@/storage/settings';
import { gzipCompress } from '@/utils/compress';

const deduplicator = new BugReportDeduplicator();
const offlineQueue = new OfflineQueue({ enabled: true, maxQueueSize: 10 });

// Store annotated screenshot so it survives popup close/reopen
let pendingAnnotatedScreenshot: string | null = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CAPTURE_SCREENSHOT') {
    chrome.tabs
      .captureVisibleTab({ format: 'png' })
      .then((dataUrl) => {
        sendResponse({ type: 'SCREENSHOT_CAPTURED', data: dataUrl });
      })
      .catch((err) => {
        sendResponse({ error: err.message });
      });
    return true;
  }

  // Store annotated screenshot so it persists after popup closes during annotation
  if (message.type === 'ANNOTATION_DONE' && message.data) {
    pendingAnnotatedScreenshot = message.data as string;
    return false;
  }

  // Popup asks if there's a pending annotated screenshot (after reopening)
  if (message.type === 'GET_PENDING_SCREENSHOT') {
    const data = pendingAnnotatedScreenshot;
    pendingAnnotatedScreenshot = null;
    sendResponse({ data });
    return false;
  }

  if (message.type === 'GET_OFFLINE_QUEUE_SIZE') {
    offlineQueue.size().then((size) => sendResponse({ size }));
    return true;
  }

  if (message.type === 'SUBMIT_REPORT') {
    handleSubmit(message.data)
      .then((result) => {
        sendResponse({ success: true, data: result });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  return false;
});

async function handleSubmit(
  data: BugReportPayload & { screenshotDataUrl: string; replayEvents?: unknown[] },
) {
  const { screenshotDataUrl, replayEvents, ...payload } = data;

  // Deduplication check
  if (deduplicator.isDuplicate(payload.title, payload.description)) {
    throw new Error('Duplicate report detected. Please wait before resubmitting.');
  }

  deduplicator.markInProgress(payload.title, payload.description);

  try {
    // Step 1: Create report (retry is handled inside the API client)
    const result = await createReport(payload);

    // Step 2: Upload screenshot if present
    // Note: compressImage requires DOM APIs (canvas, Image) unavailable in MV3
    // service workers. Screenshot is uploaded as the original PNG from captureVisibleTab.
    if (screenshotDataUrl && result.data.presignedUrls?.screenshot) {
      const blob = await dataUrlToBlob(screenshotDataUrl);
      await uploadScreenshot(result.data.presignedUrls.screenshot.uploadUrl, blob);
      await confirmUpload(result.data.id, 'screenshot');
    }

    // Step 3: Upload replay if present
    if (replayEvents && replayEvents.length > 0 && result.data.presignedUrls?.replay) {
      const replayJson = JSON.stringify(replayEvents);
      const compressed = await gzipCompress(replayJson);
      await uploadReplay(result.data.presignedUrls.replay.uploadUrl, compressed);
      await confirmUpload(result.data.id, 'replay');
    }

    deduplicator.markComplete(payload.title, payload.description);
    return result.data;
  } catch (err) {
    deduplicator.markComplete(payload.title, payload.description);

    // Queue for offline retry on network errors.
    // We don't persist screenshot/replay data in the queue, so clear those
    // flags to prevent the server from expecting uploads that won't arrive.
    if (isNetworkError(err)) {
      const settings = await getSettings();
      const offlinePayload = { ...payload, hasScreenshot: false, hasReplay: false };
      await offlineQueue.enqueue(
        `${settings.baseUrl.replace(/\/$/, '')}/api/v1/reports`,
        JSON.stringify(offlinePayload),
        { 'Content-Type': 'application/json', 'X-API-Key': settings.apiKey },
      );
    }

    throw err;
  }
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('connection')
  );
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

// Process offline queue on service worker startup
async function processOfflineQueue() {
  const settings = await getSettings();
  if (!settings.baseUrl || !settings.apiKey) return;
  const authHeaders = { 'X-API-Key': settings.apiKey };
  await offlineQueue.processQueue(authHeaders);
}

// Process queue on service worker activation
processOfflineQueue().catch(() => {});

// Set badge
chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
