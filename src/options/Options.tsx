import { useState, useEffect } from 'react';
import { getSettings, saveSettings, DEMO_INSTANCE } from '@/storage/settings';
import { validateConnection } from '@/api/bugspotter-client';
import type { Settings } from '@/types';
import {
  getAllPatternNames,
  PATTERN_PRESETS,
  type PIIPatternName,
  type PatternPresetName,
} from '@bugspotter/common';

const ALL_PATTERNS = getAllPatternNames();

const PRESET_LABELS: Record<PatternPresetName, string> = {
  all: 'All patterns',
  minimal: 'Minimal (email, credit card, SSN)',
  financial: 'Financial (credit card, SSN)',
  contact: 'Contact (email, phone)',
  identification: 'Identification (SSN, IIN)',
  credentials: 'Credentials (API keys, tokens, passwords)',
  kazakhstan: 'Kazakhstan (email, phone, IIN)',
  gdpr: 'GDPR (email, phone, IP)',
  pci: 'PCI DSS (credit card)',
  security: 'Security (PII + credentials)',
};

const PATTERN_LABELS: Record<PIIPatternName, string> = {
  email: 'Email addresses',
  creditcard: 'Credit card numbers',
  ssn: 'Social Security Numbers',
  iin: 'Kazakhstan IIN/BIN',
  ip: 'IP addresses',
  phone: 'Phone numbers',
  apikey: 'API keys',
  token: 'Auth tokens',
  password: 'Passwords',
};

