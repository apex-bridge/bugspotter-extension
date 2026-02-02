import { useState, useEffect, useCallback } from 'react';
import { ProjectSelector } from './components/ProjectSelector';
import { BugReportForm } from './components/BugReportForm';
import { SubmitButton } from './components/SubmitButton';
import type { BrowserMetadata } from '@/types';
import { getSettings } from '@/storage/settings';

type SubmitStatus = 'idle' | 'loading' | 'success' | 'error';

export function Popup() {
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    getSettings().then((s) => {
      if (!s.baseUrl || !s.apiKey) setConfigured(false);
    });
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
    if (!title.trim() || !projectId) return;

    setStatus('loading');
    setErrorMsg('');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tab?.id;

      // Get capture data from service worker
      const captureData = await chrome.runtime.sendMessage({ type: 'GET_CAPTURE_DATA', tabId });

      const metadata: BrowserMetadata = {
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        url: tab?.url ?? '',
        timestamp: Date.now(),
        platform: navigator.platform,
        language: navigator.language,
        screen: { width: screen.width, height: screen.height },
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      const response = await chrome.runtime.sendMessage({
        type: 'SUBMIT_REPORT',
        data: {
          title,
          description,
          priority,
          project_id: projectId,
          report: {
            console: captureData?.data?.console ?? [],
            network: captureData?.data?.network ?? [],
            metadata,
          },
          hasScreenshot: !!screenshot,
          hasReplay: false,
          screenshotDataUrl: screenshot ?? '',
        },
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
  }, [title, description, priority, projectId, screenshot]);

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
      <h1 className="text-lg font-bold mb-3">BugSpotter</h1>

      <ProjectSelector value={projectId} onChange={setProjectId} />

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

      <SubmitButton status={status} disabled={!title.trim() || !projectId} onClick={handleSubmit} />
    </div>
  );
}
