'use client';

/**
 * Plan 067 Phase 5: Question Popper — Overlay Wrapper
 *
 * Mounts provider + indicator + panel + notification bridge in workspace layout.
 *
 * Follows ActivityLogOverlayWrapper pattern:
 * - Provider always mounted (pure context)
 * - Panel wrapped in error boundary + dynamic import (SSR: false)
 * - Toast/desktop bridge as invisible component inside provider
 * - Indicator rendered with fixed positioning
 *
 * AC-19: Overlay participates in mutual exclusion
 */

import dynamic from 'next/dynamic';
import { Component, type ReactNode, useEffect, useRef } from 'react';

import { QuestionPopperIndicator } from '../../../../src/features/067-question-popper/components/question-popper-indicator';
import {
  QuestionPopperProvider,
  isAlertItem,
  isQuestionItem,
  useQuestionPopper,
} from '../../../../src/features/067-question-popper/hooks/use-question-popper';
import {
  requestNotificationPermission,
  sendDesktopNotification,
  toastNewAlert,
  toastNewQuestion,
} from '../../../../src/features/067-question-popper/lib/desktop-notifications';

const QuestionPopperOverlayPanel = dynamic(
  () =>
    import(
      '../../../../src/features/067-question-popper/components/question-popper-overlay-panel'
    ).then((m) => m.QuestionPopperOverlayPanel),
  { ssr: false }
);

// ── Error Boundary ──

class QuestionPopperErrorBoundary extends Component<
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

// ── Notification Bridge ──

/**
 * Invisible component inside provider that watches for new items
 * and triggers toast + desktop notifications.
 *
 * Uses item count tracking to detect new arrivals (not SSE directly,
 * since the hook already handles SSE → refetch). When items increase,
 * the newest items trigger notifications.
 */
function QuestionPopperNotificationBridge() {
  const { items, isOverlayOpen } = useQuestionPopper();
  const prevItemIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const permissionRequestedRef = useRef(false);

  useEffect(() => {
    // Build current ID set
    const currentIds = new Set(
      items.map((item) => (isQuestionItem(item) ? item.questionId : item.alertId))
    );

    // Skip first render (don't toast on page load)
    if (!initializedRef.current) {
      prevItemIdsRef.current = currentIds;
      initializedRef.current = true;
      return;
    }

    // Find new items (IDs that weren't in previous set)
    const newItems = items.filter((item) => {
      const id = isQuestionItem(item) ? item.questionId : item.alertId;
      return !prevItemIdsRef.current.has(id);
    });
    prevItemIdsRef.current = currentIds;

    if (newItems.length === 0) return;

    // Don't toast if overlay is already open (user can see items directly)
    if (isOverlayOpen) return;

    // Request notification permission on first new item
    if (!permissionRequestedRef.current) {
      permissionRequestedRef.current = true;
      requestNotificationPermission();
    }

    // Toast + desktop notification for each new item
    for (const item of newItems) {
      if (isQuestionItem(item)) {
        toastNewQuestion(item.source, item.question.text);
        sendDesktopNotification(`Question from ${item.source}`, item.question.text);
      } else if (isAlertItem(item)) {
        toastNewAlert(item.source, item.alert.text);
        sendDesktopNotification(`Alert from ${item.source}`, item.alert.text);
      }
    }
  }, [items, isOverlayOpen]);

  return null;
}

// ── Wrapper ──

interface QuestionPopperOverlayWrapperProps {
  children: ReactNode;
}

export function QuestionPopperOverlayWrapper({ children }: QuestionPopperOverlayWrapperProps) {
  return (
    <QuestionPopperProvider>
      {children}
      <QuestionPopperNotificationBridge />
      {/* Indicator — fixed position top-right */}
      <div className="fixed right-4 top-4 z-50">
        <QuestionPopperIndicator />
      </div>
      {/* Panel — dynamic import with error boundary */}
      <QuestionPopperErrorBoundary>
        <QuestionPopperOverlayPanel />
      </QuestionPopperErrorBoundary>
    </QuestionPopperProvider>
  );
}
