'use client';

/**
 * Plan 059 Phase 3: WorkspaceAgentChrome
 *
 * Client wrapper that adds the agent chip bar and overlay system
 * to workspace pages. Renders inside the workspace layout, providing:
 * - AgentOverlayProvider (context for openAgent/closeAgent)
 * - AgentChipBar (persistent top bar with agent status chips)
 * - AgentOverlayPanel (fixed-position chat overlay)
 *
 * This component sits between WorkspaceAttentionWrapper and page children,
 * so the chip bar appears at the top of the workspace content area.
 */

import { AgentChipBar } from '@/components/agents/agent-chip-bar';
import { AgentOverlayPanel } from '@/components/agents/agent-overlay-panel';
import { AttentionFlash } from '@/components/agents/attention-flash';
import { AgentOverlayProvider } from '@/hooks/useAgentOverlay';
import type { ReactNode } from 'react';

interface WorkspaceAgentChromeProps {
  children: ReactNode;
  slug: string;
  worktreeSlug?: string;
  workspacePath?: string;
}

export function WorkspaceAgentChrome({
  children,
  slug,
  worktreeSlug,
  workspacePath,
}: WorkspaceAgentChromeProps) {
  return (
    <AgentOverlayProvider>
      <div className="flex flex-col h-full overflow-hidden">
        <AgentChipBar workspace={slug} worktreeSlug={worktreeSlug ?? slug} />
        <div className="flex-1 overflow-auto min-h-0">{children}</div>
      </div>
      <AgentOverlayPanel workspacePath={workspacePath} />
      <AttentionFlash workspace={slug} worktreeSlug={worktreeSlug ?? slug} />
    </AgentOverlayProvider>
  );
}
