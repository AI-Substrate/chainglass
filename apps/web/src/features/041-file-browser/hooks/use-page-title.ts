'use client';

/**
 * usePageTitle — Set the page label in the browser tab title.
 *
 * Calls setPageTitle on mount and clears it on unmount.
 * The page label appears in the tab title as: {emoji} {branch} — {pageTitle}
 *
 * Plan 079: Window Title Revert Fix
 */

import { useEffect } from 'react';
import { useWorkspaceContext } from './use-workspace-context';

export function usePageTitle(title: string): void {
  const ctx = useWorkspaceContext();
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only re-run on title change, not context ref
  useEffect(() => {
    ctx?.setPageTitle(title);
    return () => ctx?.setPageTitle(null);
  }, [title]); // eslint-disable-line react-hooks/exhaustive-deps
}
