'use client';

import { useWorkspaceContext } from '@/features/041-file-browser/hooks/use-workspace-context';
import { ClipboardCopy, TerminalSquare, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCopilotSessionBadges } from '../hooks/use-copilot-session-badges';
import { useTerminalOverlay } from '../hooks/use-terminal-overlay';
import { useTerminalWindowBadges } from '../hooks/use-terminal-window-badges';
import { copyTmuxBuffer } from '../lib/copy-tmux-buffer';
import type { ConnectionStatus } from '../types';
import { ConnectionStatusBadge } from './connection-status-badge';
import TerminalInner from './terminal-inner';

function formatTokens(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function getPctColorClass(pct: number | null): string {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 90) return 'text-red-500';
  if (pct >= 75) return 'text-orange-500';
  if (pct >= 50) return 'text-yellow-500';
  return 'text-green-500';
}

function formatModel(model: string | null): string {
  if (!model) return '?';
  return model.replace('claude-', '').replace('gpt-', 'gpt');
}

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
  const windowBadges = useTerminalWindowBadges({ cwd, enabled: isOpen });
  const copilotBadges = useCopilotSessionBadges({ cwd, enabled: isOpen });

  // Left-join window badges with copilot session data by windowIndex
  const combinedBadges = useMemo(() => {
    const copilotByWindow = new Map(copilotBadges.map((cb) => [cb.windowIndex, cb]));
    return windowBadges.map((wb) => {
      const copilot = copilotByWindow.get(wb.windowIndex);
      return {
        ...wb,
        model: copilot?.model ?? null,
        reasoningEffort: copilot?.reasoningEffort ?? null,
        promptTokens: copilot?.promptTokens ?? null,
        contextWindow: copilot?.contextWindow ?? null,
        pct: copilot?.pct ?? null,
        lastActivityAgo: copilot?.lastActivityAgo ?? null,
      };
    });
  }, [windowBadges, copilotBadges]);

  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

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

  // Close on Escape or Shift+Escape
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
        <div className="flex items-center gap-2 min-w-0">
          <TerminalSquare className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium shrink-0">{sessionName}</span>
          {combinedBadges.length > 0 && (
            <div
              className="flex items-start gap-1.5 flex-wrap"
              data-testid="terminal-window-badges"
            >
              {combinedBadges.map((badge) => {
                const hasCopilot = badge.model !== null;
                return (
                  <div
                    key={badge.windowIndex}
                    className="inline-flex flex-col rounded bg-muted px-1.5 py-0.5 font-mono"
                    title={badge.label}
                  >
                    {/* Line 1: window title */}
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      <span className="text-foreground/70">
                        {badge.windowIndex}
                        {badge.windowName ? `:${badge.windowName}` : ''}
                      </span>{' '}
                      <span className="text-muted-foreground/80">{badge.label}</span>
                    </span>
                    {/* Line 2: copilot details (only when present) */}
                    {hasCopilot && (
                      <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap flex items-center gap-1">
                        <span>{formatModel(badge.model)}</span>
                        {badge.reasoningEffort && <span>({badge.reasoningEffort})</span>}
                        <span className="text-border">|</span>
                        <span>
                          {formatTokens(badge.promptTokens)}/{formatTokens(badge.contextWindow)}
                        </span>
                        <span className={getPctColorClass(badge.pct)}>
                          {badge.pct !== null ? `${badge.pct}%` : '—'}
                        </span>
                        {badge.lastActivityAgo && (
                          <>
                            <span className="text-border">|</span>
                            <span>{badge.lastActivityAgo}</span>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
          isVisible={isOpen}
        />
      </div>
    </div>
  );
}
