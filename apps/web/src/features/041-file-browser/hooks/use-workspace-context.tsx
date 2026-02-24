'use client';

/**
 * WorkspaceContext — Shared workspace state for [slug] pages.
 *
 * Provided by [slug]/layout.tsx (via WorkspaceProvider).
 * Consumed by: sidebar (emoji/name), useAttentionTitle (tab title),
 * browser page (sets hasChanges + worktree identity).
 *
 * Phase 5: Attention System — Plan 041
 * Subtask 001: Worktree Identity & Tab Titles
 * DYK-ST-02: Single setWorktreeIdentity setter
 * DYK-ST-04: Provider resolves emoji/color from worktreePreferences map
 */

import type { WorktreeVisualPreferences } from '@chainglass/workflow';
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';

/** Worktree identity — set by pages, resolved by provider */
export interface WorktreeIdentity {
  branch: string;
  emoji: string;
  color: string;
  pageTitle: string | null;
}

/** Input to setWorktreeIdentity — provider resolves emoji/color from map */
export interface WorktreeIdentityInput {
  worktreePath: string;
  branch: string;
  pageTitle?: string;
}

export interface WorkspaceContextValue {
  slug: string;
  name: string;
  emoji: string;
  color: string;
  hasChanges: boolean;
  setHasChanges: (value: boolean) => void;
  worktreeIdentity: WorktreeIdentity | null;
  setWorktreeIdentity: (input: WorktreeIdentityInput | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceContext(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}

export interface WorkspaceProviderProps {
  slug: string;
  name: string;
  emoji: string;
  color: string;
  worktreePreferences: Record<string, WorktreeVisualPreferences>;
  children: ReactNode;
}

export function WorkspaceProvider({
  slug,
  name,
  emoji,
  color,
  worktreePreferences,
  children,
}: WorkspaceProviderProps) {
  const [hasChanges, setHasChangesRaw] = useState(false);
  const setHasChanges = useCallback((value: boolean) => setHasChangesRaw(value), []);

  const [worktreeIdentity, setWorktreeIdentityRaw] = useState<WorktreeIdentity | null>(null);

  const setWorktreeIdentity = useCallback(
    (input: WorktreeIdentityInput | null) => {
      if (!input) {
        setWorktreeIdentityRaw(null);
        return;
      }
      const wtPrefs = worktreePreferences[input.worktreePath];
      setWorktreeIdentityRaw({
        branch: input.branch,
        emoji: wtPrefs?.emoji || emoji,
        color: wtPrefs?.color || color,
        pageTitle: input.pageTitle ?? null,
      });
    },
    [worktreePreferences, emoji, color]
  );

  const value = useMemo(
    () => ({
      slug,
      name,
      emoji,
      color,
      hasChanges,
      setHasChanges,
      worktreeIdentity,
      setWorktreeIdentity,
    }),
    [slug, name, emoji, color, hasChanges, setHasChanges, worktreeIdentity, setWorktreeIdentity]
  );

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}
