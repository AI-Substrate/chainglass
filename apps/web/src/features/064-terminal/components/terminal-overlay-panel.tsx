'use client';

import { TerminalSquare, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTerminalOverlay } from '../hooks/use-terminal-overlay';
import type { ConnectionStatus } from '../types';
import { ConnectionStatusBadge } from './connection-status-badge';
import TerminalInner from './terminal-inner';

export function TerminalOverlayPanel() {
  const { isOpen, sessionName, cwd, closeTerminal } = useTerminalOverlay();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTerminal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeTerminal]);

  if (!isOpen || !sessionName || !cwd) return null;

  return (
    <div
      ref={panelRef}
      className="fixed top-0 right-0 flex flex-col h-full border-l bg-background shadow-2xl"
      style={{ zIndex: 44, width: 'min(60vw, 900px)' }}
      data-testid="terminal-overlay-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <TerminalSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{sessionName}</span>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionStatusBadge status={connectionStatus} showLabel={false} />
          <button
            type="button"
            onClick={closeTerminal}
            className="rounded-sm p-1 hover:bg-accent"
            aria-label="Close terminal overlay"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Terminal — direct import, no next/dynamic wrapper */}
      <div className="flex-1 overflow-hidden min-h-0">
        <TerminalInner
          sessionName={sessionName}
          cwd={cwd}
          onConnectionChange={setConnectionStatus}
        />
      </div>
    </div>
  );
}
