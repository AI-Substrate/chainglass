'use client';

/**
 * Activity Log Overlay Wrapper — mounts provider + panel in workspace layout.
 *
 * Mirrors terminal-overlay-wrapper.tsx pattern:
 * - Dynamic import for panel (SSR: false)
 * - Error boundary wraps panel only (not provider)
 * - Provider is pure context — safe to always mount
 *
 * Plan 065: Worktree Activity Log — Phase 3
 */

import dynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';
import {
  ActivityLogOverlayProvider,
  useActivityLogOverlay,
} from '../../../../src/features/065-activity-log/hooks/use-activity-log-overlay';
import { useActivityLogToasts } from '../../../../src/features/065-activity-log/hooks/use-activity-log-toasts';

const ActivityLogOverlayPanel = dynamic(
  () =>
    import('../../../../src/features/065-activity-log/components/activity-log-overlay-panel').then(
      (m) => m.ActivityLogOverlayPanel
    ),
  { ssr: false }
);

class ActivityLogOverlayErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return null; // Silently hide overlay on error — workspace pages keep working
    }
    return this.props.children;
  }
}

interface ActivityLogOverlayWrapperProps {
  children: ReactNode;
  defaultWorktreePath?: string;
}

/** Bridge component inside provider to access overlay context for toasts */
function ActivityLogToastBridge() {
  const { isOpen, worktreePath } = useActivityLogOverlay();
  useActivityLogToasts({ worktreePath, isOverlayOpen: isOpen });
  return null;
}

export function ActivityLogOverlayWrapper({
  children,
  defaultWorktreePath,
}: ActivityLogOverlayWrapperProps) {
  return (
    <ActivityLogOverlayProvider defaultWorktreePath={defaultWorktreePath}>
      {children}
      <ActivityLogToastBridge />
      <ActivityLogOverlayErrorBoundary>
        <ActivityLogOverlayPanel />
      </ActivityLogOverlayErrorBoundary>
    </ActivityLogOverlayProvider>
  );
}
