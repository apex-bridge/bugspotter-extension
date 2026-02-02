import type { Settings } from '@/types';

const SETTINGS_KEY = 'bugspotter_settings';

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  return result[SETTINGS_KEY] ?? { baseUrl: '', apiKey: '' };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
}

export async function getSessionData<T>(key: string): Promise<T | null> {
  const result = await chrome.storage.session.get(key);
  return result[key] ?? null;
}

export async function setSessionData<T>(key: string, data: T): Promise<void> {
  await chrome.storage.session.set({ [key]: data });
}
