import { defineConfig, type Plugin } from 'vite';
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
 */
function rrwebDecodeInlineWorkers(): Plugin {
  return {
    name: 'rrweb-decode-inline-workers',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('rrweb')) return null;

      const encodedMatch = code.match(/const encodedJs = "([^"]+)"/);
      if (!encodedMatch) return null;

      const decoded = Buffer.from(encodedMatch[1], 'base64').toString('utf8');

      // Replace the base64 blob + Blob/URL worker creation with a plain
      // string that is used directly in a data-URL fallback.  The decoded
      // source is kept as a readable template literal so reviewers (and the
      // Chrome Web Store automated scanner) can inspect it.
      const readable = decoded.replace(/`/g, '\\`').replace(/\$/g, '\\$');
      const replacement = `const encodedJs = btoa(\`${readable}\`)`;

      return {
        code: code.replace(`const encodedJs = "${encodedMatch[1]}"`, replacement),
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
