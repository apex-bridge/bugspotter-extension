import { useState, useEffect, useCallback } from 'react';
import { BugReportForm } from './components/BugReportForm';
import { SubmitButton } from './components/SubmitButton';
import type { BrowserMetadata } from '@/types';
import { getSettings } from '@/storage/settings';

type SubmitStatus = 'idle' | 'loading' | 'success' | 'error';

interface Diagnostics {
  initialized: boolean;
  consoleCount: number;
  networkCount: number;
  replayCount: number;
  replayRecording: boolean;
  error?: string;
}

export function Popup() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
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
          setDiagnostics({
            initialized: false,
            consoleCount: 0,
            networkCount: 0,
            replayCount: 0,
            replayRecording: false,
            error: 'No active tab',
          });
          return;
        }
        chrome.tabs
          .sendMessage(tab.id, { type: 'GET_DIAGNOSTICS' })
          .then((res) => {
            if (res?.data) setDiagnostics(res.data);
            else
              setDiagnostics({
                initialized: false,
                consoleCount: 0,
                networkCount: 0,
                replayCount: 0,
                replayRecording: false,
                error: 'Empty response',
              });
          })
          .catch((err) => {
            setDiagnostics({
              initialized: false,
              consoleCount: 0,
              networkCount: 0,
              replayCount: 0,
              replayRecording: false,
              error: err.message || 'Content script unavailable',
            });
          });
      })
      .catch(() => {});
  }, []);

  const handleCapture = useCallback(async () => {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });
    if (response.error) {
      setErrorMsg(response.error);
      return;
    }
    setScreenshot(response.data);

    // Send to content script for annotation
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'START_ANNOTATION',
        screenshot: response.data,
      });
      // Close popup while annotating
      window.close();
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) return;

    setStatus('loading');
    setErrorMsg('');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tab?.id;

      // Get capture data + metadata directly from content script (not service worker,
      // whose in-memory store is lost when MV3 suspends it).
      // Metadata is collected in the page context so viewport reflects the actual page.
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
        report: {
          console: captureData?.data?.console ?? [],
          network: captureData?.data?.network ?? [],
          metadata,
        },
        hasScreenshot: !!screenshot,
        hasReplay: replayEvents.length > 0,
        screenshotDataUrl: screenshot ?? '',
        replayEvents,
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
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMsg(response.error ?? 'Submission failed');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [title, description, priority, screenshot, replayEnabled]);

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

  if (!configured) {
    return (
      <div className="w-80 p-4 bg-gray-900 text-white">
        <h1 className="text-lg font-bold mb-2">BugSpotter</h1>
        <p className="text-sm text-gray-400 mb-3">
          Please configure your BugSpotter URL and API key in the extension options.
        </p>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium"
        >
          Open Options
        </button>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="w-80 p-4 bg-gray-900 text-white text-center">
        <div className="text-green-400 text-2xl mb-2">&#10003;</div>
        <p className="font-medium">Bug report submitted!</p>
        <button
          onClick={() => {
            setStatus('idle');
            setTitle('');
            setDescription('');
            setScreenshot(null);
          }}
          className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
        >
          Submit Another
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 p-4 bg-gray-900 text-white">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold">
          BugSpotter{' '}
          <span className="text-xs font-normal text-gray-400">
            v{chrome.runtime.getManifest().version}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          {replayEnabled && (
            <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded">REC</span>
          )}
          {offlineCount > 0 && (
            <span className="text-xs bg-yellow-600 text-white px-1.5 py-0.5 rounded">
              {offlineCount} queued
            </span>
          )}
        </div>
      </div>

      {diagnostics && (
        <div className="mb-2 px-2 py-1 bg-gray-800 rounded text-[10px] font-mono flex flex-wrap gap-x-3 gap-y-0.5">
          <span className={diagnostics.initialized ? 'text-green-400' : 'text-red-400'}>
            Content: {diagnostics.initialized ? 'OK' : 'NOT INIT'}
          </span>
          <span className={diagnostics.consoleCount > 0 ? 'text-green-400' : 'text-yellow-400'}>
            Console: {diagnostics.consoleCount}
          </span>
          <span className={diagnostics.networkCount > 0 ? 'text-green-400' : 'text-yellow-400'}>
            Network: {diagnostics.networkCount}
          </span>
          {replayEnabled && (
            <span className={diagnostics.replayCount > 0 ? 'text-green-400' : 'text-red-400'}>
              Replay: {diagnostics.replayRecording ? diagnostics.replayCount : 'OFF'}
            </span>
          )}
          {diagnostics.error && <span className="text-red-400 w-full">{diagnostics.error}</span>}
        </div>
      )}

      <BugReportForm
        title={title}
        description={description}
        priority={priority}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onPriorityChange={setPriority}
      />

      <div className="mt-3">
        <button
          onClick={handleCapture}
          className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium flex items-center justify-center gap-2"
        >
          {screenshot ? 'Re-capture Screenshot' : 'Capture Screenshot'}
        </button>
        {screenshot && (
          <div className="mt-2 border border-gray-700 rounded overflow-hidden">
            <img src={screenshot} alt="Screenshot" className="w-full" />
          </div>
        )}
      </div>

      {errorMsg && <p className="mt-2 text-red-400 text-xs">{errorMsg}</p>}

      <SubmitButton status={status} disabled={!title.trim()} onClick={handleSubmit} />
    </div>
  );
}
