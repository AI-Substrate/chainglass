'use client';

/**
 * TerminalSplitPane — the inline side-by-side terminal (FX012 Mode B).
 *
 * FX014 (Plan 084): wraps the singleton `TerminalViewport` in the shared
 * `TerminalPaneHeader` so split mode has the same theme picker + copy-buffer
 * control + connection badge as the floating overlay. Before this, the split
 * pane rendered a bare viewport and those controls were unreachable in
 * side-by-side mode.
 *
 * Exit-split is driven by the split-toggle button in the file-browser toolbar
 * (FX012/FX013), so this header intentionally has no close button.
 */

import { TerminalPaneHeader } from './terminal-pane-header';
import { useTerminalSingleton } from './terminal-singleton-provider';
import { TerminalViewport } from './terminal-viewport';

export interface TerminalSplitPaneProps {
  /** The session the pane is attached to (resolved by FX013 in the host). */
  sessionName: string;
}

export function TerminalSplitPane({ sessionName }: TerminalSplitPaneProps) {
  const { connectionStatus } = useTerminalSingleton();
  return (
    <div className="flex h-full flex-col">
      <TerminalPaneHeader sessionName={sessionName} connectionStatus={connectionStatus} />
      <div className="flex-1 overflow-hidden min-h-0">
        <TerminalViewport id="inline-3rd" active />
      </div>
    </div>
  );
}
