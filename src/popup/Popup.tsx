import { useState } from 'react';
import { BugReportForm } from './components/BugReportForm';
import { SubmitButton } from './components/SubmitButton';
import { DiagnosticsBar } from './components/DiagnosticsBar';
import { usePopupInit } from './hooks/usePopupInit';
import { useSubmitReport } from './hooks/useSubmitReport';

export function Popup() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');

  const { screenshot, setScreenshot, configured, replayEnabled, offlineCount, diagnostics } =
    usePopupInit();

  const { status, errorMsg, handleSubmit, resetStatus } = useSubmitReport({
    title,
    description,
    priority,
    screenshot,
    replayEnabled,
  });

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
            resetStatus();
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

      {diagnostics && <DiagnosticsBar diagnostics={diagnostics} replayEnabled={replayEnabled} />}

      <BugReportForm
        title={title}
        description={description}
        priority={priority}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onPriorityChange={setPriority}
      />

      {screenshot && (
        <div className="mt-3 border border-gray-700 rounded overflow-hidden">
          <img src={screenshot} alt="Screenshot" className="w-full" />
        </div>
      )}

      {errorMsg && <p className="mt-2 text-red-400 text-xs">{errorMsg}</p>}

      <SubmitButton status={status} disabled={!title.trim()} onClick={handleSubmit} />
    </div>
  );
}
