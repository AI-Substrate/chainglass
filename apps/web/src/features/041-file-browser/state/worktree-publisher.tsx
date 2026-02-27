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
 *
 * TEMPORARY: Includes a demo timer that increments changed-file-count
 * every 2 seconds for visual verification. Remove before shipping.
 */

import { useEffect, useRef } from 'react';

import { useStateSystem } from '@/lib/state';

interface WorktreeStatePublisherProps {
  slug: string;
  worktreeBranch?: string;
}

export function WorktreeStatePublisher({ slug, worktreeBranch }: WorktreeStatePublisherProps) {
  const state = useStateSystem();
  const countRef = useRef(0);

  // Publish branch on mount and when it changes
  useEffect(() => {
    state.publish(`worktree:${slug}:branch`, worktreeBranch ?? '');
  }, [state, slug, worktreeBranch]);

  // TEMPORARY: Demo timer that increments file count every 2s.
  // Replace with real useFileChanges subscription once verified.
  useEffect(() => {
    // Publish initial count
    state.publish(`worktree:${slug}:changed-file-count`, countRef.current);

    const interval = setInterval(() => {
      countRef.current += 1;
      state.publish(`worktree:${slug}:changed-file-count`, countRef.current);
    }, 2000);

    return () => clearInterval(interval);
  }, [state, slug]);

  return null;
}
