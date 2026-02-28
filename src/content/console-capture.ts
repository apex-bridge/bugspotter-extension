/**
 * Enhanced console capture with CircularBuffer, stack traces, filtering, and sanitization.
 * Ported from bugspotter-sdk/src/capture/console.ts
 */

import type { ConsoleEntry } from '@/types';
import { CircularBuffer } from '@bugspotter/common';
import type { Sanitizer } from '@bugspotter/common';

const BUGSPOTTER_LOG_PREFIX = '[BugSpotter]';

let buffer: CircularBuffer<ConsoleEntry>;
let sanitizer: Sanitizer | null = null;

const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

function formatArgs(args: unknown[]): string {
  const processedArgs = sanitizer ? sanitizer.sanitizeConsoleArgs(args) : args;

  return processedArgs
    .map((arg) => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return `[${(arg as { constructor?: { name?: string } }).constructor?.name || 'Object'}]`;
        }
      }
      return String(arg);
    })
    .join(' ');
}

function captureStack(): string | undefined {
  const stack = new Error().stack;
  // Remove first 4 lines: Error, captureStack, captureEntry, console[level]
  return stack?.split('\n').slice(4).join('\n');
}

function shouldFilter(message: string, level: ConsoleEntry['level']): boolean {
  // Always keep errors for debugging
  if (level === 'error') return false;
  // Filter our own SDK logs
  return message.startsWith(BUGSPOTTER_LOG_PREFIX);
}

function captureEntry(level: ConsoleEntry['level'], args: unknown[]) {
  const message = formatArgs(args);

  if (shouldFilter(message, level)) return;

  const entry: ConsoleEntry = {
    level,
    message,
    timestamp: Date.now(),
    args: args.map((a) => {
      try {
        return JSON.parse(JSON.stringify(a));
      } catch {
        return String(a);
      }
    }),
  };

  // Capture stack trace for error and warn levels
  if (level === 'error' || level === 'warn') {
    const stack = captureStack();
    if (stack) {
      entry.stack = sanitizer ? (sanitizer.sanitize(stack) as string) : stack;
    }
  }

  buffer.add(entry);

  chrome.runtime.sendMessage({ type: 'CONSOLE_ENTRY', data: entry }).catch(() => {
    // Extension context may be invalidated
  });
}

export function initConsoleCapture(maxEntries = 100, sanitizerInstance?: Sanitizer) {
  buffer = new CircularBuffer<ConsoleEntry>(maxEntries);
  sanitizer = sanitizerInstance ?? null;

  const levels = ['log', 'info', 'warn', 'error', 'debug'] as const;
  for (const level of levels) {
    console[level] = (...args: unknown[]) => {
      captureEntry(level, args);
      originalConsole[level].apply(console, args);
    };
  }
}

export function getConsoleLogs(): ConsoleEntry[] {
  return buffer.getAll();
}

export function destroyConsoleCapture() {
  const levels = ['log', 'info', 'warn', 'error', 'debug'] as const;
  for (const level of levels) {
    console[level] = originalConsole[level];
  }
}
