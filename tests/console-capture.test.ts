import { describe, it, expect, beforeEach, vi } from 'vitest';

let initConsoleCapture: (maxEntries?: number) => void;
let getConsoleLogs: () => {
  level: string;
  message: string;
  timestamp: number;
  args: unknown[];
  stack?: string;
}[];

describe('content/console-capture', () => {
  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('@/content/console-capture');
    initConsoleCapture = mod.initConsoleCapture;
    getConsoleLogs = mod.getConsoleLogs;
  });

  it('captures console.log calls', () => {
    initConsoleCapture();
    console.log('test message');
    const logs = getConsoleLogs();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const last = logs[logs.length - 1];
    expect(last.level).toBe('log');
    expect(last.message).toBe('test message');
  });

  it('captures console.error calls with stack trace', () => {
    initConsoleCapture();
    console.error('error happened');
    const logs = getConsoleLogs();
    const errorLog = logs.find((l) => l.message === 'error happened');
    expect(errorLog).toBeDefined();
    expect(errorLog!.level).toBe('error');
    expect(errorLog!.stack).toBeDefined();
  });

  it('captures console.warn calls with stack trace', () => {
    initConsoleCapture();
    console.warn('warning');
    const logs = getConsoleLogs();
    const warnLog = logs.find((l) => l.message === 'warning');
    expect(warnLog).toBeDefined();
    expect(warnLog!.level).toBe('warn');
    expect(warnLog!.stack).toBeDefined();
  });

  it('defaults to 100 entries buffer', () => {
    initConsoleCapture();
    for (let i = 0; i < 120; i++) {
      console.log(`message ${i}`);
    }
    const logs = getConsoleLogs();
    expect(logs.length).toBe(100);
  });

  it('respects custom buffer size', () => {
    initConsoleCapture(30);
    for (let i = 0; i < 50; i++) {
      console.log(`message ${i}`);
    }
    const logs = getConsoleLogs();
    expect(logs.length).toBe(30);
  });

  it('filters [BugSpotter] prefixed logs (except errors)', () => {
    initConsoleCapture();
    console.log('[BugSpotter] internal debug');
    console.error('[BugSpotter] internal error');
    const logs = getConsoleLogs();
    expect(logs.find((l) => l.message === '[BugSpotter] internal debug')).toBeUndefined();
    expect(logs.find((l) => l.message === '[BugSpotter] internal error')).toBeDefined();
  });

  it('serializes non-string args', () => {
    initConsoleCapture();
    console.log('obj', { foo: 'bar' });
    const logs = getConsoleLogs();
    const last = logs[logs.length - 1];
    expect(last.message).toContain('foo');
  });

  it('includes timestamp', () => {
    initConsoleCapture();
    const before = Date.now();
    console.log('timed');
    const logs = getConsoleLogs();
    const last = logs[logs.length - 1];
    expect(last.timestamp).toBeGreaterThanOrEqual(before);
    expect(last.timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('returns a copy of the buffer', () => {
    initConsoleCapture();
    console.log('test');
    const logs1 = getConsoleLogs();
    const logs2 = getConsoleLogs();
    expect(logs1).not.toBe(logs2);
    expect(logs1).toEqual(logs2);
  });
});
