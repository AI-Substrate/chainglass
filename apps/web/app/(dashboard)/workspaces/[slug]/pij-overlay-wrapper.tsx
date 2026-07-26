'use client';

/**
 * pij overlay wrapper — mounts provider + panel in the workspace layout.
 *
 * The fifth F-14 sibling, mirroring `pr-view-overlay-wrapper.tsx`:
 * - the provider is pure context and is ALWAYS mounted, so the open/closed flag survives navigation
 * - the panel is a `dynamic(ssr: false)` import, because it measures the DOM anchor on mount
 * - the ErrorBoundary wraps the panel ONLY, and renders `null` — a panel that fails to load must not
 *   take the workspace page down with it, and a broken quick-glance surface is better absent than
 *   half-drawn
 *
 * Plan 089 Phase 4 (T003).
 */

import nextDynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';
import { PijOverlayProvider } from '../../../../src/features/089-first-class-pij/hooks/use-pij-overlay';

const PijOverlayPanel = nextDynamic(
  () =>
    import('../../../../src/features/089-first-class-pij/components/pij-overlay-panel').then(
      (m) => m.PijOverlayPanel
    ),
  { ssr: false }
);

class PijOverlayErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
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

interface PijOverlayWrapperProps {
  children: ReactNode;
  defaultWorkspacePath?: string;
}

export function PijOverlayWrapper({ children, defaultWorkspacePath }: PijOverlayWrapperProps) {
  return (
    <PijOverlayProvider defaultWorkspacePath={defaultWorkspacePath}>
      {children}
      <PijOverlayErrorBoundary>
        <PijOverlayPanel />
      </PijOverlayErrorBoundary>
    </PijOverlayProvider>
  );
}
