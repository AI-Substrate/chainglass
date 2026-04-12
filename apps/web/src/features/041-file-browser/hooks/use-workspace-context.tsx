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
 * Plan 079: Default identity from layout props; setPageTitle convenience API
 */

import type { WorktreeVisualPreferences } from '@chainglass/workflow';
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';

/** Worktree identity — set by pages, resolved by provider */
export interface WorktreeIdentity {
  branch: string;
  emoji: string;
  color: string;
  pageTitle: string | null;
  terminalTheme: 'dark' | 'light' | 'system';
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
  /** Set only the page label portion of the title (e.g., 'Terminal', 'Workflows') */
  setPageTitle: (title: string | null) => void;
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
  /** Default worktree path from workspace root — used to initialize identity */
  defaultWorktreePath?: string;
  /** Default branch name from workspace root — used to initialize identity */
  defaultBranch?: string;
  children: ReactNode;
}

export function WorkspaceProvider({
  slug,
  name,
  emoji,
  color,
  worktreePreferences,
  defaultWorktreePath,
  defaultBranch,
  children,
}: WorkspaceProviderProps) {
  const [hasChanges, setHasChangesRaw] = useState(false);
  const setHasChanges = useCallback((value: boolean) => setHasChangesRaw(value), []);

  const [worktreeInput, setWorktreeInput] = useState<WorktreeIdentityInput | null>(
    defaultWorktreePath && defaultBranch
      ? { worktreePath: defaultWorktreePath, branch: defaultBranch }
      : null
  );

  const setWorktreeIdentity = useCallback(
    (input: WorktreeIdentityInput | null) => setWorktreeInput(input),
    []
  );

  const setPageTitle = useCallback(
    (title: string | null) =>
      setWorktreeInput((prev) => (prev ? { ...prev, pageTitle: title ?? undefined } : prev)),
    []
  );

  // Derive resolved identity from input + preferences (re-resolves when prefs change)
  const worktreeIdentity = useMemo<WorktreeIdentity | null>(() => {
    if (!worktreeInput) return null;
    const wtPrefs = worktreePreferences[worktreeInput.worktreePath];
    return {
      branch: worktreeInput.branch,
      emoji: wtPrefs?.emoji || emoji,
      color: wtPrefs?.color || color,
      pageTitle: worktreeInput.pageTitle ?? null,
      terminalTheme: wtPrefs?.terminalTheme || 'dark',
    };
  }, [worktreeInput, worktreePreferences, emoji, color]);

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
      setPageTitle,
    }),
    [
      slug,
      name,
      emoji,
      color,
      hasChanges,
      setHasChanges,
      worktreeIdentity,
      setWorktreeIdentity,
      setPageTitle,
    ]
  );

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}
