/**
 * Compression utilities — gzip via native CompressionStream + image optimization.
 * Zero-cost alternative to pako (~45KB saved).
 * Available in Chrome 80+.
 */

const IMAGE_MAX_WIDTH = 2560;
const IMAGE_MAX_HEIGHT = 1440;
const IMAGE_WEBP_QUALITY = 0.92;
const IMAGE_JPEG_QUALITY = 0.92;
const IMAGE_LOAD_TIMEOUT = 3000;

let webpSupportCache: boolean | null = null;

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

function supportsWebP(): boolean {
  if (webpSupportCache !== null) return webpSupportCache;
  try {
    const canvas = document.createElement('canvas');
    webpSupportCache = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpSupportCache = false;
  }
  return webpSupportCache;
}

function loadImage(base64: string, timeout: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('Image load timeout')), timeout);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Failed to load image'));
    };
    img.src = base64;
  });
}

/**
 * Optimize and compress a screenshot image.
 * Converts to WebP if supported, resizes if larger than 2K, preserving aspect ratio.
 * Returns the original base64 on failure.
 */
export async function compressImage(base64: string): Promise<string> {
  try {
    const img = await loadImage(base64, IMAGE_LOAD_TIMEOUT);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return base64;

    let w = img.naturalWidth;
    let h = img.naturalHeight;

    if (w > IMAGE_MAX_WIDTH) {
      h = (h * IMAGE_MAX_WIDTH) / w;
      w = IMAGE_MAX_WIDTH;
    }
    if (h > IMAGE_MAX_HEIGHT) {
      w = (w * IMAGE_MAX_HEIGHT) / h;
      h = IMAGE_MAX_HEIGHT;
    }

    canvas.width = w;
    canvas.height = h;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    return supportsWebP()
      ? canvas.toDataURL('image/webp', IMAGE_WEBP_QUALITY)
      : canvas.toDataURL('image/jpeg', IMAGE_JPEG_QUALITY);
  } catch {
    return base64; // Fallback to original on failure
  }
}
