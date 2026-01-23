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
 * - Main content area on the right (SidebarInset)
 * - Responsive layout that adjusts when sidebar collapses
 * - Shared layout applied via route group
 *
 * Usage:
 * Wrap page content in DashboardShell to include sidebar:
 * ```tsx
 * <DashboardShell>
 *   <YourPageContent />
 * </DashboardShell>
 * ```
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <SidebarInset>
          <main className="flex-1 p-6">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
