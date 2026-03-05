'use client';

import { useWorkspaceContext } from '@/features/041-file-browser/hooks/use-workspace-context';
import { ClipboardCopy, TerminalSquare, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTerminalOverlay } from '../hooks/use-terminal-overlay';
import { copyTmuxBuffer } from '../lib/copy-tmux-buffer';
import type { ConnectionStatus } from '../types';
import { ConnectionStatusBadge } from './connection-status-badge';
import TerminalInner from './terminal-inner';

export function TerminalOverlayPanel() {
  const { isOpen, sessionName, cwd, closeTerminal } = useTerminalOverlay();
  const wsCtx = useWorkspaceContext();
  const terminalTheme = wsCtx?.worktreeIdentity?.terminalTheme || 'dark';
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const panelRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState({ top: 0, left: 0, width: 0, height: 0 });
  // Only mount TerminalInner once the overlay has been opened at least once
  // This prevents WebSocket connections on every workspace page load
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  // Measure the main content area to align overlay exactly over it
  const measureRef = useRef<() => void>();
  useEffect(() => {
    const measure = () => {
      const anchor = document.querySelector('[data-terminal-overlay-anchor]');
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        setAnchorRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      }
    };
    measureRef.current = measure;
    measure();
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    const anchor = document.querySelector('[data-terminal-overlay-anchor]');
    if (anchor) observer.observe(anchor);
    const timer = setTimeout(measure, 200);
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // Re-measure when overlay opens (agent top bar may shift anchor)
  useEffect(() => {
    if (isOpen) measureRef.current?.();
  }, [isOpen]);

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

  if (!sessionName || !cwd || !hasOpened) return null;

  return (
    <div
      ref={panelRef}
      className="fixed flex flex-col border-l bg-background shadow-2xl"
      style={{
        zIndex: 44,
        top: `${anchorRect.top}px`,
        left: `${anchorRect.left}px`,
        width: `${anchorRect.width}px`,
        height: `${anchorRect.height}px`,
        display: isOpen ? 'flex' : 'none',
      }}
      data-testid="terminal-overlay-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <TerminalSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{sessionName}</span>
        </div>
        <div className="flex items-center gap-2">
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
          themeOverride={terminalTheme}
        />
      </div>
    </div>
  );
}
