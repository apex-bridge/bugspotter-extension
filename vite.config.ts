import { defineConfig, type Plugin } from 'vite';
import { Buffer } from 'node:buffer';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import path from 'path';

/**
 * Vite plugin that decodes base64-inlined web workers in rrweb into readable
 * JavaScript. Chrome Web Store rejects extensions that contain base64-encoded
 * code blobs because they look like obfuscated code. This plugin replaces the
 * encoded string at build time with the decoded, human-readable source so the
 * bundle passes the "Code Readability Requirements" review.
 *
 * NOTE: The regex below is coupled to rrweb's internal bundling pattern
 * (an `encodedJs = "..."` assignment). If rrweb changes how it inlines its
 * canvas worker (e.g. different variable name or template literals), the
 * closeBundle hook will emit a build warning. After upgrading rrweb, verify
 * the build output has no long base64 strings in the content script bundle.
 */
function rrwebDecodeInlineWorkers(): Plugin {
  let didReplace = false;

  return {
    name: 'rrweb-decode-inline-workers',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('rrweb')) return null;

      const pattern = /(?:const|let|var)\s+encodedJs\s*=\s*['"]([^'"]+)['"]/g;
      let replacementsInFile = 0;

      // Replace every inlined base64 blob with a decoded, human-readable
      // JavaScript string. The decoded source is emitted as a normal string
      // literal (via JSON.stringify) so escape sequences are preserved
      // byte-for-byte, and is re-encoded via btoa at runtime in the
      // browser/worker context.
      const newCode = code.replace(pattern, (match, encoded) => {
        try {
          const decoded = Buffer.from(encoded, 'base64').toString('utf8');
          replacementsInFile += 1;
          return `const encodedJs = btoa(${JSON.stringify(decoded)})`;
        } catch {
          this.warn(`rrweb-decode-inline-workers: failed to decode base64 string in ${id}`);
          return match;
        }
      });

      if (replacementsInFile === 0) return null;

      didReplace = true;
      return {
        code: newCode,
        map: null,
      };
    },
    closeBundle() {
      if (!didReplace) {
        this.warn(
          'rrweb-decode-inline-workers: no base64 worker blob was found in rrweb. ' +
            'The rrweb bundling pattern may have changed — check the build output ' +
            'for long base64 strings before submitting to the Chrome Web Store.',
        );
      }
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
