'use client';

/**
 * WorkspaceAttentionWrapper — Client wrapper that calls useAttentionTitle.
 *
 * Reads hasChanges from WorkspaceContext (set by browser page).
 * Phase 5: Attention System — Plan 041
 */

import { useAttentionTitle } from '../../../../src/features/041-file-browser/hooks/use-attention-title';
import { useWorkspaceContext } from '../../../../src/features/041-file-browser/hooks/use-workspace-context';

export function WorkspaceAttentionWrapper({ children }: { children: React.ReactNode }) {
  const ctx = useWorkspaceContext();

  useAttentionTitle({
    emoji: ctx?.emoji ?? '',
    pageName: 'Workspace',
    workspaceName: ctx?.name,
    needsAttention: ctx?.hasChanges ?? false,
  });

  return <>{children}</>;
}
