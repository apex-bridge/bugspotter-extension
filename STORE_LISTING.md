# BugSpotter — Chrome Web Store Listing

## Extension Name

BugSpotter — Bug Reports with Context

## Short Description (132 chars max)

Capture bug reports with annotated screenshots, session replay, console logs, and network data. Built-in PII redaction.

## Detailed Description

**Stop guessing. Start seeing.**

BugSpotter captures everything developers need to reproduce a bug — in one click. No more "it doesn't work" tickets with zero context.

**What BugSpotter captures with every report:**

• Screenshot — auto-captured when you click the extension. Annotate with rectangles, arrows, freehand drawing, and text labels in 6 colors.

• Console logs — JavaScript errors, warnings, and logs from the page, captured automatically in the background.

• Network requests — HTTP requests and responses with timing, status codes, and headers. Sensitive headers (auth, cookies) are never included.

• Session replay (optional) — watch a recording of what the user did in the last 60 seconds before reporting the bug. Powered by rrweb.

• Browser metadata — browser version, OS, viewport size, timezone, and page URL.

**Built-in privacy protection:**

• PII sanitization — automatically redacts emails, phone numbers, credit cards, SSNs, IINs, IP addresses, API keys, and passwords before data leaves your browser.

• Domain allowlist — restrict capture to specific domains only.

• HTTPS only — the extension refuses to send data over insecure connections.

• No tracking — zero analytics, telemetry, or third-party data sharing.

**Works with your tools:**

Reports are sent to your BugSpotter instance, which integrates with Jira, GitHub, Linear, Slack, Discord, Microsoft Teams, and custom webhooks. Auto-create tickets with full context attached.

**For the whole team:**

Developers integrate the BugSpotter SDK into their apps. Everyone else — QA, product managers, designers, executives — uses this extension to report bugs on any website without writing code.

**How to get started:**

1. Install the extension
2. Open Options → enter your BugSpotter instance URL and API key
3. Visit any website → click the BugSpotter icon → submit a report
4. View reports in your BugSpotter admin dashboard

Learn more at https://apexbridge.tech

---

## Category

Developer Tools

## Language

English

## Additional Categories

- Productivity
- Accessibility (for teams)

---

## Single Purpose Description (for Google review)

BugSpotter captures bug reports with screenshots, console logs, network requests, and session replay data, and sends them to the user's configured BugSpotter server instance for developer review.

---

## Permissions Justification (for Google review form)

### activeTab

Required to capture a screenshot of the currently visible tab when the user clicks the extension icon. The extension uses `chrome.tabs.captureVisibleTab()` which requires this permission. No tab data is accessed without user action.

### storage

Required to persist user settings: BugSpotter server URL, API key, domain allowlist, PII sanitization preferences, session replay toggle, and buffer sizes. Uses `chrome.storage.sync` for cross-device settings and `chrome.storage.local` for temporary offline report queue.

### tabs

Required to read the URL and title of the active tab for inclusion in bug report metadata. This information helps developers identify which page the bug was found on.

### scripting

Required to inject content scripts that capture console output and network requests from the active tab. The extension uses `chrome.scripting.registerContentScripts()` to register a main-world script that patches `console.*` and `fetch`/`XMLHttpRequest` for monitoring. This is essential for providing developers with the technical context needed to reproduce bugs.

### host_permissions: <all_urls>

Required because BugSpotter is a bug reporting tool that must work on any website the user chooses to test. Users control which domains the extension is active on via an explicit domain allowlist in the Options page. On allowed domains, console, network, and optional replay data may be buffered locally in the background while you browse, but this buffered data is only transmitted to your configured BugSpotter server when you actively open the popup and submit a report.

---

## Data Use Disclosure (for Google review form)

### Data collected:

- Web history: Page URL of the active tab (included in bug report metadata)
- Website content: DOM snapshot for session replay (optional, user-enabled)
- User activity: Console logs and network requests from the active tab

### Data usage:

- Sent to the user's self-configured BugSpotter server instance (HTTPS only)
- Used for bug report context and developer debugging

### Data NOT collected:

- Personally identifiable information (auto-redacted by PII sanitizer)
- Authentication credentials or passwords
- Browsing history beyond the current active tab
- Data from non-allowed domains

### Data NOT shared with:

- Third parties
- Advertisers
- Data brokers
- Apex Bridge Technology (the publisher)

### Certification:

The use and transfer to any other app of information received from Google APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.
