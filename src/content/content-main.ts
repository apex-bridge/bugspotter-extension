import {
  startReplayRecording,
  stopReplayRecording,
  getReplayEvents,
  getReplayEventCount,
  isRecording,
} from './replay-recorder';
import { captureMetadata } from './metadata';
import {
  CircularBuffer,
  createSanitizer,
  type Sanitizer,
  type PIIPatternName,
} from '@bugspotter/common';
import type { ConsoleEntry, NetworkEntry } from '@/types';
import { getSettings } from '@/storage/settings';

// -- Buffers in the isolated world (populated via postMessage from main world) --
// Initialise with default sizes immediately so the postMessage listener can
// buffer events that arrive before the async init() completes.
const DEFAULT_CONSOLE_SIZE = 100;
const DEFAULT_NETWORK_SIZE = 50;
let consoleBuffer = new CircularBuffer<ConsoleEntry>(DEFAULT_CONSOLE_SIZE);
let networkBuffer = new CircularBuffer<NetworkEntry>(DEFAULT_NETWORK_SIZE);
let sanitizer: Sanitizer | null = null;
let initialized = false;

function getConsoleLogs(): ConsoleEntry[] {
  return consoleBuffer?.getAll() ?? [];
}

function getNetworkRequests(): NetworkEntry[] {
  return networkBuffer?.getAll() ?? [];
}

// Check if the current page's domain matches the allowlist.
function isDomainAllowed(allowedDomains: string[]): boolean {
  if (!allowedDomains || allowedDomains.length === 0) return true;
  const hostname = window.location.hostname;
  return allowedDomains.some((domain) => {
    const d = domain.trim().toLowerCase();
    if (!d) return false;
    if (d.startsWith('*.')) {
      const base = d.slice(2);
      return hostname === base || hostname.endsWith('.' + base);
    }
    return hostname === d;
  });
}

// Caps for string fields coming from postMessage to prevent oversized entries
const MAX_MESSAGE_LENGTH = 4000;
const MAX_URL_LENGTH = 2000;
const MAX_BODY_LENGTH = 4000;
const MAX_STACK_LENGTH = 4000;

function truncStr(val: unknown, max: number): string {
  if (typeof val !== 'string') return '';
  return val.length > max ? val.slice(0, max) : val;
}

const MAX_ARG_LENGTH = 4000;

function capArg(arg: unknown): unknown {
  if (typeof arg === 'string')
    return arg.length > MAX_ARG_LENGTH ? arg.slice(0, MAX_ARG_LENGTH) : arg;
  if (arg === null || arg === undefined || typeof arg !== 'object') return arg;
  // Cap serialized size of object args
  try {
    const json = JSON.stringify(arg);
    if (json.length > MAX_ARG_LENGTH) return json.slice(0, MAX_ARG_LENGTH);
    return arg;
  } catch {
    return String(arg);
  }
}

function validateConsoleEntry(data: unknown): ConsoleEntry | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.level !== 'string' || typeof d.timestamp !== 'number') return null;
  const validLevels = ['log', 'info', 'warn', 'error', 'debug'];
  if (!validLevels.includes(d.level)) return null;
  return {
    level: d.level as ConsoleEntry['level'],
    message: truncStr(d.message, MAX_MESSAGE_LENGTH),
    timestamp: d.timestamp,
    args: Array.isArray(d.args) ? d.args.slice(0, 20).map(capArg) : [],
    ...(typeof d.stack === 'string' ? { stack: truncStr(d.stack, MAX_STACK_LENGTH) } : {}),
  };
}

const MAX_HEADERS = 50;
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const MAX_HEADER_KEY_LENGTH = 200;

function sanitizeHeaders(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null) return {};
  const entries = Object.entries(raw as Record<string, unknown>);
  const result: Record<string, string> = {};
  let count = 0;
  for (const [rawKey, val] of entries) {
    if (count >= MAX_HEADERS) break;
    if (BLOCKED_KEYS.has(rawKey)) continue;
    const key =
      rawKey.length > MAX_HEADER_KEY_LENGTH ? rawKey.slice(0, MAX_HEADER_KEY_LENGTH) : rawKey;
    result[key] = typeof val === 'string' ? val.slice(0, 1000) : String(val).slice(0, 1000);
    count++;
  }
  return result;
}

