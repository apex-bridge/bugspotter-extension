import { statusLabel, type DeflectionMatch } from '@bugspotter/common';

interface Props {
  matches: DeflectionMatch[];
  confirmedCanonicalId: string | null;
  onConfirm: (canonicalId: string) => void;
  onReject: (canonicalId: string) => void;
}

/**
 * Inline panel showing existing bugs that may match what the user is
 * about to report. Same contract as the SDK widget:
 *
 *  - Empty matches → null render (no panel chrome shown).
 *  - Clicking "Same" sets confirmation; submit will tag the new bug
 *    as a duplicate. Clicking the same chip toggles confirmation off.
 *  - Clicking "Different" hides the chip persistently — the hook's
 *    rejected set ensures the server can't re-surface it via the
 *    next probe.
 *  - This component never reads or writes the title/description
 *    fields — form state stays in the parent. "Don't lose report
 *    data" contract.
 */
export function DeflectionDisplay({ matches, confirmedCanonicalId, onConfirm, onReject }: Props) {
  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 rounded border border-yellow-700/50 bg-yellow-900/10 p-2">
      <div className="mb-1 text-xs text-yellow-200">We may already know about this</div>
      <div className="space-y-1.5">
        {matches.map((m) => {
          const isConfirmed = m.canonical_id === confirmedCanonicalId;
          return (
            <div
              key={m.canonical_id}
              data-canonical-id={m.canonical_id}
              className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 ${
                isConfirmed ? 'bg-yellow-700/40' : 'bg-gray-800/50'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-white" title={m.title}>
                  {m.title}
                </div>
                <div className="text-[10px] text-gray-400">{statusLabel(m.status)}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => onConfirm(m.canonical_id)}
                  className={`rounded px-2 py-0.5 text-[10px] ${
                    isConfirmed
                      ? 'bg-yellow-600 text-white'
                      : 'border border-gray-600 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {isConfirmed ? '✓ Same' : 'Same'}
                </button>
                <button
                  type="button"
                  onClick={() => onReject(m.canonical_id)}
                  className="rounded border border-gray-600 px-2 py-0.5 text-[10px] text-gray-300 hover:bg-gray-700"
                >
                  Different
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