export function Options() {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [sanitizationEnabled, setSanitizationEnabled] = useState(true);
  const [sanitizationPatterns, setSanitizationPatterns] = useState<string[]>(ALL_PATTERNS);
  const [replayEnabled, setReplayEnabled] = useState(false);
  const [replayInputMasking, setReplayInputMasking] =
    useState<Settings['replayInputMasking']>('all');
  const [maxConsoleEntries, setMaxConsoleEntries] = useState(100);
  const [maxNetworkEntries, setMaxNetworkEntries] = useState(50);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'demo-connecting'>(
    'idle',
  );
  const [errorMsg, setErrorMsg] = useState('');
  const demoConnected =
    DEMO_INSTANCE.apiKey !== '' &&
    baseUrl.replace(/\/$/, '') === DEMO_INSTANCE.baseUrl.replace(/\/$/, '') &&
    apiKey === DEMO_INSTANCE.apiKey;

  const isBusy = status === 'saving' || status === 'demo-connecting';

  useEffect(() => {
    getSettings().then((s) => {
      setBaseUrl(s.baseUrl);
      setApiKey(s.apiKey);
      setAllowedDomains(s.allowedDomains);
      setSanitizationEnabled(s.sanitizationEnabled);
      setSanitizationPatterns(s.sanitizationPatterns);
      setReplayEnabled(s.replayEnabled);
      setReplayInputMasking(s.replayInputMasking);
      setMaxConsoleEntries(s.maxConsoleEntries);
      setMaxNetworkEntries(s.maxNetworkEntries);
    });
  }, []);

  const togglePattern = (pattern: string) => {
    setSanitizationPatterns((prev) =>
      prev.includes(pattern) ? prev.filter((p) => p !== pattern) : [...prev, pattern],
    );
  };

  const applyPreset = (preset: PatternPresetName) => {
    setSanitizationPatterns([...PATTERN_PRESETS[preset]]);
  };

  const addDomain = () => {
    const domain = newDomain.trim().toLowerCase();
    if (domain && !allowedDomains.includes(domain)) {
      setAllowedDomains((prev) => [...prev, domain]);
      setNewDomain('');
    }
  };

  const removeDomain = (domain: string) => {
    setAllowedDomains((prev) => prev.filter((d) => d !== domain));
  };

  const handleSave = async () => {
    setStatus('saving');
    setErrorMsg('');

    if (apiKey && !/^bgs_[a-zA-Z0-9_-]{43}$/.test(apiKey)) {
      setStatus('error');
      setErrorMsg('Invalid API key format. Expected: bgs_[a-zA-Z0-9_-]{43}');
      return;
    }

    const valid = await validateConnection({
      baseUrl,
      apiKey,
      allowedDomains,
      sanitizationEnabled,
      sanitizationPatterns,
      replayEnabled,
      replayInputMasking,
      maxConsoleEntries,
      maxNetworkEntries,
    });
    if (!valid) {
      setStatus('error');
      setErrorMsg('Could not connect to BugSpotter. Check URL and API key.');
      return;
    }

    await saveSettings({
      baseUrl,
      apiKey,
      allowedDomains,
      sanitizationEnabled,
      sanitizationPatterns,
      replayEnabled,
      replayInputMasking,
      maxConsoleEntries,
      maxNetworkEntries,
    });
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  };

  const connectToDemo = async () => {
    setStatus('demo-connecting');
    setErrorMsg('');

    const demoSettings = {
      baseUrl: DEMO_INSTANCE.baseUrl,
      apiKey: DEMO_INSTANCE.apiKey,
      allowedDomains,
      sanitizationEnabled,
      sanitizationPatterns,
      replayEnabled: true,
      replayInputMasking,
      maxConsoleEntries,
      maxNetworkEntries,
    };

    const valid = await validateConnection(demoSettings);

    if (!valid) {
      setStatus('error');
      setErrorMsg('Could not connect to demo instance. It may be temporarily unavailable.');
      return;
    }

    setBaseUrl(DEMO_INSTANCE.baseUrl);
    setApiKey(DEMO_INSTANCE.apiKey);
    setReplayEnabled(true);
    await saveSettings(demoSettings);
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="w-full max-w-md p-6">
        <h1 className="text-xl font-bold mb-6">BugSpotter Settings</h1>

        <div className="space-y-5">
          {/* Connection */}
          <section>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Connection
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Instance URL</label>
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

              {/* Connect to Demo Instance — only shown when demo API key is configured at build time */}
              {DEMO_INSTANCE.apiKey && !demoConnected && (
                <button
                  onClick={connectToDemo}
                  disabled={isBusy}
                  className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium border border-emerald-600 disabled:border-gray-600"
                >
                  {status === 'demo-connecting'
                    ? 'Connecting...'
                    : `Connect to ${DEMO_INSTANCE.label}`}
                </button>
              )}
              {demoConnected && (
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <span>&#10003;</span>
                  <span>Connected to {DEMO_INSTANCE.label}</span>
                </div>
              )}
            </div>
          </section>

          {/* Allowed Domains */}
          <section>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Allowed Domains
            </h2>
            <p className="text-xs text-gray-500 mb-2">
              Only capture data on these domains. Leave empty to run on all sites. Supports
              wildcards: *.example.com
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDomain()}
                placeholder="example.com"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500"
              />
              <button
                onClick={addDomain}
                disabled={!newDomain.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium"
              >
                Add
              </button>
            </div>
            {allowedDomains.length > 0 ? (
              <div className="space-y-1">
                {allowedDomains.map((domain) => (
                  <div
                    key={domain}
                    className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded px-3 py-1.5"
                  >
                    <span className="text-sm font-mono text-gray-300">{domain}</span>
                    <button
                      onClick={() => removeDomain(domain)}
                      className="text-gray-500 hover:text-red-400 text-sm ml-2"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600 italic">All domains (no filter)</p>
            )}
          </section>

          {/* PII Sanitization */}
          <section>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              PII Sanitization
            </h2>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={sanitizationEnabled}
                onChange={(e) => setSanitizationEnabled(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-sm">Enable PII redaction in captured data</span>
            </label>
            {sanitizationEnabled && (
              <div className="ml-5 space-y-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Quick preset</label>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) applyPreset(e.target.value as PatternPresetName);
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                  >
                    <option value="">Select a preset...</option>
                    {(Object.keys(PRESET_LABELS) as PatternPresetName[]).map((key) => (
                      <option key={key} value={key}>
                        {PRESET_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  {ALL_PATTERNS.map((pattern) => (
                    <label key={pattern} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={sanitizationPatterns.includes(pattern)}
                        onChange={() => togglePattern(pattern)}
                        className="accent-blue-500"
                      />
                      <span className="text-xs text-gray-300">
                        {PATTERN_LABELS[pattern] ?? pattern}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Session Replay */}
          <section>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Session Replay
            </h2>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={replayEnabled}
                onChange={(e) => setReplayEnabled(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-sm">Enable session replay recording</span>
            </label>
            {replayEnabled && (
              <>
                <p className="text-xs text-yellow-400 mt-1 ml-5">
                  Session replay may slightly impact page performance.
                </p>
                <div className="mt-3 ml-5">
                  <label className="block text-xs text-gray-400 mb-1">Input value masking</label>
                  <select
                    value={replayInputMasking}
                    onChange={(e) =>
                      setReplayInputMasking(e.target.value as Settings['replayInputMasking'])
                    }
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
                  >
                    <option value="all">Mask all input values (safest)</option>
                    <option value="pii-only">
                      PII-only — show search/filter, mask emails/phones
                    </option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    'all' replaces every input value with asterisks. 'pii-only' keeps non-sensitive
                    text readable in the replay; password fields are always masked.
                  </p>
                </div>
              </>
            )}
          </section>

          {/* Buffer Sizes */}
          <section>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Capture Buffers
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Max console entries ({maxConsoleEntries})
                </label>
                <input
                  type="range"
                  min={10}
                  max={500}
                  step={10}
                  value={maxConsoleEntries}
                  onChange={(e) => setMaxConsoleEntries(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Max network entries ({maxNetworkEntries})
                </label>
                <input
                  type="range"
                  min={10}
                  max={500}
                  step={10}
                  value={maxNetworkEntries}
                  onChange={(e) => setMaxNetworkEntries(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>
          </section>

          {/* Status Messages */}
          {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
          {status === 'saved' && (
            <p className="text-green-400 text-sm">Settings saved and validated.</p>
          )}

          <button
            onClick={handleSave}
            disabled={!baseUrl || !apiKey || isBusy}
            className={`w-full py-2 rounded text-sm font-medium ${
              !baseUrl || !apiKey || isBusy
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {status === 'saving' ? 'Validating...' : 'Save Settings'}
          </button>

          <p className="text-xs text-gray-500 text-center mt-4">
            BugSpotter v{chrome.runtime.getManifest().version} by{' '}
            <a
              href="https://apexbridge.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              Apex Bridge Technology
            </a>
            {' · '}
            <a
              href="https://apexbridge.tech/extension/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
