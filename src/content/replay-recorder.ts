/**
 * Session replay recorder using rrweb.
 * Ported from bugspotter-sdk/src/collectors/dom.ts
 *
 * Records DOM mutations and user interactions into a TimeBasedBuffer.
 * Start/stop controlled via messages from the service worker.
 */

import { record } from 'rrweb';
import { TimeBasedBuffer, type ReplayEvent, type Sanitizer } from '@bugspotter/common';

let replayBuffer: TimeBasedBuffer | null = null;
let stopFn: (() => void) | null = null;
let pendingAbort: AbortController | null = null;
let activeSanitizer: Sanitizer | null = null;

function beginRecording(durationSeconds: number): void {
  pendingAbort = null;
  replayBuffer = new TimeBasedBuffer(durationSeconds);

  stopFn =
    record({
      emit(event) {
        replayBuffer?.add(event as ReplayEvent);
      },
      blockClass: 'bugspotter-ignore',
      maskAllInputs: true,
      // PII sanitization for text content in DOM snapshots
      maskTextFn: activeSanitizer
        ? (text: string, element: HTMLElement | null) => {
            return activeSanitizer!.sanitizeTextNode(text, element ?? undefined);
          }
        : undefined,
      // Sampling for performance optimization
      sampling: {
        mousemove: 50,
        scroll: 100,
        mouseInteraction: true,
      },
      // Performance optimizations — skip non-essential DOM nodes
      slimDOMOptions: {
        script: true,
        comment: true,
        headFavicon: true,
        headWhitespace: true,
        headMetaSocial: true,
        headMetaRobots: true,
        headMetaHttpEquiv: true,
        headMetaAuthorship: true,
        headMetaVerification: true,
      },
      inlineStylesheet: true,
    }) ?? null;
}

export function startReplayRecording(durationSeconds = 60, sanitizer?: Sanitizer): void {
  if (stopFn || pendingAbort) return; // already recording or pending

  if (sanitizer) activeSanitizer = sanitizer;

  // rrweb needs at least document.documentElement to take a snapshot.
  // Content scripts run at document_start where body may not exist yet.
  if (document.readyState === 'loading') {
    const abort = new AbortController();
    pendingAbort = abort;
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        if (!abort.signal.aborted) beginRecording(durationSeconds);
      },
      { once: true, signal: abort.signal },
    );
  } else {
    beginRecording(durationSeconds);
  }
}

export function stopReplayRecording(): void {
  // Cancel pending DOMContentLoaded start if stop is called before DOM is ready
  if (pendingAbort) {
    pendingAbort.abort();
    pendingAbort = null;
  }
  if (stopFn) {
    stopFn();
    stopFn = null;
  }
}

export function getReplayEvents(): ReplayEvent[] {
  return replayBuffer?.getEvents() ?? [];
}

export function clearReplayBuffer(): void {
  replayBuffer?.clear();
}

export function isRecording(): boolean {
  return stopFn !== null;
}
