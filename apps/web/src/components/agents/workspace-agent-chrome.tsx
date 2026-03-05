'use client';

/**
 * Plan 059 Phase 3: WorkspaceAgentChrome
 *
 * Client wrapper that adds the agent top bar and overlay system
 * to workspace pages. Renders inside the workspace layout, providing:
 * - AgentOverlayProvider (context for openAgent/closeAgent)
 * - AgentTopBar (persistent summary strip + expandable agent grid)
 * - AgentOverlayPanel (fixed-position chat overlay)
 * - AttentionFlash (3-layer attention: toast + flash + badge)
 *
 * This component sits between WorkspaceAttentionWrapper and page children,
 * so the chip bar appears at the top of the workspace content area.
 *
 * Architecture note (F007): This is workspace-scoped agent composition,
 * NOT a replacement for DashboardShell. DashboardShell owns the
 * sidebar + main layout. This wrapper adds agent-specific UI inside
 * the workspace content area — a domain-level concern, not a layout concern.
 */

import { AgentOverlayPanel } from '@/components/agents/agent-overlay-panel';
import { AgentTopBar } from '@/components/agents/agent-top-bar';
import { AttentionFlash } from '@/components/agents/attention-flash';
import { AgentOverlayProvider } from '@/hooks/use-agent-overlay';
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
        <AgentTopBar workspace={slug} worktreeSlug={worktreeSlug ?? slug} />
        <div className="flex-1 overflow-auto min-h-0">{children}</div>
      </div>
      <AgentOverlayPanel workspacePath={workspacePath} />
      <AttentionFlash workspace={slug} worktreeSlug={worktreeSlug ?? slug} />
    </AgentOverlayProvider>
  );
}
