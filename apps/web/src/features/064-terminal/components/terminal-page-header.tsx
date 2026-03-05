'use client';

import { ClipboardCopy, TerminalSquare } from 'lucide-react';
import { copyTmuxBuffer } from '../lib/copy-tmux-buffer';
import type { ConnectionStatus } from '../types';
import { ConnectionStatusBadge } from './connection-status-badge';

interface TerminalPageHeaderProps {
  sessionName: string | null;
  connectionStatus: ConnectionStatus;
  paneTitle?: string;
  onReconnect?: () => void;
}

export function TerminalPageHeader({
  sessionName,
  connectionStatus,
  paneTitle,
  onReconnect,
}: TerminalPageHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-3 py-2 shrink-0 bg-background">
      <div className="flex items-center gap-2">
        <TerminalSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{sessionName ?? 'No session'}</span>
        {paneTitle && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {paneTitle}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => copyTmuxBuffer()}
          className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
          aria-label="Copy tmux buffer"
          title="Copy tmux buffer to clipboard"
        >
          <ClipboardCopy className="h-3.5 w-3.5" />
        </button>
        <ConnectionStatusBadge status={connectionStatus} onReconnect={onReconnect} />
      </div>
    </div>
  );
}
