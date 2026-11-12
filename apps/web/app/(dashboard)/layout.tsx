import { NavigationWrapper } from '@/components/navigation-wrapper';
import { AuthProvider } from '@/features/063-login/components/auth-provider';
import { type ReactNode, Suspense } from 'react';

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
 * The whole tree renders on the server (AuthProvider is not client-only). The Suspense
 * boundary lets the shell (sidebar, nav) stream and paint before the page's server data
 * (git, workspace registry) resolves; the page content streams into the same response.
 *
 * @see Phase 7: Mobile Templates & Documentation
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <NavigationWrapper>
        <Suspense>{children}</Suspense>
      </NavigationWrapper>
    </AuthProvider>
  );
}
