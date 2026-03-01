import { describe, it, expect } from 'vitest';
import { CircularBuffer } from '@bugspotter/common';

describe('utils/circular-buffer', () => {
  it('stores items up to capacity', () => {
    const buf = new CircularBuffer<number>(3);
    buf.add(1);
    buf.add(2);
    buf.add(3);
    expect(buf.getAll()).toEqual([1, 2, 3]);
    expect(buf.size).toBe(3);
  });

  it('overwrites oldest items when full', () => {
    const buf = new CircularBuffer<number>(3);
    buf.add(1);
    buf.add(2);
    buf.add(3);
    buf.add(4);
    expect(buf.getAll()).toEqual([2, 3, 4]);
    expect(buf.size).toBe(3);
  });

  it('maintains chronological order after wraparound', () => {
    const buf = new CircularBuffer<number>(3);
    for (let i = 1; i <= 7; i++) {
      buf.add(i);
    }
    expect(buf.getAll()).toEqual([5, 6, 7]);
  });

  it('returns empty array when empty', () => {
    const buf = new CircularBuffer<string>(5);
    expect(buf.getAll()).toEqual([]);
    expect(buf.size).toBe(0);
    expect(buf.isEmpty).toBe(true);
  });

  it('clears all items', () => {
    const buf = new CircularBuffer<number>(3);
    buf.add(1);
    buf.add(2);
    buf.clear();
    expect(buf.getAll()).toEqual([]);
    expect(buf.size).toBe(0);
  });

  it('reports isFull correctly', () => {
    const buf = new CircularBuffer<number>(2);
    expect(buf.isFull).toBe(false);
    buf.add(1);
    expect(buf.isFull).toBe(false);
    buf.add(2);
    expect(buf.isFull).toBe(true);
  });

  it('reports capacity', () => {
    const buf = new CircularBuffer<number>(42);
    expect(buf.capacity).toBe(42);
  });

  it('throws on invalid maxSize', () => {
    expect(() => new CircularBuffer(0)).toThrow();
    expect(() => new CircularBuffer(-1)).toThrow();
  });

  it('returns a copy, not a reference', () => {
    const buf = new CircularBuffer<number>(3);
    buf.add(1);
    const a = buf.getAll();
    const b = buf.getAll();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
