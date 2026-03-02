'use client';

import { DashboardSidebar } from '@/components/dashboard-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import type { ReactNode } from 'react';

/**
 * DashboardShell
 *
 * Layout container that wraps all dashboard pages with sidebar navigation.
 * Uses shadcn SidebarProvider to manage sidebar state.
 *
 * Features:
 * - Sidebar navigation on the left
 * - Optional top bar slot above main content (Plan 059 Phase 3)
 * - Main content area on the right (SidebarInset)
 * - Responsive layout that adjusts when sidebar collapses
 *
 * Usage:
 * ```tsx
 * <DashboardShell topBar={<AgentChipBar />}>
 *   <YourPageContent />
 * </DashboardShell>
 * ```
 */
export function DashboardShell({ children, topBar }: { children: ReactNode; topBar?: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <DashboardSidebar />
        <SidebarInset>
          {topBar && <div className="shrink-0">{topBar}</div>}
          <main className="flex-1 overflow-hidden min-w-0">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
