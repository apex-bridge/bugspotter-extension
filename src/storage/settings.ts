import type { Settings } from '@/types';
import { getAllPatternNames } from '@bugspotter/common';

const SETTINGS_KEY = 'bugspotter_settings';

// Demo instance configuration — update these when deploying to a new environment.
// Used by the "Connect to Demo" button in the Options page.
export const DEMO_INSTANCE = {
  baseUrl: 'https://api.bugspotter.io',
  apiKey: '', // Set after creating the demo project
  label: 'BugSpotter Cloud',
} as const;

const DEFAULT_SETTINGS: Settings = {
  baseUrl: '',
  apiKey: '',
  allowedDomains: [],
  sanitizationEnabled: true,
  sanitizationPatterns: getAllPatternNames(),
  replayEnabled: false,
  maxConsoleEntries: 100,
  maxNetworkEntries: 50,
};

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY];
  return {
    ...DEFAULT_SETTINGS,
    ...(stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}),
  };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.sync.set({ [SETTINGS_KEY]: { ...current, ...settings } });
}

export async function getSessionData<T>(key: string): Promise<T | null> {
  const result = await chrome.storage.session.get(key);
  return result[key] ?? null;
}

export async function setSessionData<T>(key: string, data: T): Promise<void> {
  await chrome.storage.session.set({ [key]: data });
}
