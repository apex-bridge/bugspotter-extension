# BugSpotter — Chrome Web Store Asset Requirements

## Required Assets

### 1. Store Icon

- **Size:** 128x128 px (PNG)
- **Status:** Already exists at `public/icons/icon-128.png`
- **Note:** Ensure it looks good on both light and dark backgrounds. No excessive whitespace.

### 2. Screenshots (minimum 1, maximum 5)

- **Size:** 1280x800 px or 640x400 px (PNG or JPEG)
- **Required:** At least 1 screenshot

**Recommended screenshots (in order):**

| #   | Screenshot                      | What to Show                                                                                                                                                               |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------- |
| 1   | **Popup with report form**      | Extension popup open on a real-looking website, with title filled in, priority set to "High", screenshot preview visible, diagnostics bar showing "Console: 12             | Network: 8 | Replay: ON" |
| 2   | **Annotation overlay**          | Full-screen annotation mode with a rectangle drawn around a UI bug, an arrow pointing to an error message, using red color. Show the toolbar with tools and colors visible |
| 3   | **Options page — PII settings** | Options page showing the "Kazakhstan" PII preset selected, with IIN/email/phone toggles enabled. Shows the domain allowlist with 2-3 example domains                       |
| 4   | **Admin dashboard**             | BugSpotter admin panel showing a bug report with the annotated screenshot, console logs tab, and session replay player                                                     |
| 5   | **Before/After comparison**     | Split image: left side shows a vague Slack message "checkout is broken", right side shows BugSpotter report with full context                                              |

### 3. Promotional Tile (Small)

- **Size:** 440x280 px (PNG or JPEG)
- **Required:** Yes
- **Content:** BugSpotter logo + tagline "Bug Reports with Context" on a clean background

### 4. Promotional Tile (Large) — Optional but Recommended

- **Size:** 920x680 px (PNG or JPEG)
- **Content:** Hero image showing the extension popup, annotation overlay, and admin dashboard in a composite layout

### 5. Marquee Promotional Tile — Optional

- **Size:** 1400x560 px (PNG or JPEG)
- **Content:** Wide banner with key features listed as icons/badges

---

## Screenshot Capture Guide

### Tools

- Use Chrome DevTools device toolbar to set exact viewport size (1280x800)
- Or use a screenshot tool like CleanShot, Greenshot, or Chrome's built-in screenshot

### Tips

- Use a clean, professional-looking website as the background (not a blank page)
- Fill in realistic-looking data (not "test123" or "asdf")
- Make sure the BugSpotter popup/overlay is clearly visible
- Use the dark theme popup (it's the default and looks better in screenshots)
- Avoid showing real API keys or sensitive data
- Add subtle callout annotations if needed (arrows, labels) to highlight features

### Suggested Background Sites for Screenshots

- A clean dashboard UI (e.g., from a template)
- A simple e-commerce product page
- A banking/fintech dashboard (relevant for KZ market)

---

## Text Assets

### Support URL

https://apexbridge.tech/support (or create a dedicated page)

### Privacy Policy URL

Host the PRIVACY_POLICY.md content at a public URL, e.g.:

- https://apexbridge.tech/extension/privacy-policy
- Or use a GitHub Pages URL

### Homepage URL

https://apexbridge.tech

---

## Pricing

Free

## Regions

All regions (or restrict to specific countries if needed)

## Mature Content

No

---

## Publishing Checklist

- [ ] Register Chrome Web Store developer account ($5 one-time fee)
- [ ] Build production extension: `pnpm build`
- [ ] Create ZIP of the `dist/` folder (not the source)
- [ ] Upload ZIP to Chrome Web Store Developer Dashboard
- [ ] Fill in store listing fields from STORE_LISTING.md
- [ ] Upload all screenshots (1280x800)
- [ ] Upload promotional tiles
- [ ] Set privacy policy URL (must be publicly accessible)
- [ ] Fill in permissions justifications from STORE_LISTING.md
- [ ] Complete data use disclosure from STORE_LISTING.md
- [ ] Set category to "Developer Tools"
- [ ] Set language to English
- [ ] Submit for review
- [ ] Expected review time: 1-3 business days (can take up to 2 weeks)
