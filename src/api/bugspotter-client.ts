import type { BugReportPayload, CreateReportResponse, Project, Settings } from '@/types';
import { getSettings } from '@/storage/settings';
import { retryWithBackoff, isSecureEndpoint } from '@bugspotter/common';

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const settings = await getSettings();
  if (!settings.baseUrl || !settings.apiKey) {
    throw new Error('BugSpotter URL and API key must be configured in extension options.');
  }

  const url = `${settings.baseUrl.replace(/\/$/, '')}${path}`;

  if (!isSecureEndpoint(url)) {
    throw new Error('BugSpotter requires HTTPS. Insecure endpoints are not allowed.');
  }

  const response = await retryWithBackoff(() =>
    fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': settings.apiKey,
        ...options.headers,
      },
    }),
  );

  if (!response.ok) {
    if (response.status === 401) throw new Error('Invalid API key.');
    if (response.status === 403) throw new Error('Quota exceeded or access denied.');
    if (response.status === 413) throw new Error('File too large.');
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function fetchProjects(): Promise<Project[]> {
  try {
    const result = await apiRequest<{ success: boolean; data: Project[] }>('/api/v1/projects');
    return result.data;
  } catch (err) {
    console.warn('[BugSpotter] fetchProjects failed, using fallback:', err);
    return [{ id: 'api-key-project', name: 'API Key Project' }];
  }
}

export async function createReport(payload: BugReportPayload): Promise<CreateReportResponse> {
  return apiRequest<CreateReportResponse>('/api/v1/reports', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadScreenshot(uploadUrl: string, pngBlob: Blob): Promise<void> {
  if (!isSecureEndpoint(uploadUrl)) {
    throw new Error('Screenshot upload requires HTTPS. Insecure endpoints are not allowed.');
  }
  const response = await retryWithBackoff(() =>
    fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: pngBlob,
    }),
  );
  if (!response.ok) {
    throw new Error(`Screenshot upload failed: ${response.status}`);
  }
}

export async function uploadReplay(uploadUrl: string, gzipBlob: Blob): Promise<void> {
  if (!isSecureEndpoint(uploadUrl)) {
    throw new Error('Replay upload requires HTTPS. Insecure endpoints are not allowed.');
  }
  const response = await retryWithBackoff(() =>
    fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/gzip' },
      body: gzipBlob,
    }),
  );
  if (!response.ok) {
    throw new Error(`Replay upload failed: ${response.status}`);
  }
}

export async function confirmUpload(
  bugId: string,
  fileType: 'screenshot' | 'replay' = 'screenshot',
): Promise<void> {
  await apiRequest(`/api/v1/reports/${bugId}/confirm-upload`, {
    method: 'POST',
    body: JSON.stringify({ fileType }),
  });
}

export async function validateConnection(settings: Settings): Promise<boolean> {
  if (!settings.baseUrl || !settings.apiKey) return false;

  const baseUrl = settings.baseUrl.replace(/\/$/, '');
  const healthUrl = `${baseUrl}/health`;

  if (!isSecureEndpoint(healthUrl)) return false;

  try {
    const response = await fetch(healthUrl, {
      headers: { 'X-API-Key': settings.apiKey },
    });
    return response.ok;
  } catch {
    return false;
  }
}
