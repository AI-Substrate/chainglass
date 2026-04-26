'use client';

import type { ReactNode } from 'react';

import { DashboardShell } from '@/components/dashboard-shell';
import { BottomTabBar } from '@/components/navigation';
import { useResponsive } from '@/hooks/useResponsive';

/**
 * NavigationWrapper
 *
 * Switches between navigation paradigms based on viewport:
 * - Phone (<768px): BottomTabBar with simple main content wrapper
 * - Tablet/Desktop (>=768px): DashboardShell with sidebar
 *
 * This provides clean separation between phone and desktop navigation
 * without rendering both components simultaneously.
 *
 * @see Phase 7: Mobile Templates & Documentation
 */
export function NavigationWrapper({ children }: { children: ReactNode }) {
  const { useMobilePatterns } = useResponsive();

  // During SSR or hydration (deviceType undefined), default to desktop layout
  // This matches the server snapshot which defaults to isDesktop: true
  if (!useMobilePatterns) {
    return <DashboardShell>{children}</DashboardShell>;
  }

  // Phone layout: fixed positioning prevents iOS Safari from scrolling
  // the page when keyboard opens on terminal/workspace pages.
  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden bg-background"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <main className="flex-1 min-h-0 overflow-auto">{children}</main>
      <BottomTabBar />
    </div>
  );
}
