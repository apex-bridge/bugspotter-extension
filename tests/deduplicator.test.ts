import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BugReportDeduplicator } from '@bugspotter/common';

describe('utils/deduplicator', () => {
  let dedup: BugReportDeduplicator;

  beforeEach(() => {
    dedup = new BugReportDeduplicator({ windowMs: 5000, maxCacheSize: 10, enabled: true });
  });

  afterEach(() => {
    dedup.destroy();
  });

  it('returns false for first submission', () => {
    expect(dedup.isDuplicate('Bug title', 'description')).toBe(false);
  });

  it('detects duplicate after marking complete', () => {
    dedup.markInProgress('Bug title', 'description');
    dedup.markComplete('Bug title', 'description');
    expect(dedup.isDuplicate('Bug title', 'description')).toBe(true);
  });

  it('blocks while in-progress (double-click prevention)', () => {
    dedup.markInProgress('Bug title', 'description');
    expect(dedup.isDuplicate('Bug title', 'description')).toBe(true);
  });

  it('allows different reports', () => {
    dedup.markInProgress('Bug A', 'desc');
    dedup.markComplete('Bug A', 'desc');
    expect(dedup.isDuplicate('Bug B', 'other desc')).toBe(false);
  });

  it('allows resubmission after window expires', () => {
    vi.useFakeTimers();
    try {
      dedup.markInProgress('Bug title', 'description');
      dedup.markComplete('Bug title', 'description');
      expect(dedup.isDuplicate('Bug title', 'description')).toBe(true);

      vi.advanceTimersByTime(6000);
      expect(dedup.isDuplicate('Bug title', 'description')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts oldest entry when cache is full', () => {
    for (let i = 0; i < 10; i++) {
      dedup.markInProgress(`Bug ${i}`, 'desc');
      dedup.markComplete(`Bug ${i}`, 'desc');
    }
    expect(dedup.cacheSize).toBe(10);

    dedup.markInProgress('Bug 10', 'desc');
    dedup.markComplete('Bug 10', 'desc');
    // Should still be within limits
    expect(dedup.cacheSize).toBeLessThanOrEqual(10);
  });

  it('clears all state', () => {
    dedup.markInProgress('Bug', 'desc');
    dedup.markComplete('Bug', 'desc');
    dedup.clear();
    expect(dedup.isDuplicate('Bug', 'desc')).toBe(false);
    expect(dedup.cacheSize).toBe(0);
  });

  it('does nothing when disabled', () => {
    const disabled = new BugReportDeduplicator({ enabled: false });
    disabled.markInProgress('Bug', 'desc');
    expect(disabled.isDuplicate('Bug', 'desc')).toBe(false);
    disabled.destroy();
  });
});
