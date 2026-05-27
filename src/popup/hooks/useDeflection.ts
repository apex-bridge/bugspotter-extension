import { useEffect, useRef, useState } from 'react';
import { DeflectionApi, type DeflectionMatch } from '@bugspotter/common';
import { getSettings } from '@/storage/settings';

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
  const queryCountRef = useRef(0);

  // Lazy setup — only construct the API when actually probed. Avoids
  // a chrome.storage round-trip on every popup mount.
  async function ensureApi(): Promise<DeflectionApi | null> {
    if (apiRef.current) {
      return apiRef.current;
    }
    const settings = await getSettings();
    const baseUrl = settings.baseUrl?.trim();
    const apiKey = settings.apiKey?.trim();
    if (!baseUrl || !apiKey) {
      return null;
    }
    apiRef.current = new DeflectionApi({
      endpoint: `${baseUrl.replace(/\/$/, '')}/api/v1/sdk/similar`,
      getAuthHeaders: () => ({ 'X-API-Key': apiKey }),
    });
    return apiRef.current;
  }

  async function probe(title: string): Promise<void> {
    const api = await ensureApi();
    if (!api) {
      return;
    }
    const queryId = ++queryCountRef.current;
    try {
      const result = await api.query(title.trim());
      // Discard stale resolves — only the latest query's result wins.
      if (queryId !== queryCountRef.current) {
        return;
      }
      setMatches(result);
    } catch {
      // Soft-fail; DeflectionApi.query is contracted to always resolve.
      if (queryId === queryCountRef.current) {
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
      apiRef.current?.cancel();
    };
  }, []);

  const visibleMatches = matches.filter((m) => !rejectedCanonicalIds.has(m.canonical_id));

  return {
    probe,
    matches: visibleMatches,
    confirmedCanonicalId,
    confirm,
    reject,
    reset,
  };
}
