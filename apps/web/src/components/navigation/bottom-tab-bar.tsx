'use client';

import { useResponsive } from '@/hooks/useResponsive';
import { MOBILE_NAV_ITEMS } from '@/lib/navigation-utils';
import { cn } from '@/lib/utils';
import { usePathname, useRouter } from 'next/navigation';

/**
 * BottomTabBar
 *
 * Mobile-only navigation component that provides a fixed bottom tab bar
 * for phone-sized viewports. Renders only when useMobilePatterns is true
 * (viewport < 768px).
 *
 * Features:
 * - Fixed positioning at bottom of screen
 * - 48px minimum touch targets (AC-46)
 * - Active state indication via aria-selected
 * - 3 core navigation items (Home, Workflow, Kanban)
 * - ARIA tablist/tab roles for accessibility
 *
 * @see Phase 7: Mobile Templates & Documentation
 */
export function BottomTabBar() {
  const { useMobilePatterns } = useResponsive();
  const pathname = usePathname();
  const router = useRouter();

  // Only render on phone viewports
  if (!useMobilePatterns) {
    return null;
  }

  const handleTabClick = (href: string) => {
    // Don't navigate if already on this route
    if (pathname === href) {
      return;
    }
    router.push(href);
  };

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 w-full',
        'bg-background border-t border-border',
        'safe-area-inset-bottom',
        'z-50'
      )}
    >
      <div
        role="tablist"
        className={cn('flex items-center justify-around', 'h-16 px-2')}
        aria-label="Mobile navigation"
      >
        {MOBILE_NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => handleTabClick(item.href)}
              className={cn(
                // Touch target sizing (48px minimum)
                'min-h-12 min-w-12',
                // Layout
                'flex flex-col items-center justify-center',
                'flex-1 py-2 px-1',
                // Base styling
                'rounded-lg transition-colors',
                // Interactive states
                'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                // Active/inactive styling
                isActive
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5 mb-1" aria-hidden="true" />
              <span className="text-xs truncate max-w-full">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
