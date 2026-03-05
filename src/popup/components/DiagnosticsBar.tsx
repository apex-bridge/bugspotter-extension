import type { Diagnostics } from '../hooks/usePopupInit';

interface DiagnosticsBarProps {
  diagnostics: Diagnostics;
  replayEnabled: boolean;
}

export function DiagnosticsBar({ diagnostics, replayEnabled }: DiagnosticsBarProps) {
  return (
    <div className="mb-2 px-2 py-1 bg-gray-800 rounded text-[10px] font-mono flex flex-wrap gap-x-3 gap-y-0.5">
      <span className={diagnostics.initialized ? 'text-green-400' : 'text-red-400'}>
        Content: {diagnostics.initialized ? 'OK' : 'NOT INIT'}
      </span>
      <span className={diagnostics.consoleCount > 0 ? 'text-green-400' : 'text-yellow-400'}>
        Console: {diagnostics.consoleCount}
      </span>
      <span className={diagnostics.networkCount > 0 ? 'text-green-400' : 'text-yellow-400'}>
        Network: {diagnostics.networkCount}
      </span>
      {replayEnabled && (
        <span className={diagnostics.replayRecording ? 'text-green-400' : 'text-red-400'}>
          Replay: {diagnostics.replayRecording ? diagnostics.replayCount : 'OFF'}
        </span>
      )}
      {diagnostics.error && <span className="text-red-400 w-full">{diagnostics.error}</span>}
    </div>
  );
}
