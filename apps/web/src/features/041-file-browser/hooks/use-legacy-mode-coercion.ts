'use client';

/**
 * useLegacyModeCoercion — Normalizes bookmarked `?mode=edit` URLs to `?mode=source`.
 *
 * Plan 083 Phase 5 (F02 migration). Pre-rename bookmarks still carry `?mode=edit`;
 * the params literal keeps `'edit'` as an allowed value so the URL parses, and this
 * hook replaces it with `'source'` via `history: 'replace'` on mount / when the
 * query flips.
 *
 * IMPORTANT: consumers MUST call this BEFORE any scrollToLine-style auto-switch
 * effect so `?mode=edit&line=42` normalises to `?mode=source` in one step rather
 * than thrashing. See `browser-client.tsx` for the declaration-order contract.
 *
 * Remove after 1 release (see TODO in `file-browser.params.ts`).
 */
import { useEffect } from 'react';

type SetParams = (
  update: { mode: 'source' | 'rich' | 'preview' | 'diff' },
  options?: { history?: 'push' | 'replace' }
) => unknown;

export function useLegacyModeCoercion(
  currentMode: string | null | undefined,
  setParams: SetParams
): void {
  useEffect(() => {
    if (currentMode === 'edit') {
      setParams({ mode: 'source' }, { history: 'replace' });
    }
  }, [currentMode, setParams]);
}
