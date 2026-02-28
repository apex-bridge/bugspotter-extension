export interface ConsoleEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: number;
  args: unknown[];
  stack?: string;
}

export interface NetworkEntry {
  url: string;
  method: string;
  status: number;
  statusText: string;
  duration: number;
  timestamp: number;
  headers: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  error?: string;
}

export interface BrowserMetadata {
  userAgent: string;
  viewport: { width: number; height: number };
  url: string;
  timestamp: number;
  platform: string;
  language: string;
  screen: { width: number; height: number };
  timezone: string;
  browser: string;
  os: string;
  version: string;
}

export interface BugReportPayload {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  report: {
    console: ConsoleEntry[];
    network: NetworkEntry[];
    metadata: BrowserMetadata;
  };
  hasScreenshot: boolean;
  hasReplay: boolean;
}

export interface CreateReportResponse {
  success: boolean;
  data: {
    id: string;
    project_id: string;
    title: string;
    presignedUrls: {
      screenshot: {
        uploadUrl: string;
        storageKey: string;
      };
      replay?: {
        uploadUrl: string;
        storageKey: string;
      };
    };
  };
}

export interface Project {
  id: string;
  name: string;
}

export interface Settings {
  baseUrl: string;
  apiKey: string;
  allowedDomains: string[];
  sanitizationEnabled: boolean;
  sanitizationPatterns: string[];
  replayEnabled: boolean;
  maxConsoleEntries: number;
  maxNetworkEntries: number;
}

export interface CaptureData {
  screenshot: string | null;
  annotatedScreenshot: Blob | null;
  consoleLogs: ConsoleEntry[];
  networkRequests: NetworkEntry[];
  metadata: BrowserMetadata | null;
}

// Message types between extension components
export type MessageType =
  | { type: 'CAPTURE_SCREENSHOT' }
  | { type: 'SCREENSHOT_CAPTURED'; data: string }
  | { type: 'GET_CAPTURE_DATA' }
  | { type: 'CAPTURE_DATA'; data: { console: ConsoleEntry[]; network: NetworkEntry[] } }
  | { type: 'CONSOLE_ENTRY'; data: ConsoleEntry }
  | { type: 'NETWORK_ENTRY'; data: NetworkEntry }
  | { type: 'START_ANNOTATION'; screenshot: string }
  | { type: 'ANNOTATION_DONE'; data: string }
  | { type: 'ANNOTATION_CANCEL' }
  | { type: 'SUBMIT_REPORT'; data: BugReportPayload & { screenshotDataUrl: string } }
  | { type: 'GET_REPLAY_EVENTS' }
  | { type: 'REPLAY_EVENTS'; data: unknown[] }
  | { type: 'START_REPLAY' }
  | { type: 'STOP_REPLAY' };