function validateNetworkEntry(data: unknown): NetworkEntry | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.url !== 'string' || typeof d.timestamp !== 'number') return null;
  return {
    url: truncStr(d.url, MAX_URL_LENGTH),
    method: typeof d.method === 'string' ? d.method.slice(0, 10) : 'GET',
    status: typeof d.status === 'number' ? d.status : 0,
    statusText: typeof d.statusText === 'string' ? d.statusText.slice(0, 100) : '',
    duration: typeof d.duration === 'number' ? d.duration : 0,
    timestamp: d.timestamp,
    headers: sanitizeHeaders(d.headers),
    ...(d.responseHeaders && typeof d.responseHeaders === 'object'
      ? { responseHeaders: sanitizeHeaders(d.responseHeaders) }
      : {}),
    ...(typeof d.requestBody === 'string'
      ? { requestBody: truncStr(d.requestBody, MAX_BODY_LENGTH) }
      : {}),
    ...(typeof d.error === 'string' ? { error: d.error.slice(0, 500) } : {}),
  };
}

/** Listen for postMessage from the injected main-world script */
function listenForMainWorldCaptures() {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== 'bugspotter-capture') return;

    if (msg.type === 'console') {
      const validated = validateConsoleEntry(msg.data);
      if (!validated) return;
      const entry = sanitizer ? (sanitizer.sanitize(validated) as ConsoleEntry) : validated;
      consoleBuffer.add(entry);
    }

    if (msg.type === 'network') {
      const validated = validateNetworkEntry(msg.data);
      if (!validated) return;
      const entry = sanitizer ? (sanitizer.sanitize(validated) as NetworkEntry) : validated;
      networkBuffer.add(entry);
    }
  });
}

// Start listening for main-world postMessage events IMMEDIATELY — before
// the async init(). The main-world capture script (registered via
// chrome.scripting.registerContentScripts) runs at document_start and fires
// events right away. Without an early listener those events are lost.
// Early events won't be sanitized (sanitizer is still null), but that's
// acceptable — the ternary in the listener already handles null sanitizer.
listenForMainWorldCaptures();

// Load settings and initialize
async function init() {
  const settings = await getSettings();

  if (!isDomainAllowed(settings.allowedDomains)) {
    // Domain not allowed — discard any events buffered during the async gap
    consoleBuffer = new CircularBuffer<ConsoleEntry>(DEFAULT_CONSOLE_SIZE);
    networkBuffer = new CircularBuffer<NetworkEntry>(DEFAULT_NETWORK_SIZE);
    return;
  }

  const sanitizationPatterns = settings.sanitizationPatterns as PIIPatternName[] | undefined;
  const maxConsoleEntries = settings.maxConsoleEntries;
  const maxNetworkEntries = settings.maxNetworkEntries;
  const replayEnabled = settings.replayEnabled;

  sanitizer = createSanitizer({
    enabled: settings.sanitizationEnabled,
    patterns: sanitizationPatterns,
  });

  // If configured sizes differ from the defaults, create new buffers.
  // Any events captured during the async gap are lost, but the buffer
  // sizes match user settings going forward.
  if (maxConsoleEntries !== DEFAULT_CONSOLE_SIZE) {
    consoleBuffer = new CircularBuffer<ConsoleEntry>(maxConsoleEntries);
  }
  if (maxNetworkEntries !== DEFAULT_NETWORK_SIZE) {
    networkBuffer = new CircularBuffer<NetworkEntry>(maxNetworkEntries);
  }
  initialized = true;

  // Start session replay if enabled (pass sanitizer for PII masking)
  if (replayEnabled) {
    try {
      startReplayRecording(60, sanitizer ?? undefined);
    } catch (err) {
      console.error('[BugSpotter] Failed to start replay recording:', err);
    }
  }
}

init().catch((err) => {
  // Do not start captures on init failure — sanitizer and domain allowlist
  // would be uninitialized, risking unsanitized PII capture on all pages.
  // The `initialized` flag stays false, so GET_CAPTURE_DATA returns empty data.
  console.error('[BugSpotter] Initialization failed. Captures disabled on this page:', err);
});

