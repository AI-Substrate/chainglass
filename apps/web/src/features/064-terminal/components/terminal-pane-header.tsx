'use client';

/**
 * TerminalPaneHeader — the shared control strip for every terminal surface.
 *
 * FX014 (Plan 084): the floating overlay (Mode A) and the inline split pane
 * (Mode B) previously rendered their own headers — the overlay had the theme
 * picker + copy-buffer button, the split pane had nothing. Splitting therefore
 * lost the theme selector and copy/paste control. This component is the single
 * source of truth for those controls so the two surfaces can never drift
 * again. The `/terminal` page can adopt it too.
 *
 * `onClose` is optional: the overlay passes its close handler (renders the X),
 * the split pane omits it (exit is driven by the split-toggle button in the
 * file-browser toolbar).
 */

import { ClipboardCopy, TerminalSquare, X } from 'lucide-react';
import { copyTmuxBuffer } from '../lib/copy-tmux-buffer';
import type { ConnectionStatus } from '../types';
import { ConnectionStatusBadge } from './connection-status-badge';
import { TerminalThemeSelect } from './terminal-theme-select';

export interface TerminalPaneHeaderProps {
  /** Session name shown on the left. */
  sessionName: string;
  /** Live WS connection status for the badge. */
  connectionStatus: ConnectionStatus;
  /** Optional close handler — when provided, renders the X button (overlay). */
  onClose?: () => void;
}

export function TerminalPaneHeader({
  sessionName,
  connectionStatus,
  onClose,
}: TerminalPaneHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <TerminalSquare className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium shrink-0">{sessionName}</span>
      </div>
      <div className="flex items-center gap-2">
        <TerminalThemeSelect />
        <button
          type="button"
          onClick={() => copyTmuxBuffer()}
          className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
          aria-label="Copy tmux buffer"
          title="Copy tmux buffer"
        >
          <ClipboardCopy className="h-3.5 w-3.5" />
        </button>
        <ConnectionStatusBadge status={connectionStatus} showLabel={false} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 hover:bg-accent"
            aria-label="Close terminal overlay"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
