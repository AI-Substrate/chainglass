'use client';

/**
 * Notes Overlay Wrapper — mounts provider + panel in workspace layout.
 *
 * Mirrors terminal-overlay-wrapper.tsx / activity-log-overlay-wrapper.tsx:
 * - Dynamic import for panel (SSR: false — requires DOM for anchor measurement)
 * - Error boundary wraps panel only (not provider)
 * - Provider is pure context — safe to always mount
 *
 * Plan 071: PR View & File Notes — Phase 2, T009
 */

import nextDynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';
import { NotesOverlayProvider } from '../../../../src/features/071-file-notes/hooks/use-notes-overlay';

const NotesOverlayPanel = nextDynamic(
  () =>
    import('../../../../src/features/071-file-notes/components/notes-overlay-panel').then(
      (m) => m.NotesOverlayPanel
    ),
  { ssr: false }
);

class NotesOverlayErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
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

interface NotesOverlayWrapperProps {
  children: ReactNode;
  defaultWorktreePath?: string;
}

export function NotesOverlayWrapper({ children, defaultWorktreePath }: NotesOverlayWrapperProps) {
  return (
    <NotesOverlayProvider defaultWorktreePath={defaultWorktreePath}>
      {children}
      <NotesOverlayErrorBoundary>
        <NotesOverlayPanel />
      </NotesOverlayErrorBoundary>
    </NotesOverlayProvider>
  );
}
