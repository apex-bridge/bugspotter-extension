import { useState, useEffect } from 'react';
import { getSettings } from '@/storage/settings';

export interface Diagnostics {
  initialized: boolean;
  consoleCount: number;
  networkCount: number;
  replayCount: number;
  replayRecording: boolean;
  error?: string;
}

const EMPTY_DIAGNOSTICS: Omit<Diagnostics, 'error'> = {
  initialized: false,
  consoleCount: 0,
  networkCount: 0,
  replayCount: 0,
  replayRecording: false,
};

/**
 * Handles popup initialization: settings check, pending screenshot,
 * offline queue size, and content-script diagnostics.
 */
export function usePopupInit() {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [replayEnabled, setReplayEnabled] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      if (!s.baseUrl || !s.apiKey) setConfigured(false);
      setReplayEnabled(s.replayEnabled);
    });

    // Retrieve any pending annotated screenshot (stored by service worker
    // while popup was closed during annotation)
    chrome.runtime
      .sendMessage({ type: 'GET_PENDING_SCREENSHOT' })
      .then((res) => {
        if (res?.data) setScreenshot(res.data);
      })
      .catch(() => {});

    // Check offline queue size
    chrome.runtime
      .sendMessage({ type: 'GET_OFFLINE_QUEUE_SIZE' })
      .then((res) => {
        if (typeof res?.size === 'number') setOfflineCount(res.size);
      })
      .catch(() => {});

    // Probe content script for diagnostics
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (!tab?.id) {
          setDiagnostics({ ...EMPTY_DIAGNOSTICS, error: 'No active tab' });
          return;
        }
        chrome.tabs
          .sendMessage(tab.id, { type: 'GET_DIAGNOSTICS' })
          .then((res) => {
            if (res?.data) setDiagnostics(res.data);
            else setDiagnostics({ ...EMPTY_DIAGNOSTICS, error: 'Empty response' });
          })
          .catch((err) => {
            setDiagnostics({
              ...EMPTY_DIAGNOSTICS,
              error: err.message || 'Content script unavailable',
            });
          });
      })
      .catch(() => {});
  }, []);

  // Listen for annotation results
  useEffect(() => {
    const listener = (message: { type: string; data?: string }) => {
      if (message.type === 'ANNOTATION_DONE' && message.data) {
        setScreenshot(message.data);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return {
    screenshot,
    setScreenshot,
    configured,
    replayEnabled,
    offlineCount,
    diagnostics,
  };
}
