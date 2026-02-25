'use client';

/**
 * WorkspaceAttentionWrapper — Client wrapper that calls useAttentionTitle.
 *
 * Composes tab title from worktree identity (if set) or workspace defaults.
 * Format: {attention}{emoji} {branch|name} — {page}
 *
 * Phase 5: Attention System — Plan 041
 * Subtask 001: Worktree Identity & Tab Titles
 */

import { useAttentionTitle } from '../../../../src/features/041-file-browser/hooks/use-attention-title';
import { useWorkspaceContext } from '../../../../src/features/041-file-browser/hooks/use-workspace-context';

export function WorkspaceAttentionWrapper({ children }: { children: React.ReactNode }) {
  const ctx = useWorkspaceContext();
  const wt = ctx?.worktreeIdentity;

  const resolvedEmoji = wt?.emoji || ctx?.emoji || '';
  const location = wt?.branch || ctx?.name || '';
  const pageName = wt?.pageTitle ? `${location} — ${wt.pageTitle}` : location;

  useAttentionTitle({
    emoji: resolvedEmoji,
    pageName,
    workspaceName: ctx?.name,
    needsAttention: ctx?.hasChanges ?? false,
  });

  return <>{children}</>;
}
