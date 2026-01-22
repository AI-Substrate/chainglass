import { DashboardShell } from '@/components/dashboard-shell';
import type { ReactNode } from 'react';

/**
 * Dashboard Route Group Layout
 *
 * This layout wraps all pages under the (dashboard) route group with the DashboardShell.
 * Pages include: /, /workflow, /kanban
 *
 * The route group pattern (dashboard) creates a folder for organization
 * without affecting the URL structure.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
