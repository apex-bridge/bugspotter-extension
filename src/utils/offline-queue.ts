/**
 * Offline queue for storing failed requests using chrome.storage.local.
 * Ported from bugspotter-sdk/src/core/offline-queue.ts
 * Adapted for Chrome extension context (chrome.storage.local instead of localStorage).
 */

import { isSecureEndpoint } from '@bugspotter/common';

const QUEUE_KEY = 'bugspotter_offline_queue';
const QUEUE_EXPIRY_DAYS = 7;
const MAX_RETRY_ATTEMPTS = 5;
const MAX_ITEM_SIZE_BYTES = 100 * 1024; // 100KB

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'cookie',
  'set-cookie',
]);

interface QueuedRequest {
  id: string;
  endpoint: string;
  body: string;
  headers: Record<string, string>;
  timestamp: number;
  attempts: number;
}

export interface OfflineQueueConfig {
  enabled: boolean;
  maxQueueSize: number;
}

const DEFAULT_CONFIG: OfflineQueueConfig = {
  enabled: false,
  maxQueueSize: 10,
};

function stripSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !SENSITIVE_HEADERS.has(key.toLowerCase())),
  );
}

function generateId(): string {
  const arr = new Uint32Array(2);
  crypto.getRandomValues(arr);
  return `req_${Date.now()}_${Array.from(arr, (n) => n.toString(36)).join('')}`;
}

async function getQueue(): Promise<QueuedRequest[]> {
  try {
    const result = await chrome.storage.local.get(QUEUE_KEY);
    return result[QUEUE_KEY] ?? [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedRequest[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
  } catch (error) {
    // Handle quota exceeded — trim oldest 50% and retry
    if (isQuotaExceededError(error)) {
      const trimmed = queue.slice(Math.floor(queue.length / 2));
      try {
        await chrome.storage.local.set({ [QUEUE_KEY]: trimmed });
      } catch {
        // Still failing — clear everything
        await chrome.storage.local.remove(QUEUE_KEY);
      }
    } else {
      // Non-quota error: log so callers are aware persistence failed
      console.error('[BugSpotter] Failed to persist offline queue:', error);
      throw error;
    }
  }
}

function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes('quota') || msg.includes('storage') || msg.includes('exceeded');
}

export class OfflineQueue {
  private config: OfflineQueueConfig;

  constructor(config: Partial<OfflineQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async enqueue(endpoint: string, body: string, headers: Record<string, string>): Promise<void> {
    if (!this.config.enabled) return;

    // Validate size
    if (new Blob([body]).size > MAX_ITEM_SIZE_BYTES) return;

    const queue = await getQueue();

    if (queue.length >= this.config.maxQueueSize) {
      queue.shift(); // Remove oldest
    }

    queue.push({
      id: generateId(),
      endpoint,
      body,
      headers: stripSensitiveHeaders(headers),
      timestamp: Date.now(),
      attempts: 0,
    });

    await saveQueue(queue);
  }

  async processQueue(
    authHeaders: Record<string, string>,
    retryableStatusCodes: number[] = [502, 503, 504, 429],
  ): Promise<number> {
    if (!this.config.enabled) return 0;

    const queue = await getQueue();
    if (queue.length === 0) return 0;

    const maxAge = QUEUE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const remaining: QueuedRequest[] = [];
    let successCount = 0;

    for (const request of queue) {
      // Skip expired
      if (Date.now() - request.timestamp > maxAge) continue;
      // Skip max-retried
      if (request.attempts >= MAX_RETRY_ATTEMPTS) continue;

      // HTTPS enforcement — refuse to send to insecure endpoints
      if (!isSecureEndpoint(request.endpoint)) continue;

      try {
        // Merge auth headers at processing time (security: fresh headers override stored)
        const headers = { ...request.headers, ...authHeaders };
        const response = await fetch(request.endpoint, {
          method: 'POST',
          headers,
          body: request.body,
        });

        if (response.ok) {
          successCount++;
        } else if (retryableStatusCodes.includes(response.status)) {
          request.attempts++;
          remaining.push(request);
        }
        // Non-retryable errors are silently dropped
      } catch {
        // Network error — keep for next retry
        request.attempts++;
        remaining.push(request);
      }
    }

    await saveQueue(remaining);
    return successCount;
  }

  async size(): Promise<number> {
    const queue = await getQueue();
    return queue.length;
  }

  async clear(): Promise<void> {
    await chrome.storage.local.remove(QUEUE_KEY);
  }
}
