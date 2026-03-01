/**
 * Compression utilities — gzip via native CompressionStream.
 * Zero-cost alternative to pako (~45KB saved).
 * Available in Chrome 80+.
 */

export async function gzipCompress(data: string): Promise<Blob> {
  const encoder = new TextEncoder();
  const stream = new Blob([encoder.encode(data)]).stream();
  const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));

  return new Response(compressedStream).blob();
}

export async function gzipDecompress(blob: Blob): Promise<string> {
  const stream = blob.stream();
  const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(decompressedStream).text();
  return text;
}
