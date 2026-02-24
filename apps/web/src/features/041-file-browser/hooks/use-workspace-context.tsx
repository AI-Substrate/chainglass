'use client';

/**
 * WorkspaceContext — Shared workspace state for [slug] pages.
 *
 * Provided by [slug]/layout.tsx (via WorkspaceProvider).
 * Consumed by: sidebar (emoji/name), useAttentionTitle (tab title),
 * browser page (sets hasChanges).
 *
 * Phase 5: Attention System — Plan 041
 * DYK-02: Context shared between layout and sidebar
 * DYK-03: Layout fetches preferences only; browser sets hasChanges
 */

import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface WorkspaceContextValue {
  slug: string;
  name: string;
  emoji: string;
  color: string;
  hasChanges: boolean;
  setHasChanges: (value: boolean) => void;
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
  children: ReactNode;
}

export function WorkspaceProvider({ slug, name, emoji, color, children }: WorkspaceProviderProps) {
  const [hasChanges, setHasChangesRaw] = useState(false);
  const setHasChanges = useCallback((value: boolean) => setHasChangesRaw(value), []);

  const value = useMemo(
    () => ({ slug, name, emoji, color, hasChanges, setHasChanges }),
    [slug, name, emoji, color, hasChanges, setHasChanges]
  );

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}
