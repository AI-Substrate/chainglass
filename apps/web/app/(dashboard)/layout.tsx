import { NavigationWrapper } from '@/components/navigation-wrapper';
import type { ReactNode } from 'react';

// All dashboard pages use useSearchParams (via sidebar/nav) — must be dynamic
export const dynamic = 'force-dynamic';

/**
 * Dashboard Route Group Layout
 *
 * This layout wraps all pages under the (dashboard) route group with NavigationWrapper.
 * Pages include: /, /workflow, /kanban
 *
 * NavigationWrapper switches between:
 * - Phone (<768px): BottomTabBar navigation
 * - Tablet/Desktop (>=768px): DashboardShell with sidebar
 *
 * The route group pattern (dashboard) creates a folder for organization
 * without affecting the URL structure.
 *
 * @see Phase 7: Mobile Templates & Documentation
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <NavigationWrapper>{children}</NavigationWrapper>;
}
