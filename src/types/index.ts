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
  responseHeaders?: Record<string, string>;
  requestBody?: string;
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
  source: 'extension' | 'sdk' | 'api';
  report: {
    console: ConsoleEntry[];
    network: NetworkEntry[];
    metadata: BrowserMetadata;
  };
  hasScreenshot: boolean;
  hasReplay: boolean;
  /**
   * Set by the deflection panel when the user confirmed "yes, this is
   * the same as #X" before submitting. Backend uses it to set
   * `duplicate_of` + `metadata.deflection_source = 'extension_user_confirmed'`.
   * `null` / undefined when the user didn't deflect.
   */
  deflected_to_canonical_id?: string | null;
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

export type ReplayInputMasking = 'all' | 'pii-only';

export interface Settings {
  baseUrl: string;
  apiKey: string;
  allowedDomains: string[];
  sanitizationEnabled: boolean;
  sanitizationPatterns: string[];
  replayEnabled: boolean;
  /**
   * How aggressively to mask values typed into input/textarea/select during
   * replay capture.
   * - 'all'      → every input value replaced with asterisks (rrweb default,
   *                safest, hides search/filter queries too).
   * - 'pii-only' → only password-type inputs are masked unconditionally;
   *                other input values are routed through the PII sanitizer,
   *                so emails / phones / etc. are still redacted by pattern
   *                but search queries stay readable in the replay.
   */
  replayInputMasking: ReplayInputMasking;
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
  | {
      type: 'CAPTURE_DATA';
      data: { console: ConsoleEntry[]; network: NetworkEntry[]; metadata: BrowserMetadata | null };
    }
  | { type: 'START_ANNOTATION'; screenshot: string }
  | { type: 'ANNOTATION_DONE'; data: string }
  | { type: 'ANNOTATION_CANCEL' }
  | {
      type: 'SUBMIT_REPORT';
      data: BugReportPayload & { screenshotDataUrl: string; replayEvents: unknown[] };
    }
  | { type: 'GET_REPLAY_EVENTS' }
  | { type: 'REPLAY_EVENTS'; data: unknown[] }
  | { type: 'START_REPLAY' }
  | { type: 'STOP_REPLAY' }
  | { type: 'REPLAY_APPEND'; events: unknown[] }
  | { type: 'REPLAY_GET_ALL'; tabId?: number }
  | { type: 'REPLAY_CLEAR'; tabId?: number }
  | { type: 'CAPTURE_APPEND_CONSOLE'; entries: ConsoleEntry[]; maxEntries: number }
  | { type: 'CAPTURE_APPEND_NETWORK'; entries: NetworkEntry[]; maxEntries: number }
  | { type: 'CAPTURE_GET_ALL'; tabId?: number }
  | { type: 'CAPTURE_CLEAR'; tabId?: number }
  | { type: 'GET_PENDING_SCREENSHOT' }
  | { type: 'GET_OFFLINE_QUEUE_SIZE' };
