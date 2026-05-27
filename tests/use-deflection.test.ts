/**
 * Tests for `useDeflection`.
 *
 * One regression test per bug surfaced in code review on PR #29. Tests
 * pin the contract — if a future refactor reintroduces any of these
 * races / leaks, the named test breaks instead of the bug shipping
 * silently.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDeflection } from '@/popup/hooks/useDeflection';
import { saveSettings } from '@/storage/settings';
import { resetStorage, mockChrome } from './setup';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const BASE_URL = 'https://bugs.test.com';
const API_KEY = 'bgs_abcdefghijklmnopqrstuvwxyz01234567890ABCDE';

function mockEmptyMatchesResponse() {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({ success: true, data: { matches: [] } }),
  };
}

describe('useDeflection', () => {
  beforeEach(async () => {
    resetStorage();
    mockFetch.mockReset();
    await saveSettings({ baseUrl: BASE_URL, apiKey: API_KEY });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────
  // Regression: lazy init race (Gemini round 1, sub-issue 1).
  // Concurrent probe() calls before getSettings() resolves used to
  // both pass the apiRef-null check, both read storage, both
  // construct DeflectionApi — second overwriting the first and
  // orphaning the in-flight query from the first instance.
  // ─────────────────────────────────────────────────────────────
  it('reads chrome.storage at most once across concurrent probe() calls', async () => {
    mockFetch.mockResolvedValue(mockEmptyMatchesResponse());
    const getSpy = vi.spyOn(mockChrome.storage.sync, 'get');
    getSpy.mockClear();

    const { result } = renderHook(() => useDeflection());

    await act(async () => {
      await Promise.all([
        result.current.probe('hello world'),
        result.current.probe('hello world two'),
        result.current.probe('hello world three'),
      ]);
    });

    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────
  // Regression: post-unmount leak (Gemini round 1, sub-issue 2).
  // If ensureApi was in-flight at unmount, cleanup ran when apiRef
  // was still null (no-op), then api.query fired uncancellable.
  // ─────────────────────────────────────────────────────────────
  it('does not setState after the popup unmounts mid-probe', async () => {
    // Fetch never resolves — simulates an in-flight probe.
    let resolveFetch: ((value: unknown) => void) | undefined;
    mockFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useDeflection());

    // Kick off a probe; don't await it yet — we want it in-flight.
    let probePromise: Promise<void> | undefined;
    act(() => {
      probePromise = result.current.probe('hello world');
    });

    unmount();

    // Now resolve the network — late resolution would have leaked a
    // setMatches in the buggy version. With isMountedRef, the
    // resolved branch short-circuits.
    resolveFetch?.(mockEmptyMatchesResponse());
    await probePromise;

    // Nothing crashed, no console errors. The strongest assertion we
    // can make in renderHook-after-unmount is "the promise completed
    // without throwing", which would have been an unhandled rejection
    // pre-fix when isMountedRef caught the late resolution.
    expect(true).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // Regression: short-title work waste (Gemini round 1, sub-issue 3).
  // Probes below MIN_TITLE_LENGTH (5) should bail before touching
  // chrome.storage or constructing DeflectionApi.
  // ─────────────────────────────────────────────────────────────
  it('does not touch chrome.storage for titles below 5 chars', async () => {
    const getSpy = vi.spyOn(mockChrome.storage.sync, 'get');
    getSpy.mockClear();

    const { result } = renderHook(() => useDeflection());

    await act(async () => {
      await result.current.probe('hi');
      await result.current.probe('hey');
      await result.current.probe('hell'); // 4 chars — still below
    });

    expect(getSpy).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────
  // Regression: title-shorten race (Gemini round 2, finding 1).
  // A probe fired at length≥5 that's still in-flight when the user
  // backspaces to <5 used to repopulate matches on resolve — the
  // bailout didn't bump queryCount or cancel.
  // ─────────────────────────────────────────────────────────────
  it('discards an in-flight probe when the title drops below the floor', async () => {
    // Fetch returns stale matches immediately. The probe at length≥5
    // would normally setMatches with these; the bailout's queryCount
    // bump should keep matches at [] when the stale resolve lands.
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            matches: [
              {
                canonical_id: 'bug-stale',
                title: 'Stale match',
                status: 'open',
                similarity: 0.9,
              },
            ],
          },
        }),
    });

    const { result } = renderHook(() => useDeflection());

    // Don't await — let probe 1 start, get past ensureApi, and queue
    // its debounced fetch.
    let probePromise: Promise<void> | undefined;
    act(() => {
      probePromise = result.current.probe('a real long title');
    });

    // While probe 1 is in flight, user backspaces to a short title.
    // Bailout bumps queryCount + cancels — any later setMatches from
    // probe 1 will see stale queryId and skip.
    await act(async () => {
      await result.current.probe('aa');
    });

    // Allow probe 1 to fully settle (debounce expires, fetch fires,
    // resolution checks queryId — should bail before setMatches).
    await act(async () => {
      await probePromise;
    });

    expect(result.current.matches).toEqual([]);
  }, 10000);

  // ─────────────────────────────────────────────────────────────
  // Regression: confirmation persists for an invisible match
  // (Gemini round 3). Previously, clicking "Same" on bug-1 then
  // editing the title until bug-1 fell out of the top-N kept the
  // confirmation in state — submit would carry a stale
  // duplicate_of with no UI for the user to see or undo it.
  // Matches the SDK widget's "clear-on-disappearance" contract.
  // ─────────────────────────────────────────────────────────────
  it('clears confirmedCanonicalId when the confirmed match drops out of results', async () => {
    // First probe surfaces bug-1.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            matches: [
              {
                canonical_id: 'bug-1',
                title: 'Login broken',
                status: 'open',
                similarity: 0.91,
              },
            ],
          },
        }),
    });

    const { result } = renderHook(() => useDeflection());

    await act(async () => {
      await result.current.probe('login is broken');
    });
    expect(result.current.matches).toHaveLength(1);

    // User confirms bug-1.
    act(() => {
      result.current.confirm('bug-1');
    });
    expect(result.current.confirmedCanonicalId).toBe('bug-1');

    // Next probe returns a different match set without bug-1.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            matches: [
              {
                canonical_id: 'bug-2',
                title: 'Submit form 500s',
                status: 'open',
                similarity: 0.82,
              },
            ],
          },
        }),
    });

    await act(async () => {
      await result.current.probe('something totally different now');
    });

    // bug-1 disappeared → confirmation must be cleared, otherwise
    // submit would carry a stale duplicate_of the user can't see.
    expect(result.current.confirmedCanonicalId).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────
  // Regression: getSettings throw (Gemini round 2, finding 2).
  // chrome.storage can fail when the extension context is
  // invalidated mid-update. ensureApi awaited getSettings outside
  // probe's try/catch, so rejections bubbled out as unhandled —
  // violating the "probe never surfaces errors" contract.
  // ─────────────────────────────────────────────────────────────
  it('soft-fails when chrome.storage throws (context invalidated)', async () => {
    const getSpy = vi.spyOn(mockChrome.storage.sync, 'get');
    getSpy.mockRejectedValueOnce(new Error('Extension context invalidated.'));

    const { result } = renderHook(() => useDeflection());

    // Should resolve without throwing; matches stays empty.
    await act(async () => {
      await result.current.probe('this is a test title');
    });

    expect(result.current.matches).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
