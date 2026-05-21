'use client';

/**
 * TerminalOverlayPanel — the floating right-edge terminal overlay (Mode A).
 *
 * FX012 (Plan 084): the panel no longer mounts its own `<TerminalInner>`.
 * Instead it renders `<TerminalViewport id="overlay" active={isOpen} />` so
 * the singleton's single xterm DOM node moves into this panel when the float
 * opens and returns to the park when it closes. Scrollback survives every
 * open/close, the WS stays connected, and tmux only ever sees one client.
 *
 * The `useTerminalOverlay` public API is unchanged — sidebar / SDK command /
 * explorer panel callers continue to work without modification (AC-09).
 */

import { ClipboardCopy, TerminalSquare, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTerminalOverlay } from '../hooks/use-terminal-overlay';
import { copyTmuxBuffer } from '../lib/copy-tmux-buffer';
import { ConnectionStatusBadge } from './connection-status-badge';
import { useTerminalSingleton } from './terminal-singleton-provider';
import { TerminalThemeSelect } from './terminal-theme-select';
import { TerminalViewport } from './terminal-viewport';

export function TerminalOverlayPanel() {
  const { isOpen, sessionName, cwd, closeTerminal } = useTerminalOverlay();
  const { connectionStatus } = useTerminalSingleton();
  const panelRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState({ top: 0, left: 0, width: 0, height: 0 });

  // Measure the content area to align overlay over it.
  // Primary: [data-terminal-overlay-anchor] (panel-layout pages like browser).
  // Fallback: [data-slot="sidebar-inset"] > main (all workspace pages).
  const measureRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const measure = () => {
      const anchor =
        document.querySelector('[data-terminal-overlay-anchor]') ||
        document.querySelector('[data-slot="sidebar-inset"]');
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
    const anchor =
      document.querySelector('[data-terminal-overlay-anchor]') ||
      document.querySelector('[data-slot="sidebar-inset"]');
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

  // Close on Escape, Shift+Escape, or backtick. Backtick closes only when
  // pressed without modifiers — Ctrl+` / Cmd+` / Alt+` are reserved for
  // OS / browser shortcuts and shouldn't trigger an overlay close.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTerminal();
        return;
      }
      if (e.key === '`' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        closeTerminal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeTerminal]);

  if (!sessionName || !cwd) return null;

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

      {/* Viewport — the singleton's xterm DOM moves in here when isOpen flips true. */}
      <div className="flex-1 overflow-hidden min-h-0">
        <TerminalViewport id="overlay" active={isOpen} />
      </div>
    </div>
  );
}
