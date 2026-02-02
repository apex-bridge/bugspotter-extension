import { useState, useEffect } from 'react';
import { getSettings, saveSettings } from '@/storage/settings';
import { validateConnection } from '@/api/bugspotter-client';

export function Options() {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    getSettings().then((s) => {
      setBaseUrl(s.baseUrl);
      setApiKey(s.apiKey);
    });
  }, []);

  const handleSave = async () => {
    setStatus('saving');
    setErrorMsg('');

    // Validate API key format
    if (apiKey && !/^bgs_[a-zA-Z0-9_-]{43}$/.test(apiKey)) {
      setStatus('error');
      setErrorMsg('Invalid API key format. Expected: bgs_[a-zA-Z0-9_-]{43}');
      return;
    }

    // Validate connection
    const valid = await validateConnection({ baseUrl, apiKey });
    if (!valid) {
      setStatus('error');
      setErrorMsg('Could not connect to BugSpotter. Check URL and API key.');
      return;
    }

    await saveSettings({ baseUrl, apiKey });
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="w-full max-w-md p-6">
        <h1 className="text-xl font-bold mb-6">BugSpotter Settings</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">BugSpotter Instance URL</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://bugspotter.example.com"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="bgs_..."
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 font-mono"
            />
          </div>

          {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
          {status === 'saved' && <p className="text-green-400 text-sm">Settings saved and validated.</p>}

          <button
            onClick={handleSave}
            disabled={!baseUrl || !apiKey || status === 'saving'}
            className={`w-full py-2 rounded text-sm font-medium ${
              !baseUrl || !apiKey || status === 'saving'
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {status === 'saving' ? 'Validating...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
