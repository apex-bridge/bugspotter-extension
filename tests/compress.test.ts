import { describe, it, expect } from 'vitest';
import { gzipCompress, gzipDecompress } from '@/utils/compress';

// CompressionStream and Blob.stream() are browser-only APIs not available in jsdom.
// These tests verify the logic works in a real browser environment.
const hasStreamSupport =
  typeof CompressionStream !== 'undefined' && typeof Blob.prototype.stream === 'function';

describe.skipIf(!hasStreamSupport)('utils/compress', () => {
  it('compresses and decompresses round-trip', async () => {
    const original = JSON.stringify({ events: [{ type: 3, data: 'test' }] });
    const compressed = await gzipCompress(original);
    expect(compressed).toBeInstanceOf(Blob);
    expect(compressed.size).toBeGreaterThan(0);

    const decompressed = await gzipDecompress(compressed);
    expect(decompressed).toBe(original);
  });

  it('compresses to smaller size for large data', async () => {
    const large = JSON.stringify(
      Array.from({ length: 1000 }, (_, i) => ({ index: i, data: 'x'.repeat(100) })),
    );
    const compressed = await gzipCompress(large);
    expect(compressed.size).toBeLessThan(large.length);
  });
});
