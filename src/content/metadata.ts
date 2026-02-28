/**
 * Enhanced browser/OS metadata detection
 * Ported from bugspotter-sdk/src/capture/metadata.ts
 */

import type { BrowserMetadata } from '@/types';
import type { Sanitizer } from '@bugspotter/common';

interface BrowserPattern {
  pattern: string;
  exclude?: string;
  name: string;
}

interface OSPattern {
  patterns: string[];
  name: string;
}

const BROWSER_PATTERNS: readonly BrowserPattern[] = [
  { pattern: 'Edg', name: 'Edge' },
  { pattern: 'Chrome', exclude: 'Edge', name: 'Chrome' },
  { pattern: 'Firefox', name: 'Firefox' },
  { pattern: 'Safari', exclude: 'Chrome', name: 'Safari' },
];

const OS_PATTERNS: readonly OSPattern[] = [
  { patterns: ['iPhone', 'iPad'], name: 'iOS' },
  { patterns: ['Android'], name: 'Android' },
  { patterns: ['Win'], name: 'Windows' },
  { patterns: ['Mac'], name: 'macOS' },
  { patterns: ['Linux'], name: 'Linux' },
];

function detectBrowser(): string {
  const ua = navigator.userAgent;
  for (const { pattern, exclude, name } of BROWSER_PATTERNS) {
    if (ua.includes(pattern) && (!exclude || !ua.includes(exclude))) {
      return name;
    }
  }
  return 'Unknown';
}

function detectOS(): string {
  const ua = navigator.userAgent;
  for (const { patterns, name } of OS_PATTERNS) {
    if (patterns.some((p) => ua.includes(p))) {
      return name;
    }
  }
  return 'Unknown';
}

export function captureMetadata(sanitizer?: Sanitizer): BrowserMetadata {
  const meta: BrowserMetadata = {
    userAgent: navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    url: window.location.href,
    timestamp: Date.now(),
    platform: navigator.platform,
    language: navigator.language,
    screen: { width: screen.width, height: screen.height },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    browser: detectBrowser(),
    os: detectOS(),
    version: '',
  };

  if (sanitizer) {
    meta.url = sanitizer.sanitizeString(meta.url);
    meta.userAgent = sanitizer.sanitizeString(meta.userAgent);
  }

  return meta;
}
