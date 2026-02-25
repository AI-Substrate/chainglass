'use client';

/**
 * SDKWorkspaceConnector — Connects workspace context to the global SDKProvider.
 *
 * DYK-P2-01: React props can't flow up the tree. SDKProvider is at the root,
 * but workspace data lives in a nested server layout. This component bridges
 * the gap by calling setWorkspaceContext() imperatively on mount and clearing
 * on unmount (when navigating away from workspace routes).
 *
 * Rendered by workspace layout as an invisible component.
 *
 * Per Plan 047 Phase 2, Task T008.
 */

import { useEffect } from 'react';

import { useSDKInternal } from './sdk-provider';

interface SDKWorkspaceConnectorProps {
  slug: string;
  sdkSettings: Record<string, unknown>;
  sdkMru: string[];
  /** Server action for persisting SDK settings — passed from app/ layer to avoid lib/ → app/ inversion */
  persistSettings: (
    slug: string,
    record: Record<string, unknown>
  ) => Promise<{ success: boolean; error?: string }>;
  /** Server action for persisting SDK MRU — passed from app/ layer to avoid lib/ → app/ inversion */
  persistMru: (slug: string, mru: string[]) => Promise<{ success: boolean; error?: string }>;
}

export function SDKWorkspaceConnector({
  slug,
  sdkSettings,
  sdkMru,
  persistSettings,
  persistMru,
}: SDKWorkspaceConnectorProps) {
  const { setWorkspaceContext, clearWorkspaceContext, setPersistFn, setPersistMruFn } =
    useSDKInternal();

  useEffect(() => {
    setWorkspaceContext(slug, sdkSettings, sdkMru);

    // Wire persistence: when settings change, call the server action
    setPersistFn((record: Record<string, unknown>) => persistSettings(slug, record).then(() => {}));
    setPersistMruFn((mru: string[]) => persistMru(slug, mru).then(() => {}));

    return () => {
      clearWorkspaceContext();
      setPersistFn(null);
      setPersistMruFn(null);
    };
  }, [
    slug,
    sdkSettings,
    sdkMru,
    persistSettings,
    persistMru,
    setWorkspaceContext,
    clearWorkspaceContext,
    setPersistFn,
    setPersistMruFn,
  ]);

  // Invisible — no UI
  return null;
}
