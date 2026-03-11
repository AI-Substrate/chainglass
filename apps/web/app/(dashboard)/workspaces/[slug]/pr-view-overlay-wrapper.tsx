'use client';

/**
 * PR View Overlay Wrapper — mounts provider + panel in workspace layout.
 *
 * Mirrors notes-overlay-wrapper.tsx:
 * - Dynamic import for panel (SSR: false — requires DOM for anchor measurement)
 * - Error boundary wraps panel only (not provider)
 * - Provider is pure context — safe to always mount
 * - FileChangeProvider shared across browser + overlay (Phase 6 FT-005)
 *
 * Plan 071: PR View & File Notes — Phase 5 T008, Phase 6 FT-005
 */

import nextDynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';
import { FileChangeProvider } from '../../../../src/features/045-live-file-events';
import { PRViewOverlayProvider } from '../../../../src/features/071-pr-view/hooks/use-pr-view-overlay';

const PRViewOverlayPanel = nextDynamic(
  () =>
    import('../../../../src/features/071-pr-view/components/pr-view-overlay-panel').then(
      (m) => m.PRViewOverlayPanel
    ),
  { ssr: false }
);

class PRViewOverlayErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

interface PRViewOverlayWrapperProps {
  children: ReactNode;
  defaultWorktreePath?: string;
}

export function PRViewOverlayWrapper({ children, defaultWorktreePath }: PRViewOverlayWrapperProps) {
  return (
    <PRViewOverlayProvider defaultWorktreePath={defaultWorktreePath}>
      <FileChangeProvider worktreePath={defaultWorktreePath ?? ''}>
        {children}
        <PRViewOverlayErrorBoundary>
          <PRViewOverlayPanel />
        </PRViewOverlayErrorBoundary>
      </FileChangeProvider>
    </PRViewOverlayProvider>
  );
}
