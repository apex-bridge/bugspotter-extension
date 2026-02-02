import type { BugReportPayload, CreateReportResponse, Project, Settings } from '@/types';
import { getSettings } from '@/storage/settings';

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const settings = await getSettings();
  if (!settings.baseUrl || !settings.apiKey) {
    throw new Error('BugSpotter URL and API key must be configured in extension options.');
  }

  const url = `${settings.baseUrl.replace(/\/$/, '')}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': settings.apiKey,
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('Invalid API key.');
    if (response.status === 403) throw new Error('Quota exceeded or access denied.');
    if (response.status === 413) throw new Error('File too large.');
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function fetchProjects(): Promise<Project[]> {
  const result = await apiRequest<{ success: boolean; data: Project[] }>('/api/v1/projects');
  return result.data;
}

export async function createReport(payload: BugReportPayload): Promise<CreateReportResponse> {
  return apiRequest<CreateReportResponse>('/api/v1/reports', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadScreenshot(uploadUrl: string, pngBlob: Blob): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: pngBlob,
  });
  if (!response.ok) {
    throw new Error(`Screenshot upload failed: ${response.status}`);
  }
}

export async function confirmUpload(bugId: string): Promise<void> {
  await apiRequest(`/api/v1/reports/${bugId}/confirm-upload`, {
    method: 'POST',
    body: JSON.stringify({ fileType: 'screenshot' }),
  });
}

export async function validateConnection(settings: Settings): Promise<boolean> {
  try {
    const url = `${settings.baseUrl.replace(/\/$/, '')}/api/v1/projects`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': settings.apiKey,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
