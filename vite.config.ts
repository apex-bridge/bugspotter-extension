import { defineConfig, type Plugin } from 'vite';
import { Buffer } from 'node:buffer';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import path from 'path';

/**
 * Vite plugin that decodes base64-inlined web workers in rrweb into readable
 * JavaScript.  Chrome Web Store rejects extensions that contain base64-encoded
 * code blobs because they look like obfuscated code.  This plugin replaces the
 * encoded string at build time with the decoded, human-readable source so the
 * bundle passes the "Code Readability Requirements" review.
 *
 * NOTE: The regex below is coupled to rrweb's internal bundling pattern
 * (a `const encodedJs = "..."` assignment). If rrweb changes how it inlines
 * its canvas worker (e.g. different variable name, `let` instead of `const`,
 * or template literals), this plugin will silently stop matching and the
 * base64 blob will reappear in the output. After upgrading rrweb, verify
 * the build output has no long base64 strings in the content script bundle.
 */
function rrwebDecodeInlineWorkers(): Plugin {
  return {
    name: 'rrweb-decode-inline-workers',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('rrweb')) return null;

      const encodedMatch = code.match(/const\s+encodedJs\s*=\s*"([^"]+)"/);
      if (!encodedMatch) return null;

      const decoded = Buffer.from(encodedMatch[1], 'base64').toString('utf8');

      // Replace the inlined base64 blob with a decoded, human-readable
      // JavaScript string. The decoded source is emitted as a normal string
      // literal (via JSON.stringify) so escape sequences are preserved
      // byte-for-byte, and is re-encoded via btoa at runtime in the
      // browser/worker context.
      const replacement = `const encodedJs = btoa(${JSON.stringify(decoded)})`;

      return {
        code: code.replace(encodedMatch[0], replacement),
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [rrwebDecodeInlineWorkers(), react(), crx({ manifest })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
  },
});
