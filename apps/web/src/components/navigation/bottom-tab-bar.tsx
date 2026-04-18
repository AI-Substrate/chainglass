'use client';

import { PasteUploadModal } from '@/features/041-file-browser/components/paste-upload-modal';
import { useResponsive } from '@/hooks/useResponsive';
import { LANDING_NAV_ITEMS } from '@/lib/navigation-utils';
import { cn } from '@/lib/utils';
import { workspaceHref } from '@/lib/workspace-url';
import { FolderOpen, Home, LayoutGrid, Upload } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);

  // Only render on phone viewports
  if (!useMobilePatterns) {
    return null;
  }

  // Detect workspace context from URL
  const workspaceSlug = pathname.match(/^\/workspaces\/([^/]+)/)?.[1] ?? null;
  const isInWorkspace = workspaceSlug != null;
  const currentWorktree = searchParams.get('worktree');

  const navItems = isInWorkspace
    ? currentWorktree
      ? [
          {
            id: 'browser',
            label: 'Browse',
            href: workspaceHref(workspaceSlug, '/browser', {
              worktree: currentWorktree,
            }),
            icon: FolderOpen,
          },
          {
            id: 'home',
            label: 'Home',
            href: `/workspaces/${workspaceSlug}`,
            icon: Home,
          },
          {
            id: 'workspaces',
            label: 'Workspaces',
            href: '/',
            icon: LayoutGrid,
          },
          {
            id: 'upload',
            label: 'Upload',
            href: '__upload__', // handled specially in click handler
            icon: Upload,
          },
        ]
      : LANDING_NAV_ITEMS
    : LANDING_NAV_ITEMS;

  const handleTabClick = (href: string, itemId: string) => {
    if (itemId === 'upload') {
      setUploadOpen(true);
      return;
    }
    const targetPath = href.split('?')[0];
    if (pathname === targetPath && !href.includes('mobileView')) {
      return;
    }
    router.push(href);
  };

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 w-full',
        'bg-background border-t border-border',
        'z-50'
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        role="tablist"
        className={cn('flex items-center justify-around', 'h-16 px-2')}
        aria-label="Mobile navigation"
      >
        {navItems.map((item) => {
          const itemPathname = item.href.split('?')[0];
          const isActive =
            item.id === 'upload'
              ? false
              : pathname === itemPathname || pathname.startsWith(`${itemPathname}/`);
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => handleTabClick(item.href, item.id)}
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
      {workspaceSlug && currentWorktree && (
        <PasteUploadModal
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          slug={workspaceSlug}
          worktreePath={currentWorktree}
        />
      )}
    </nav>
  );
}
