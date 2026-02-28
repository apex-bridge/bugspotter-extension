import { describe, it, expect, vi } from 'vitest';
import { TimeBasedBuffer, type ReplayEvent } from '@bugspotter/common';

function makeEvent(type: number, timestampOffset = 0): ReplayEvent {
  return { type, timestamp: Date.now() + timestampOffset, data: {} };
}

describe('utils/time-based-buffer', () => {
  it('stores events', () => {
    const buf = new TimeBasedBuffer(60);
    buf.add(makeEvent(3));
    buf.add(makeEvent(3));
    expect(buf.getEvents().length).toBe(2);
  });

  it('prunes events older than duration', () => {
    vi.useFakeTimers();
    try {
      const buf = new TimeBasedBuffer(5); // 5 seconds

      buf.add(makeEvent(3));
      vi.advanceTimersByTime(6000);
      buf.add(makeEvent(3)); // trigger prune

      const events = buf.getEvents();
      expect(events.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves FullSnapshot even if older than cutoff', () => {
    vi.useFakeTimers();
    try {
      const buf = new TimeBasedBuffer(5);

      // Add a full snapshot (type 2)
      buf.add(makeEvent(2));
      vi.advanceTimersByTime(6000);
      buf.add(makeEvent(3)); // newer event

      const events = buf.getEvents();
      // The full snapshot should be preserved
      expect(events.some((e) => e.type === 2)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears all events', () => {
    const buf = new TimeBasedBuffer(60);
    buf.add(makeEvent(3));
    buf.add(makeEvent(2));
    buf.clear();
    expect(buf.getEvents()).toEqual([]);
    expect(buf.size).toBe(0);
  });

  it('returns a copy of events', () => {
    const buf = new TimeBasedBuffer(60);
    buf.add(makeEvent(3));
    const a = buf.getEvents();
    const b = buf.getEvents();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
