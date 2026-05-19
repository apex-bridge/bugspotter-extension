/**
 * Session replay recorder using rrweb.
 *
 * Records DOM mutations and user interactions, streaming them in batches to a
 * caller-supplied `onBatch` sink. The actual replay buffer lives in the service
 * worker (chrome.storage.session, keyed per tab), so the recording survives
 * full-page navigations — when the content script re-runs on a new URL, the
 * previously-streamed events are still in storage and stitched together by the
 * viewer.
 *
 * Module-level state (`stopFn`, `pendingBatch`) is per-content-script-instance
 * and resets on navigation. That is intentional: each instance only owns its
 * own page's recording window; cross-page persistence is the SW's job.
 */

import { record } from 'rrweb';
import type { ReplayEvent, Sanitizer } from '@bugspotter/common';

// Each flush triggers a read-modify-write of the full per-tab buffer in
// chrome.storage.session. At a full 180s window the buffer can reach hundreds
// of KB, so a sub-second cadence wastes I/O. 5s caps the worst-case data loss
// (sudden tab crash before the next flush) at ~5s of recording — pagehide
// and the submit path both force-flush explicitly.
const BATCH_FLUSH_INTERVAL_MS = 5000;

let stopFn: (() => void) | null = null;
let pendingAbort: AbortController | null = null;
let activeSanitizer: Sanitizer | null = null;
let pendingBatch: ReplayEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let onBatchCallback: ((batch: ReplayEvent[]) => void) | null = null;

function drainBatch(): ReplayEvent[] {
  if (pendingBatch.length === 0) return [];
  const batch = pendingBatch;
  pendingBatch = [];
  return batch;
}

function flushBatchToSink(): void {
  const batch = drainBatch();
  if (batch.length === 0 || !onBatchCallback) return;
  try {
    onBatchCallback(batch);
  } catch (err) {
    console.error('[BugSpotter] replay batch sink failed:', err);
  }
}

function beginRecording(): void {
  pendingAbort = null;

  stopFn =
    record({
      emit(event) {
        pendingBatch.push(event as ReplayEvent);
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

  flushTimer = setInterval(flushBatchToSink, BATCH_FLUSH_INTERVAL_MS);
}

export interface StartReplayOptions {
  sanitizer?: Sanitizer;
  /**
   * Called with each batch of events. The sink owns persistence — typically
   * forwards to the service worker which writes to chrome.storage.session.
   * Called from setInterval and on explicit `forceFlushReplayBatch()`.
   */
  onBatch: (batch: ReplayEvent[]) => void;
}

export function startReplayRecording(options: StartReplayOptions): void {
  if (stopFn || pendingAbort) return; // already recording or pending

  if (options.sanitizer) activeSanitizer = options.sanitizer;
  onBatchCallback = options.onBatch;

  // rrweb needs at least document.documentElement to take a snapshot.
  // Content scripts run at document_start where body may not exist yet.
  if (document.readyState === 'loading') {
    const abort = new AbortController();
    pendingAbort = abort;
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        if (!abort.signal.aborted) beginRecording();
      },
      { once: true, signal: abort.signal },
    );
  } else {
    beginRecording();
  }
}

export function stopReplayRecording(): void {
  if (pendingAbort) {
    pendingAbort.abort();
    pendingAbort = null;
  }
  // Stop rrweb first so its emit can no longer feed pendingBatch after the
  // final flush. Otherwise events emitted during teardown (e.g. mutation
  // observer callbacks already queued) would land in the batch with no
  // future flush to deliver them.
  if (stopFn) {
    stopFn();
    stopFn = null;
  }
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushBatchToSink();
}

/**
 * Synchronously drain whatever's accumulated since the last flush and hand it
 * to the sink. Used by `pagehide` and by the popup's submit path so the SW has
 * the latest events before the report is built.
 */
export function forceFlushReplayBatch(): void {
  flushBatchToSink();
}

export function isRecording(): boolean {
  return stopFn !== null || pendingAbort !== null;
}

export function getPendingBatchSize(): number {
  return pendingBatch.length;
}
