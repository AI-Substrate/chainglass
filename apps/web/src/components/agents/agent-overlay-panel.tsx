'use client';

/**
 * Plan 059 Phase 3: AgentOverlayPanel — Fixed-position chat overlay
 *
 * Renders at z-45 bottom-right when an agent is selected via useAgentOverlay().
 * Reuses existing AgentChatView for full chat functionality (events, streaming,
 * input). Close via ✕ button, Escape key, or chip toggle. Click outside does
 * NOT close (Workshop 002 design decision).
 *
 * AC-21: 480px × 70vh with full chat UI
 * AC-22: No navigation — closing keeps agent running
 */

import { AgentChatView } from '@/components/agents/agent-chat-view';
import { useAgentOverlay } from '@/hooks/useAgentOverlay';
import { Z_INDEX } from '@/lib/agents/constants';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useCallback, useEffect } from 'react';

interface AgentOverlayPanelProps {
  /** Workspace path for agent context */
  workspacePath?: string;
  className?: string;
}

export function AgentOverlayPanel({ workspacePath, className }: AgentOverlayPanelProps) {
  const { activeAgentId, isOpen, closeAgent } = useAgentOverlay();

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeAgent();
      }
    },
    [isOpen, closeAgent]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen || !activeAgentId) return null;

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 w-[480px] h-[70vh] max-h-[700px]',
        'flex flex-col rounded-xl border bg-background shadow-2xl',
        'animate-in slide-in-from-bottom-2 fade-in-0 duration-200',
        className
      )}
      style={{ zIndex: Z_INDEX.OVERLAY }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
        <h3 className="text-sm font-medium truncate">Agent Chat</h3>
        <button
          type="button"
          onClick={closeAgent}
          className="rounded-md p-1 hover:bg-accent transition-colors"
          aria-label="Close overlay"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Chat content — reuses existing component */}
      <div className="flex-1 overflow-hidden min-h-0">
        <AgentChatView agentId={activeAgentId} workspacePath={workspacePath} className="h-full" />
      </div>
    </div>
  );
}
