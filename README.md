# BugSpotter Browser Extension

Chrome extension (Manifest V3) for capturing bug reports and submitting them to a BugSpotter instance. Captures screenshots, console logs, network requests, and browser metadata with built-in annotation tools.

## Features

- One-click screenshot capture with annotation overlay (rectangle, arrow, freehand, text)
- Auto-capture of console logs and network requests (last 50 each)
- Full browser metadata collection
- Project selector with priority picker
- Submit directly to BugSpotter via REST API

## Tech Stack

- Chrome Extension Manifest V3
- TypeScript, React, Tailwind CSS
- Vite + [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin)
- Vitest for testing

## Installation

### From GitHub Releases (recommended)

1. Download the latest `bugspotter-extension-v*.zip` from [Releases](../../releases)
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the unzipped folder

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
