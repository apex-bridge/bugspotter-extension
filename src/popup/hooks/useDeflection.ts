import { useEffect, useRef, useState } from 'react';
import { DeflectionApi, type DeflectionMatch } from '@bugspotter/common';
import { getSettings } from '@/storage/settings';

// Aligned with the backend's SDK probe floor (sdk-similar.ts) and
// DeflectionApi's own internal check — below this length the embedding
// model produces only noise. Guard locally so we don't even pay for a
// chrome.storage read on the first 1–4 keystrokes.
const MIN_TITLE_LENGTH = 5;

/**
 * Wraps the shared `@bugspotter/common` DeflectionApi for the popup.
 *
 * Probe lifecycle:
 *  - Created lazily on the first non-empty title input (settings may
 *    not be ready at popup-mount).
 *  - Title changes are debounced inside DeflectionApi (400ms by
 *    default) — caller doesn't need to debounce.
 *  - Superseded queries resolve to `[]` per the library's leak guard;
 *    the hook uses a monotonic counter to discard stale resolves so
 *    last-good matches stay visible across keystrokes.
 *  - On unmount, `cancel()` is called to drop any in-flight probe.
 *
 * Soft-fail contract: any error in setup or fetch resolves to empty
 * matches. The deflection panel never surfaces probe errors to the
 * user — the bug-report flow always remains submittable.
 *
 * Auth: reads `baseUrl` + `apiKey` from chrome.storage.sync once at
 * setup. Re-reads if either was missing initially (lets the user
 * configure the extension and have deflection start working without
 * a popup reopen).
 */
export function useDeflection() {
  const [matches, setMatches] = useState<DeflectionMatch[]>([]);
  const [confirmedCanonicalId, setConfirmedCanonicalId] = useState<string | null>(null);
  const [rejectedCanonicalIds, setRejectedCanonicalIds] = useState<Set<string>>(() => new Set());

  const apiRef = useRef<DeflectionApi | null>(null);
  // Caches the in-flight init promise so concurrent probe() calls
  // before the first getSettings() resolves all share one storage
  // read + one DeflectionApi instance. Without this, rapid
  // keystrokes can construct multiple APIs that orphan each other,
  // leaking HTTP requests.
  const apiPromiseRef = useRef<Promise<DeflectionApi | null> | null>(null);
  const queryCountRef = useRef(0);
  // Tracks whether the popup is still mounted. When the user closes
  // the popup mid-probe, an in-flight ensureApi could resolve AFTER
  // cleanup ran (when apiRef was still null), then fire an
  // uncancellable query. This ref lets the resolution check.
  const isMountedRef = useRef(true);

  // Lazy setup — only construct the API when actually probed. Avoids
  // a chrome.storage round-trip on every popup mount.
  async function ensureApi(): Promise<DeflectionApi | null> {
    if (apiRef.current) {
      return apiRef.current;
    }
    if (apiPromiseRef.current) {
      return apiPromiseRef.current;
    }
    apiPromiseRef.current = (async () => {
      try {
        const settings = await getSettings();
        const baseUrl = settings.baseUrl?.trim();
        const apiKey = settings.apiKey?.trim();
        if (!baseUrl || !apiKey) {
          // Clear the cached promise so a later configure → retry
          // can succeed without needing a popup reopen.
          apiPromiseRef.current = null;
          return null;
        }
        const api = new DeflectionApi({
          endpoint: `${baseUrl.replace(/\/$/, '')}/api/v1/sdk/similar`,
          getAuthHeaders: () => ({ 'X-API-Key': apiKey }),
        });
        apiRef.current = api;
        return api;
      } catch {
        // chrome.storage can fail if the extension context is
        // invalidated mid-update. Soft-fail to keep the "probe never
        // surfaces errors" contract — clear the cached promise so a
        // subsequent probe can retry the init.
        apiPromiseRef.current = null;
        return null;
      }
    })();
    return apiPromiseRef.current;
  }

  async function probe(title: string): Promise<void> {
    const trimmed = title.trim();
    // Below the floor → no useful matches possible. Bail before
    // touching chrome.storage / instantiating DeflectionApi. Also
    // bump the counter + cancel any in-flight probe so a query
    // fired at length 5+ that's still in-flight when the user
    // backspaces to 4 doesn't repopulate matches when it resolves.
    if (trimmed.length < MIN_TITLE_LENGTH) {
      queryCountRef.current++;
      apiRef.current?.cancel();
      setMatches([]);
      return;
    }
    // Stamp queryId BEFORE any await — otherwise a probe that fired
    // while this one was awaiting ensureApi could bump the counter,
    // and we'd assign a fresh queryId here that matches the new
    // current value, causing stale matches to land on resolve.
    const queryId = ++queryCountRef.current;
    const api = await ensureApi();
    // Bail if the popup unmounted, settings missing, or a newer
    // probe has been issued while we were awaiting.
    if (!api || !isMountedRef.current || queryId !== queryCountRef.current) {
      api?.cancel();
      return;
    }
    try {
      const result = await api.query(trimmed);
      // Discard stale resolves — only the latest query's result
      // wins, and only when the popup is still around to show it.
      if (queryId !== queryCountRef.current || !isMountedRef.current) {
        return;
      }
      setMatches(result);
    } catch {
      // Soft-fail; DeflectionApi.query is contracted to always resolve.
      if (queryId === queryCountRef.current && isMountedRef.current) {
        setMatches([]);
      }
    }
  }

  function confirm(canonicalId: string): void {
    // Toggle: clicking the same chip again clears confirmation, lets
    // the user back out without typing or closing the popup.
    setConfirmedCanonicalId((prev) => (prev === canonicalId ? null : canonicalId));
  }

  function reject(canonicalId: string): void {
    setRejectedCanonicalIds((prev) => {
      const next = new Set(prev);
      next.add(canonicalId);
      return next;
    });
    // If the user rejected the chip they had confirmed, clear it too.
    setConfirmedCanonicalId((prev) => (prev === canonicalId ? null : prev));
  }

  function reset(): void {
    queryCountRef.current++;
    setMatches([]);
    setConfirmedCanonicalId(null);
    setRejectedCanonicalIds(new Set());
  }

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      apiRef.current?.cancel();
    };
  }, []);

  const visibleMatches = matches.filter((m) => !rejectedCanonicalIds.has(m.canonical_id));

  // If the user confirmed a chip and the next probe no longer
  // surfaces it (similarity dropped, top-N rotated, OR the user
  // rejected it), clear the confirmation. Without this, submit
  // would carry a stale duplicate_of for a match the user can no
  // longer see — surprise behavior. Mirrors the SDK widget's
  // DeflectionDisplay.render contract for cross-surface parity.
  useEffect(() => {
    if (!confirmedCanonicalId) return;
    const stillVisible = visibleMatches.some((m) => m.canonical_id === confirmedCanonicalId);
    if (!stillVisible) {
      setConfirmedCanonicalId(null);
    }
  }, [visibleMatches, confirmedCanonicalId]);

  return {
    probe,
    matches: visibleMatches,
    confirmedCanonicalId,
    confirm,
    reject,
    reset,
  };
}
