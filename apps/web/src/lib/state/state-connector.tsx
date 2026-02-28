'use client';

/**
 * Plan 053 Phase 5: GlobalStateConnector
 *
 * Invisible wiring component that registers a state domain and mounts
 * its publisher. Sits inside the provider scope for the data source
 * (e.g., FileChangeProvider) and bridges it to the GlobalStateSystem.
 *
 * Registration happens in useState initializer (synchronous, before children
 * render) so the domain is available when publisher effects fire.
 * Fail-fast: if registration throws, the error propagates (DYK-18).
 */

import { useState } from 'react';

import { registerWorktreeState } from '@/features/041-file-browser/state/register';
import { WorktreeStatePublisher } from '@/features/041-file-browser/state/worktree-publisher';

import { useStateSystem } from './state-provider';

interface GlobalStateConnectorProps {
  slug: string;
  worktreeBranch?: string;
}

export function GlobalStateConnector({ slug, worktreeBranch }: GlobalStateConnectorProps) {
  const state = useStateSystem();

  // Register domain synchronously on first render via useState initializer.
  // Must complete before children's useEffect calls publish().
  useState(() => {
    registerWorktreeState(state);
  });

  return <WorktreeStatePublisher slug={slug} worktreeBranch={worktreeBranch} />;
}
