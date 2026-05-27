import { useState, useCallback } from 'react';
import type { BrowserMetadata } from '@/types';

type SubmitStatus = 'idle' | 'loading' | 'success' | 'error';

interface SubmitReportArgs {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  screenshot: string | null;
  replayEnabled: boolean;
  /**
   * Set when the user clicked "Same" on a deflection chip. Forwarded
   * to the backend so it can set `duplicate_of` + tag the row as
   * `metadata.deflection_source = 'extension_user_confirmed'`. Null
   * when the user didn't confirm a deflection.
   */
  deflectedToCanonicalId: string | null;
}

/**
 * Handles bug report submission: gathers capture data from content script,
 * builds the payload, and sends it to the service worker.
 */
export function useSubmitReport(args: SubmitReportArgs) {
  const { title, description, priority, screenshot, replayEnabled, deflectedToCanonicalId } = args;
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) return;

    setStatus('loading');
    setErrorMsg('');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tab?.id;

      // Get capture data + metadata directly from content script (not service worker,
      // whose in-memory store is lost when MV3 suspends it).
      let captureData: {
        data?: { console?: unknown[]; network?: unknown[]; metadata?: BrowserMetadata | null };
      } = {};
      if (tabId) {
        try {
          captureData = await chrome.tabs.sendMessage(tabId, { type: 'GET_CAPTURE_DATA' });
        } catch {
          // Content script not available (e.g. chrome:// pages)
        }
      }

      // Get replay events if enabled
      let replayEvents: unknown[] = [];
      if (replayEnabled && tabId) {
        try {
          const replayResponse = await chrome.tabs.sendMessage(tabId, {
            type: 'GET_REPLAY_EVENTS',
          });
          replayEvents = replayResponse?.data ?? [];
        } catch {
          // Replay not available
        }
      }

      // Use metadata from content script (page context); fall back to minimal popup metadata
      const metadata: BrowserMetadata = captureData?.data?.metadata ?? {
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth || screen.width,
          height: window.innerHeight || screen.height,
        },
        url: tab?.url ?? '',
        timestamp: Date.now(),
        platform: navigator.platform,
        language: navigator.language,
        screen: { width: screen.width, height: screen.height },
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        browser: 'Unknown',
        os: 'Unknown',
        version: '',
      };
      // Always set version from the extension manifest (not available in content scripts)
      metadata.version = chrome.runtime.getManifest().version;

      const submitPayload = {
        title,
        description,
        priority,
        source: 'extension' as const,
        report: {
          console: captureData?.data?.console ?? [],
          network: captureData?.data?.network ?? [],
          metadata,
        },
        hasScreenshot: !!screenshot,
        hasReplay: replayEvents.length > 0,
        screenshotDataUrl: screenshot ?? '',
        replayEvents,
        // Omit the field entirely when null so the backend handler
        // sees `undefined` (consistent with how the SDK widget threads
        // this through). The backend treats both as "no deflection".
        ...(deflectedToCanonicalId ? { deflected_to_canonical_id: deflectedToCanonicalId } : {}),
      };

      console.warn('[BugSpotter] Submitting report payload:', {
        consoleCount: submitPayload.report.console.length,
        networkCount: submitPayload.report.network.length,
        hasScreenshot: submitPayload.hasScreenshot,
        hasReplay: submitPayload.hasReplay,
        replayEventsCount: submitPayload.replayEvents.length,
        metadataUrl: submitPayload.report.metadata.url,
        captureDataReceived: !!captureData?.data,
      });

      const response = await chrome.runtime.sendMessage({
        type: 'SUBMIT_REPORT',
        data: submitPayload,
      });

      if (response.success) {
        // Clear the cross-navigation replay + console + network buffers so
        // the next report starts from a clean slate. Failures here are
        // non-fatal — stale entries would age out via prune / count cap.
        if (tabId) {
          chrome.runtime.sendMessage({ type: 'REPLAY_CLEAR', tabId }).catch(() => {});
          chrome.runtime.sendMessage({ type: 'CAPTURE_CLEAR', tabId }).catch(() => {});
        }
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMsg(response.error ?? 'Submission failed');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [title, description, priority, screenshot, replayEnabled, deflectedToCanonicalId]);

  const resetStatus = useCallback(() => setStatus('idle'), []);

  return { status, errorMsg, setErrorMsg, handleSubmit, resetStatus };
}
