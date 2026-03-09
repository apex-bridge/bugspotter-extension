# BugSpotter Browser Extension — Privacy Policy

**Last updated:** March 7, 2026
**Effective date:** March 7, 2026
**Published by:** Apex Bridge Technology
**Contact:** support@apexbridge.tech
**Website:** https://apexbridge.tech

---

## 1. Overview

BugSpotter is a bug reporting browser extension that helps software teams capture, annotate, and submit bug reports with contextual data. This privacy policy explains what data the extension collects, how it is used, and where it is sent.

**Key principle:** BugSpotter sends data only to a server URL that you explicitly configure. We do not collect, store, or transmit any data to Apex Bridge Technology or any third party.

---

## 2. Data Collected

On domains you have allowed, the extension continuously buffers console logs, network requests, and (if enabled) session replay data locally in your browser while you browse. This buffered data is **only transmitted** to your configured server when you actively open the popup and submit a bug report. The following data is included in each report:

### 2.1. Screenshot

- A PNG image of the currently visible browser tab, captured at the moment you click the extension icon.
- You may annotate the screenshot before submission.

### 2.2. Console Logs

- JavaScript console output (log, info, warn, error, debug levels) from the active tab.
- Stored in a rotating buffer (configurable, default: last 100 entries).
- Captured only on domains you explicitly allow in the extension settings.

### 2.3. Network Requests

- HTTP request and response metadata (URL, method, status code, timing, headers).
- Stored in a rotating buffer (configurable, default: last 50 entries).
- Sensitive headers (Authorization, Cookie, API keys, CSRF tokens) are **never captured**.
- Request bodies are truncated to 4,000 characters.

### 2.4. Session Replay (Optional)

- If enabled in settings, the extension records DOM mutations, mouse movements, clicks, and scrolls using the rrweb library.
- Recording is limited to a configurable time window (default: 60 seconds).
- Replay data is compressed before upload.
- This feature is **disabled by default** and must be explicitly enabled.

### 2.5. Browser Metadata

- Browser name and version, operating system, viewport dimensions, timezone, page URL, and user agent string.

### 2.6. User-Provided Information

- Bug report title, description, and priority level entered by the user.

---

## 3. Data NOT Collected

The extension does **not** collect:

- Browsing history or bookmarks
- Passwords, form autofill data, or saved credentials
- Files from your computer
- Data from tabs other than the currently active tab
- Data on domains not in your allowed domains list
- Any data on domains not in your allowed list (on allowed domains, console and network events are buffered locally but never transmitted unless you submit a report)
- Analytics, telemetry, or usage statistics

---

## 4. PII Sanitization

BugSpotter includes built-in personally identifiable information (PII) sanitization that automatically redacts the following patterns before data leaves your browser:

- Email addresses
- Phone numbers (international formats)
- Credit card numbers (Visa, Mastercard, Amex, Discover)
- Social Security Numbers (US SSN)
- Kazakhstan Individual Identification Numbers (IIN/BIN)
- IP addresses (IPv4 and IPv6)
- API keys and authentication tokens
- Passwords

Sanitization is **enabled by default** and can be configured with preset profiles (e.g., "Kazakhstan", "GDPR", "PCI DSS", "Financial") or individual pattern toggles.

---

## 5. Where Data Is Sent

All captured data is sent exclusively to the **BugSpotter server URL that you configure** in the extension's Options page. This is typically your organization's self-hosted BugSpotter instance or a BugSpotter SaaS endpoint.

- The extension enforces **HTTPS-only** connections. HTTP endpoints are rejected.
- No data is sent to Apex Bridge Technology, Google, or any third-party service.
- No data is shared with advertisers, data brokers, or analytics providers.

---

## 6. Data Storage

### On Your Device

- Extension settings (server URL, API key, domain allowlist, sanitization preferences) are stored in `chrome.storage.sync`.
- If a report fails to send due to network issues, it is stored in a local offline queue (maximum 10 reports, expires after 7 days). Offline-queued reports do not include screenshots or replay data.
- No captured data is retained on your device after successful submission.

### On Your Server

- Data retention on your BugSpotter server instance is governed by your organization's data retention policies, not by this extension.

---

## 7. Domain Filtering

You can restrict the extension to specific domains using the **Allowed Domains** setting:

- When configured, the extension only captures data on listed domains.
- Wildcard patterns are supported (e.g., `*.example.com`).
- When no domains are configured, the extension can capture on any site you visit (only when you actively open the popup and submit a report).

---

## 8. Permissions Explained

| Permission                     | Why It's Needed                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `activeTab`                    | To capture a screenshot of the current tab when you click the extension icon          |
| `storage`                      | To save your settings (server URL, API key, domain allowlist, preferences)            |
| `tabs`                         | To read the current tab's URL and title for inclusion in bug reports                  |
| `scripting`                    | To inject the console and network capture scripts into the active tab                 |
| `host_permissions: <all_urls>` | To allow bug reporting on any website you choose, controlled by your domain allowlist |

---

## 9. User Control

You have full control over the extension's behavior:

- **Enable/disable** PII sanitization and choose which patterns to redact.
- **Enable/disable** session replay recording.
- **Configure** which domains the extension is active on.
- **Adjust** buffer sizes for console and network capture.
- **Uninstall** the extension at any time to stop all data collection.

---

## 10. Children's Privacy

BugSpotter is a professional software development tool. It is not directed at children under 13 years of age, and we do not knowingly collect data from children.

---

## 11. Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected by updating the "Last updated" date at the top of this document. Continued use of the extension after changes constitutes acceptance of the updated policy.

---

## 12. Contact

If you have questions about this privacy policy or BugSpotter's data practices:

- **Email:** support@apexbridge.tech
- **Website:** https://apexbridge.tech
- **GitHub:** https://github.com/apexbridge-tech

---

## 13. Compliance Statement

This extension's use and transfer to any other app of information received from Google APIs will adhere to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements.
