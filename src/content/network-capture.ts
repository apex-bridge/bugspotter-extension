import type { NetworkEntry } from '@/types';

declare global {
  interface XMLHttpRequest {
    _bugspotter?: { method: string; url: string; start: number };
  }
}

const MAX_ENTRIES = 50;
const buffer: NetworkEntry[] = [];

function addEntry(entry: NetworkEntry) {
  if (buffer.length >= MAX_ENTRIES) {
    buffer.shift();
  }
  buffer.push(entry);

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
    const method = init?.method ?? 'GET';
    const start = Date.now();

    try {
      const response = await originalFetch(input, init);
      addEntry({
        url,
        method: method.toUpperCase(),
        status: response.status,
        statusText: response.statusText,
        duration: Date.now() - start,
        timestamp: start,
        headers: {},
      });
      return response;
    } catch (error) {
      addEntry({
        url,
        method: method.toUpperCase(),
        status: 0,
        statusText: 'Network Error',
        duration: Date.now() - start,
        timestamp: start,
        headers: {},
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

  OriginalXHR.prototype.send = function () {
    if (this._bugspotter) {
      this._bugspotter.start = Date.now();
    }
    this.addEventListener('loadend', () => {
      if (this._bugspotter) {
        addEntry({
          url: this._bugspotter.url,
          method: this._bugspotter.method,
          status: this.status,
          statusText: this.statusText,
          duration: Date.now() - this._bugspotter.start,
          timestamp: this._bugspotter.start,
          headers: {},
        });
      }
    });
    // eslint-disable-next-line prefer-rest-params
    return originalSend.apply(this, arguments as unknown as Parameters<typeof originalSend>);
  };
}

export function initNetworkCapture() {
  initPerformanceObserver();
  interceptFetch();
  interceptXHR();
}

export function getNetworkRequests(): NetworkEntry[] {
  return [...buffer];
}
