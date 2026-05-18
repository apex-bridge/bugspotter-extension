# BugSpotter Chrome Extension

Manifest V3, Vite + React + TypeScript. Publishes to the Chrome Web Store.

## Structure

- `src/background/service-worker.ts` — MV3 service worker. Short-lived; no persistent globals — use `chrome.storage` for anything that must survive a worker eviction.
- `src/content/content-main.ts` — content script, injected on `<all_urls>` at `document_start`.
- `src/popup/` — toolbar popup UI.
- `src/options/` — options page, opens in its own tab (not a sidebar).
- `src/storage/settings.ts` — source of truth for user config (API key, base URL, PII patterns, replay toggles).

## Storage conventions (don't mix these up)

- `chrome.storage.sync` — user settings (`bugspotter_settings` key). Roams with the Google account.
- `chrome.storage.local` — transient / larger data (pending screenshots, offline queue).
- `chrome.storage.session` — in-memory state that survives SW eviction but not browser restart; used for short-lived per-tab data (helpers in `src/storage/settings.ts`).
- MV3 service workers can be evicted at any moment; never stash state in module-level variables and expect it to be there on the next event. Read from storage each time.

## Shared PII patterns

PII regex patterns come from `@bugspotter/common` (separate repo). Don't fork them locally — changes belong in `bugspotter-common` so the backend's sanitizer and the extension stay consistent.

## Build-time secrets are public

`DEMO_INSTANCE.apiKey` is injected via `VITE_DEMO_API_KEY` and **bundled into the published extension**. Only use rate-limited, scoped demo tokens here — the value is readable by anyone who unzips the `.crx`. Privileged keys must never flow through Vite env.

## Tests

- `pnpm test` — Vitest unit tests (DOM + utilities).
- `pnpm test:e2e` — Playwright against the BUILT extension. Runs `pnpm build` first; if you skip that, you'll E2E the stale dist.

## Deep-link (options page prefill) — not yet implemented

Phase 3 of the self-service-signup plan (`bugspotter-public` backend) will add support for the options page to read URL params (`?apiUrl=...&apiKey=...`) and prefill `chrome.storage.sync`. When adding it:

- Validate `apiUrl` is HTTPS.
- Show a confirmation screen before overwriting existing settings.
- Don't auto-save — require an explicit click.

## Commands

```bash
pnpm dev           # Vite dev server for popup/options
pnpm build         # tsc + vite build → dist/
pnpm test          # Vitest
pnpm test:e2e      # Playwright (requires dist)
pnpm lint          # ESLint, src + tests
```
