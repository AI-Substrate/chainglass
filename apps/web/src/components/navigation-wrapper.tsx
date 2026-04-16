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

  // Phone layout: simple wrapper with bottom tab bar
  // position:fixed prevents iOS Safari from scrolling the page when keyboard opens
  // pt-[env(safe-area-inset-top)] pushes content below the iOS status bar / notch
  // pb-[env(safe-area-inset-bottom)] accounts for home indicator on notched iPhones
  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden bg-background"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      <BottomTabBar />
    </div>
  );
}