// Listen for messages from service worker / popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // If captures weren't initialized (domain not allowed), return empty data
  if (!initialized && message.type === 'GET_CAPTURE_DATA') {
    sendResponse({
      type: 'CAPTURE_DATA',
      data: { console: [], network: [], metadata: null },
    });
    return true;
  }

  if (message.type === 'GET_CAPTURE_DATA') {
    sendResponse({
      type: 'CAPTURE_DATA',
      data: {
        console: getConsoleLogs(),
        network: getNetworkRequests(),
        metadata: captureMetadata(sanitizer ?? undefined),
      },
    });
    return true;
  }

  if (message.type === 'GET_REPLAY_EVENTS') {
    sendResponse({
      type: 'REPLAY_EVENTS',
      data: getReplayEvents(),
    });
    return true;
  }

  if (message.type === 'GET_DIAGNOSTICS') {
    sendResponse({
      type: 'DIAGNOSTICS',
      data: {
        initialized,
        consoleCount: consoleBuffer?.getAll().length ?? 0,
        networkCount: networkBuffer?.getAll().length ?? 0,
        replayCount: getReplayEventCount(),
        replayRecording: isRecording(),
      },
    });
    return true;
  }

  if (message.type === 'START_REPLAY') {
    startReplayRecording(60, sanitizer ?? undefined);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'STOP_REPLAY') {
    stopReplayRecording();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'START_ANNOTATION') {
    injectAnnotationOverlay(message.screenshot);
    sendResponse({ success: true });
    return true;
  }

  return false;
});

