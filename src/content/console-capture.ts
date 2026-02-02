import type { ConsoleEntry } from '@/types';

const MAX_ENTRIES = 50;
const buffer: ConsoleEntry[] = [];

const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

function captureEntry(level: ConsoleEntry['level'], args: unknown[]) {
  const entry: ConsoleEntry = {
    level,
    message: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
    timestamp: Date.now(),
    args: args.map((a) => {
      try {
        return JSON.parse(JSON.stringify(a));
      } catch {
        return String(a);
      }
    }),
  };

  if (buffer.length >= MAX_ENTRIES) {
    buffer.shift();
  }
  buffer.push(entry);

  chrome.runtime.sendMessage({ type: 'CONSOLE_ENTRY', data: entry }).catch(() => {
    // Extension context may be invalidated
  });
}

export function initConsoleCapture() {
  const levels = ['log', 'info', 'warn', 'error', 'debug'] as const;
  for (const level of levels) {
    console[level] = (...args: unknown[]) => {
      captureEntry(level, args);
      originalConsole[level].apply(console, args);
    };
  }
}

export function getConsoleLogs(): ConsoleEntry[] {
  return [...buffer];
}
