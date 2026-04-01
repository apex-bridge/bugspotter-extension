# BugSpotter Browser Extension

Chrome extension (Manifest V3) for capturing bug reports and submitting them to a BugSpotter instance. Captures screenshots, console logs, network requests, and browser metadata with built-in annotation tools.

## Features

- One-click screenshot capture with annotation overlay (rectangle, arrow, freehand, text in 6 colors)
- Auto-capture of console logs and network requests (configurable buffer sizes)
- Session replay recording (optional, powered by rrweb)
- Built-in PII sanitization — auto-redacts emails, phone numbers, credit cards, SSNs, Kazakhstan IIN/BIN, IP addresses, API keys, and passwords
- Preset PII profiles: Kazakhstan, GDPR, PCI DSS, Financial, and more
- Domain allowlist — restrict capture to specific websites
- Offline queue — reports are saved and retried when connection is restored
- Project selector with priority picker (Low, Medium, High, Critical)
- HTTPS-only — refuses to send data over insecure connections
- Submit directly to BugSpotter via REST API

## Tech Stack

- Chrome Extension Manifest V3
- TypeScript, React, Tailwind CSS
- Vite + [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin)
- Vitest for testing

## Installation

### Quick Install

1. **[Download latest release](https://github.com/apex-bridge/bugspotter-extension/releases/latest)** — grab the `bugspotter-extension-v*.zip` file
2. Unzip the downloaded file
3. Open `chrome://extensions` in Chrome
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** and select the unzipped folder

To update: download the new zip, unzip it to the same folder (overwrite), and click the reload icon on the extension card in `chrome://extensions`.

### From Source

#### Prerequisites

- Node.js >= 20
- pnpm

```bash
pnpm install
pnpm build
```

Then load the `dist/` folder as an unpacked extension (see steps 2–4 above).

### Configure

1. Click the extension icon → **Open Options** (or right-click → Options)
2. Enter your BugSpotter instance URL and API key (`bgs_...`)
3. Save — the connection is validated automatically

### Development

```bash
pnpm dev        # Vite dev server with HMR
pnpm test       # Run tests once
pnpm test:watch # Run tests in watch mode
```

## Project Structure

```
src/
├── api/            # BugSpotter API client
├── background/     # Service worker (capture orchestration, API calls)
├── content/        # Content scripts (console & network capture, annotation overlay)
├── options/        # Options page (URL + API key configuration)
├── popup/          # Popup UI (project selector, bug report form)
├── storage/        # chrome.storage wrappers
└── types/          # Shared TypeScript types
```

## Testing

```bash
pnpm test
```

Tests cover the API client, storage module, console capture, and network capture.

## Releases

Pushing a version tag triggers a GitHub Actions workflow that lints, tests, builds, and publishes a zip to GitHub Releases:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Privacy & Data Handling

- All data is sent **only** to the BugSpotter server URL you configure — never to Apex Bridge Technology or any third party.
- PII sanitization runs **locally in your browser** before any data is transmitted.
- Sensitive HTTP headers (Authorization, Cookie, API keys, CSRF tokens) are **never captured**.
- No analytics, telemetry, or tracking of any kind.
- See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for the full privacy policy.

## Permissions

| Permission   | Purpose                                                                             |
| ------------ | ----------------------------------------------------------------------------------- |
| `activeTab`  | Capture a screenshot of the current tab when you click the extension icon           |
| `storage`    | Save your settings (server URL, API key, domain allowlist, preferences)             |
| `tabs`       | Read the active tab's URL and title for bug report metadata                         |
| `scripting`  | Inject console and network capture scripts into the active tab                      |
| `<all_urls>` | Allow bug reporting on any website you choose (controlled by your domain allowlist) |

## Disclaimer

BugSpotter is provided "as is" without warranty of any kind. The extension captures data from web pages you visit and sends it to a server you configure. You are responsible for ensuring that your use of BugSpotter complies with applicable privacy laws and your organization's data handling policies. Do not use BugSpotter on websites where you do not have authorization to capture data.

## License

Copyright 2026 Apex Bridge Technology. All rights reserved.
