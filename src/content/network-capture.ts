/**
 * Enhanced network capture with CircularBuffer, fetch+XHR dual interception,
 * URL filtering, body capture, and sanitization.
 * Ported from bugspotter-sdk/src/capture/network.ts
 */

import type { NetworkEntry } from '@/types';
import { CircularBuffer } from '@bugspotter/common';
import type { Sanitizer } from '@bugspotter/common';

declare global {
  interface XMLHttpRequest {
    _bugspotter?: { method: string; url: string; start: number; errored?: boolean };
  }
}

const MAX_BODY_LENGTH = 2048;

let buffer: CircularBuffer<NetworkEntry>;
let sanitizer: Sanitizer | null = null;
let filterUrl: ((url: string) => boolean) | null = null;

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...[truncated]' : str;
}

function sanitizeEntry(entry: NetworkEntry): NetworkEntry {
  if (!sanitizer) return entry;
  return sanitizer.sanitize(entry) as NetworkEntry;
}

function addEntry(raw: NetworkEntry) {
  const entry = sanitizeEntry(raw);

  // If filter set, only capture matching URLs (allowlist) unless they errored
  if (filterUrl) {
    const shouldCapture = filterUrl(entry.url);
    const isError = entry.status < 200 || entry.status >= 300;
    if (!shouldCapture && !isError) return;
  }

  buffer.add(entry);

  chrome.runtime.sendMessage({ type: 'NETWORK_ENTRY', data: entry }).catch(() => {
    // Extension context may be invalidated
  });
}

function initPerformanceObserver() {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const resource = entry as PerformanceResourceTiming;
      addEntry({
        url: resource.name,
        method: 'GET',
        status: 0,
        statusText: '',
        duration: Math.round(resource.duration),
        timestamp: Math.round(performance.timeOrigin + resource.startTime),
        headers: {},
      });
    }
  });
  observer.observe({ entryTypes: ['resource'] });
}

function interceptFetch() {
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const start = Date.now();

    // Capture request body
    let requestBody: string | undefined;
    if (init?.body) {
      try {
        requestBody = truncate(
          typeof init.body === 'string' ? init.body : JSON.stringify(init.body),
          MAX_BODY_LENGTH,
        );
      } catch {
        // Can't serialize body
      }
    }

    try {
      const response = await originalFetch(input, init);
      addEntry({
        url,
        method,
        status: response.status,
        statusText: response.statusText,
        duration: Date.now() - start,
        timestamp: start,
        headers: {},
        requestBody,
      });
      return response;
    } catch (error) {
      addEntry({
        url,
        method,
        status: 0,
        statusText: 'Network Error',
        duration: Date.now() - start,
        timestamp: start,
        headers: {},
        requestBody,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

function interceptXHR() {
  const OriginalXHR = window.XMLHttpRequest;
  const originalOpen = OriginalXHR.prototype.open;
  const originalSend = OriginalXHR.prototype.send;

  OriginalXHR.prototype.open = function (method: string, url: string | URL) {
    this._bugspotter = { method: method.toUpperCase(), url: String(url), start: 0 };
    // eslint-disable-next-line prefer-rest-params
    return originalOpen.apply(this, arguments as unknown as Parameters<typeof originalOpen>);
  };

  OriginalXHR.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    if (this._bugspotter) {
      this._bugspotter.start = Date.now();
    }

    // Capture request body
    let requestBody: string | undefined;
    if (body) {
      try {
        requestBody = truncate(typeof body === 'string' ? body : String(body), MAX_BODY_LENGTH);
      } catch {
        // Can't serialize body
      }
    }

    this.addEventListener('error', () => {
      if (this._bugspotter) {
        this._bugspotter.errored = true;
        addEntry({
          url: this._bugspotter.url,
          method: this._bugspotter.method,
          status: 0,
          statusText: '',
          duration: Date.now() - this._bugspotter.start,
          timestamp: this._bugspotter.start,
          headers: {},
          requestBody,
          error: 'XMLHttpRequest failed',
        });
      }
    });

    this.addEventListener('loadend', () => {
      if (this._bugspotter && !this._bugspotter.errored) {
        addEntry({
          url: this._bugspotter.url,
          method: this._bugspotter.method,
          status: this.status,
          statusText: this.statusText,
          duration: Date.now() - this._bugspotter.start,
          timestamp: this._bugspotter.start,
          headers: {},
          requestBody,
        });
      }
    });

    // eslint-disable-next-line prefer-rest-params
    return originalSend.apply(this, arguments as unknown as Parameters<typeof originalSend>);
  };
}

export function initNetworkCapture(
  maxEntries = 50,
  sanitizerInstance?: Sanitizer,
  urlFilter?: (url: string) => boolean,
) {
  buffer = new CircularBuffer<NetworkEntry>(maxEntries);
  sanitizer = sanitizerInstance ?? null;
  filterUrl = urlFilter ?? null;

  initPerformanceObserver();
  interceptFetch();
  interceptXHR();
}

export function getNetworkRequests(): NetworkEntry[] {
  return buffer.getAll();
}