function injectAnnotationOverlay(screenshotDataUrl: string) {
  // Remove existing overlay if any
  const existing = document.getElementById('bugspotter-annotation-host');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = 'bugspotter-annotation-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.8); display: flex; flex-direction: column; align-items: center; font-family: system-ui, sans-serif; }
      .toolbar { display: flex; gap: 8px; padding: 12px; background: #1f2937; border-radius: 8px; margin-top: 12px; align-items: center; }
      .toolbar button { padding: 6px 12px; border: 1px solid #4b5563; border-radius: 4px; background: #374151; color: white; cursor: pointer; font-size: 13px; }
      .toolbar button.active { background: #2563eb; border-color: #3b82f6; }
      .toolbar button:hover { background: #4b5563; }
      .toolbar button.active:hover { background: #1d4ed8; }
      .color-btn { width: 24px; height: 24px; border-radius: 50%; border: 2px solid #4b5563; cursor: pointer; padding: 0; }
      .color-btn.active { border-color: white; }
      .canvas-container { flex: 1; display: flex; align-items: center; justify-content: center; padding: 12px; overflow: hidden; }
      canvas { max-width: 100%; max-height: 100%; cursor: crosshair; }
      .actions { display: flex; gap: 8px; padding: 12px; }
      .actions button { padding: 8px 20px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600; }
      .btn-done { background: #22c55e; color: white; }
      .btn-done:hover { background: #16a34a; }
      .btn-cancel { background: #ef4444; color: white; }
      .btn-cancel:hover { background: #dc2626; }
    </style>
    <div class="overlay">
      <div class="toolbar">
        <button data-tool="rectangle" class="active">Rectangle</button>
        <button data-tool="arrow">Arrow</button>
        <button data-tool="freehand">Freehand</button>
        <button data-tool="text">Text</button>
        <span style="width:1px;height:24px;background:#4b5563;margin:0 4px;"></span>
        <button class="color-btn active" data-color="#ef4444" style="background:#ef4444;"></button>
        <button class="color-btn" data-color="#22c55e" style="background:#22c55e;"></button>
        <button class="color-btn" data-color="#3b82f6" style="background:#3b82f6;"></button>
        <button class="color-btn" data-color="#eab308" style="background:#eab308;"></button>
        <button class="color-btn" data-color="#ffffff" style="background:#ffffff;"></button>
        <button class="color-btn" data-color="#000000" style="background:#000000;"></button>
        <span style="width:1px;height:24px;background:#4b5563;margin:0 4px;"></span>
        <button data-action="undo">Undo</button>
        <button data-action="redo">Redo</button>
      </div>
      <div class="canvas-container">
        <canvas id="annotation-canvas"></canvas>
      </div>
      <div class="actions">
        <button class="btn-done">Done</button>
        <button class="btn-cancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(host);

  // Initialize canvas with screenshot
  const canvas = shadow.getElementById('annotation-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const img = new Image();

  let currentTool = 'rectangle';
  let currentColor = '#ef4444';
  let isDrawing = false;
  let startX = 0;
  let startY = 0;

  interface DrawAction {
    type: string;
    color: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    points?: { x: number; y: number }[];
    text?: string;
  }

  const undoStack: DrawAction[] = [];
  const redoStack: DrawAction[] = [];
  let currentFreehand: { x: number; y: number }[] = [];

  function redrawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const action of undoStack) {
      drawAction(action);
    }
  }

  function drawAction(action: DrawAction) {
    ctx.strokeStyle = action.color;
    ctx.fillStyle = action.color;
    ctx.lineWidth = 3;

    if (action.type === 'rectangle') {
      ctx.strokeRect(
        action.startX,
        action.startY,
        action.endX - action.startX,
        action.endY - action.startY,
      );
    } else if (action.type === 'arrow') {
      const dx = action.endX - action.startX;
      const dy = action.endY - action.startY;
      const angle = Math.atan2(dy, dx);
      const headLen = 15;

      ctx.beginPath();
      ctx.moveTo(action.startX, action.startY);
      ctx.lineTo(action.endX, action.endY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(action.endX, action.endY);
      ctx.lineTo(
        action.endX - headLen * Math.cos(angle - Math.PI / 6),
        action.endY - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.moveTo(action.endX, action.endY);
      ctx.lineTo(
        action.endX - headLen * Math.cos(angle + Math.PI / 6),
        action.endY - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.stroke();
    } else if (action.type === 'freehand' && action.points) {
      ctx.beginPath();
      ctx.moveTo(action.points[0].x, action.points[0].y);
      for (let i = 1; i < action.points.length; i++) {
        ctx.lineTo(action.points[i].x, action.points[i].y);
      }
      ctx.stroke();
    } else if (action.type === 'text' && action.text) {
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(action.text, action.startX, action.startY);
    }
  }

  img.onload = () => {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  img.src = screenshotDataUrl;

  function getCanvasCoords(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    const { x, y } = getCanvasCoords(e);
    isDrawing = true;
    startX = x;
    startY = y;

    if (currentTool === 'freehand') {
      currentFreehand = [{ x, y }];
    }
    if (currentTool === 'text') {
      isDrawing = false;
      const text = prompt('Enter text:');
      if (text) {
        const action: DrawAction = {
          type: 'text',
          color: currentColor,
          startX: x,
          startY: y,
          endX: x,
          endY: y,
          text,
        };
        undoStack.push(action);
        redoStack.length = 0;
        redrawAll();
      }
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const { x, y } = getCanvasCoords(e);

    if (currentTool === 'freehand') {
      currentFreehand.push({ x, y });
      redrawAll();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(currentFreehand[0].x, currentFreehand[0].y);
      for (let i = 1; i < currentFreehand.length; i++) {
        ctx.lineTo(currentFreehand[i].x, currentFreehand[i].y);
      }
      ctx.stroke();
    } else {
      redrawAll();
      const preview: DrawAction = {
        type: currentTool,
        color: currentColor,
        startX,
        startY,
        endX: x,
        endY: y,
      };
      drawAction(preview);
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const { x, y } = getCanvasCoords(e);

    if (currentTool === 'freehand') {
      undoStack.push({
        type: 'freehand',
        color: currentColor,
        startX,
        startY,
        endX: x,
        endY: y,
        points: [...currentFreehand],
      });
    } else {
      undoStack.push({ type: currentTool, color: currentColor, startX, startY, endX: x, endY: y });
    }
    redoStack.length = 0;
    redrawAll();
  });

  // Toolbar handlers
  shadow.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      shadow
        .querySelectorAll<HTMLButtonElement>('[data-tool]')
        .forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTool = btn.dataset.tool!;
    });
  });

  shadow.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((btn) => {
    btn.addEventListener('click', () => {
      shadow
        .querySelectorAll<HTMLButtonElement>('[data-color]')
        .forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentColor = btn.dataset.color!;
    });
  });

  shadow.querySelector('[data-action="undo"]')!.addEventListener('click', () => {
    const action = undoStack.pop();
    if (action) {
      redoStack.push(action);
      redrawAll();
    }
  });

  shadow.querySelector('[data-action="redo"]')!.addEventListener('click', () => {
    const action = redoStack.pop();
    if (action) {
      undoStack.push(action);
      redrawAll();
    }
  });

  shadow.querySelector('.btn-done')!.addEventListener('click', () => {
    canvas.toBlob((blob) => {
      if (blob) {
        const reader = new FileReader();
        reader.onload = () => {
          chrome.runtime.sendMessage({ type: 'ANNOTATION_DONE', data: reader.result as string });
          host.remove();
        };
        reader.readAsDataURL(blob);
      }
    }, 'image/png');
  });

  shadow.querySelector('.btn-cancel')!.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'ANNOTATION_CANCEL' });
    host.remove();
  });
}
