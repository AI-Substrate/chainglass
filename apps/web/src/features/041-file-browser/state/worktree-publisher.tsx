'use client';

/**
 * Plan 053 Phase 5: WorktreeStatePublisher
 *
 * Invisible component that publishes worktree state to GlobalStateSystem.
 * Must mount inside FileChangeProvider scope to access useFileChanges.
 *
 * Per DYK-21: Publishes to multi-instance paths `worktree:{slug}:*`.
 * Per DYK-24: Branch from prop, not hub.
 * Per DYK-25: File count derived from useFileChanges changes array.
 */

import { useEffect } from 'react';

import { useFileChanges } from '@/features/045-live-file-events';
import { useStateSystem } from '@/lib/state';

interface WorktreeStatePublisherProps {
  slug: string;
  worktreeBranch?: string;
}

export function WorktreeStatePublisher({ slug, worktreeBranch }: WorktreeStatePublisherProps) {
  const state = useStateSystem();
  const { changes } = useFileChanges('*');

  // Publish branch on mount and when it changes
  useEffect(() => {
    state.publish(`worktree:${slug}:branch`, worktreeBranch ?? '');
  }, [state, slug, worktreeBranch]);

  // Publish changed file count whenever changes array updates
  useEffect(() => {
    state.publish(`worktree:${slug}:changed-file-count`, changes.length);
  }, [state, slug, changes.length]);

  return null;
}
